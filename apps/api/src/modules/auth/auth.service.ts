import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { Resend } from 'resend';
import { IsNull, Repository } from 'typeorm';
import {
  EMAIL_VERIFICATION_TTL_SECONDS,
  PASSWORD_RESET_MAX_PER_EMAIL,
  PASSWORD_RESET_MAX_PER_IP,
  PASSWORD_RESET_TTL_SECONDS,
  PASSWORD_RESET_WINDOW_MS,
  REFRESH_TOKEN_REUSE_GRACE_MS,
} from './auth.constants';
import type { IssueSessionContext, SessionTokens } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from './entities/user.entity';
import { SessionService } from './session.service';

// Re-exported so existing `import { SessionTokens } from './auth.service'` sites keep compiling.
export type { FluxaAccount, IssueSessionContext, SessionTokens } from './auth.types';

/**
 * Core authentication: email/password, email verification, password reset,
 * refresh-token rotation and session management.
 *
 * Passkeys     → PasskeyAuthService
 * Fluxa OAuth  → FluxaOAuthService
 * Vault keys   → VaultKeyService
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly resend: Resend | null;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
  ) {
    const resendKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = resendKey ? new Resend(resendKey) : null;
  }

  // ─── Registration & email verification ────────────────────────────────────

  async register(dto: RegisterDto): Promise<{ userId: string; message: string }> {
    const existing = await this.usersRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 65536,  // 64 MiB
      timeCost: 3,
      parallelism: 4,
    });

    const verificationToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(verificationToken).digest('hex');
    const verificationExpiresAt = new Date(
      Date.now() + EMAIL_VERIFICATION_TTL_SECONDS * 1000,
    );

    const user = this.usersRepository.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      emailVerified: false,
      emailVerificationToken: tokenHash,
      emailVerificationExpiresAt: verificationExpiresAt,
    });

    await this.usersRepository.save(user);

    try {
      await this.sendVerificationEmail(user.email, verificationToken);
    } catch (error) {
      await this.usersRepository.remove(user).catch(() => {});
      throw error;
    }

    return { userId: user.id, message: 'Check your email to verify your account.' };
  }

  async verifyEmail(token: string): Promise<{ user: User; tokens: SessionTokens }> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const user = await this.usersRepository.findOne({
      where: { emailVerificationToken: tokenHash },
    });

    if (!user) {
      throw new NotFoundException('Verification token is invalid');
    }

    if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
      throw new GoneException('TOKEN_EXPIRED');
    }

    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpiresAt = null;
    await this.usersRepository.save(user);

    const tokens = await this.sessionService.issueSession(user, {});
    return { user, tokens };
  }

  // ─── Password reset (Savitura/Savitools#196) ───────────────────────────────

  /** Generic response — identical whether or not the account exists, so the
   *  endpoint cannot be used to enumerate registered emails. */
  private static readonly PASSWORD_RESET_GENERIC_MESSAGE =
    'If an account with that email exists, we have sent a link to reset your password.';

  /**
   * Sliding-window in-memory rate limiter keyed per process. Keyed by IP and
   * by email so neither can be flooded indefinitely.
   */
  private readonly rateLimitBuckets = new Map<string, number[]>();

  private isRateLimited(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const hits = (this.rateLimitBuckets.get(key) ?? []).filter(
      (timestamp) => now - timestamp < windowMs,
    );
    if (hits.length >= limit) {
      this.rateLimitBuckets.set(key, hits);
      return true;
    }
    hits.push(now);
    this.rateLimitBuckets.set(key, hits);
    if (this.rateLimitBuckets.size > 10_000) {
      // Opportunistic cleanup to keep the map bounded.
      for (const [k, timestamps] of this.rateLimitBuckets) {
        if (timestamps.every((timestamp) => now - timestamp >= windowMs)) {
          this.rateLimitBuckets.delete(k);
        }
      }
    }
    return false;
  }

  async requestPasswordReset(
    email: string,
    ipAddress?: string,
  ): Promise<{ message: string }> {
    const normalized = email.trim().toLowerCase();

    if (
      this.isRateLimited(
        `pwreset:ip:${ipAddress ?? 'unknown'}`,
        PASSWORD_RESET_MAX_PER_IP,
        PASSWORD_RESET_WINDOW_MS,
      ) ||
      this.isRateLimited(
        `pwreset:email:${normalized}`,
        PASSWORD_RESET_MAX_PER_EMAIL,
        PASSWORD_RESET_WINDOW_MS,
      )
    ) {
      // Same generic response as a success — no signal for enumeration or abuse.
      return { message: AuthService.PASSWORD_RESET_GENERIC_MESSAGE };
    }

    const user = await this.usersRepository.findOne({
      where: { email: normalized },
    });

    if (!user?.passwordHash) {
      return { message: AuthService.PASSWORD_RESET_GENERIC_MESSAGE };
    }

    const resetToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetToken = tokenHash;
    user.passwordResetExpiresAt = new Date(
      Date.now() + PASSWORD_RESET_TTL_SECONDS * 1000,
    );
    await this.usersRepository.save(user);

    try {
      await this.sendPasswordResetEmail(user.email, resetToken);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${normalized}: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }

    return { message: AuthService.PASSWORD_RESET_GENERIC_MESSAGE };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const user = await this.usersRepository.findOne({
      where: { passwordResetToken: tokenHash },
    });

    if (!user) {
      throw new NotFoundException('Reset token is invalid');
    }

    if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() <= Date.now()) {
      throw new GoneException('RESET_TOKEN_EXPIRED');
    }

    // Single-use: clear the token before persisting the new password so a
    // replay of the same token finds no matching row.
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;
    user.passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,  // 64 MiB
      timeCost: 3,
      parallelism: 4,
    });
    await this.usersRepository.save(user);

    // Revoke every active refresh-token family for this user so any stolen
    // session dies with the password change.
    await this.refreshTokensRepository.update(
      { userId: user.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    return { message: 'Password updated. You can now sign in with your new password.' };
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  async login(
    dto: LoginDto,
    ctx: IssueSessionContext = {},
  ): Promise<{ user: User; tokens: SessionTokens }> {
    const user = await this.usersRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.sessionService.issueSession(user, ctx);
    return { user, tokens };
  }

  // ─── Token rotation ─────────────────────────────────────────────────────────

  async refresh(
    rawRefreshToken: string,
    ctx: IssueSessionContext = {},
  ): Promise<{ user: User; tokens: SessionTokens }> {
    const tokenHash = this.sessionService.hashToken(rawRefreshToken);
    const stored = await this.refreshTokensRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!stored || stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('INVALID_REFRESH_TOKEN');
    }

    // Atomically consume the token: flips revoked_at from NULL -> now() only
    // if it is still NULL. The database serializes concurrent UPDATEs
    // against the same row, so under a race exactly one caller can win this
    // — the other gets affected === 0, indistinguishable from (and handled
    // the same as) a replay of an already-used token.
    const claim = await this.refreshTokensRepository.update(
      { id: stored.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    if (claim.affected !== 1) {
      const latest = await this.refreshTokensRepository.findOne({
        where: { id: stored.id },
      });
      const consumedAt = latest?.revokedAt?.getTime();
      const now = Date.now();
      const withinGrace =
        consumedAt !== undefined &&
        consumedAt <= now &&
        now - consumedAt <= REFRESH_TOKEN_REUSE_GRACE_MS;

      if (!withinGrace) {
        this.logger.warn(`Refresh token reuse detected for family ${stored.familyId}`);
        await this.refreshTokensRepository.update(
          { familyId: stored.familyId },
          { revokedAt: new Date() },
        );
      }
      throw new UnauthorizedException('INVALID_REFRESH_TOKEN');
    }

    const tokens = await this.sessionService.issueSession(stored.user, ctx, stored.familyId);
    return { user: stored.user, tokens };
  }

  async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) return;
    const tokenHash = this.sessionService.hashToken(rawRefreshToken);
    await this.refreshTokensRepository.delete({ tokenHash });
  }

  // ─── Session management ────────────────────────────────────────────────────

  async listSessions(userId: string): Promise<RefreshToken[]> {
    return this.refreshTokensRepository.find({
      where: { userId, revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const token = await this.refreshTokensRepository.findOne({
      where: { id: sessionId, userId },
    });
    if (!token) {
      throw new NotFoundException('Session not found');
    }
    await this.refreshTokensRepository.delete(sessionId);
  }

  // ─── Misc helpers ─────────────────────────────────────────────────────────

  async getUserById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  // ─── Email delivery ───────────────────────────────────────────────────────

  private async sendVerificationEmail(
    email: string,
    token: string,
  ): Promise<void> {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const webOrigin = this.configService.get<string>(
      'WEB_ORIGIN',
      'http://localhost:3000',
    );
    const verifyUrl = `${webOrigin}/verify-email?token=${token}`;
    const fromAddress = this.configService.get<string>(
      'RESEND_FROM_EMAIL',
      'SaviTools <noreply@savitools.dev>',
    );

    if (!this.resend) {
      if (isProduction) {
        throw new ServiceUnavailableException('Email delivery is unavailable');
      }
      this.logger.warn(
        '[email] RESEND_API_KEY not configured. Verification email was not sent.',
      );
      return;
    }

    try {
      await this.resend.emails.send({
        from: fromAddress,
        to: email,
        subject: 'Verify your SaviTools email',
        html: `
          <p>Welcome to SaviTools!</p>
          <p>Click the link below to verify your email address. It expires in 24 hours.</p>
          <p><a href="${verifyUrl}">${verifyUrl}</a></p>
          <p>If you did not create an account, you can safely ignore this email.</p>
        `,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${email}: ${error instanceof Error ? error.message : error}`,
      );
      if (isProduction) {
        throw new ServiceUnavailableException('Failed to deliver verification email');
      }
    }
  }

  /** Send the single-use password reset link. Mirrors the verification email. */
  private async sendPasswordResetEmail(
    email: string,
    token: string,
  ): Promise<void> {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const webOrigin = this.configService.get<string>(
      'WEB_ORIGIN',
      'http://localhost:3000',
    );
    const resetUrl = `${webOrigin}/reset-password?token=${token}`;
    const fromAddress = this.configService.get<string>(
      'RESEND_FROM_EMAIL',
      'SaviTools <noreply@savitools.dev>',
    );

    if (!this.resend) {
      if (isProduction) {
        throw new ServiceUnavailableException('Email delivery is unavailable');
      }
      this.logger.warn(
        '[email] RESEND_API_KEY not configured. Password reset email was not sent.',
      );
      return;
    }

    try {
      await this.resend.emails.send({
        from: fromAddress,
        to: email,
        subject: 'Reset your SaviTools password',
        html: `
          <p>A password reset was requested for your SaviTools account.</p>
          <p>Click the link below to choose a new password. It expires in 30 minutes and can only be used once.</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>If you did not request this, you can safely ignore this email.</p>
        `,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${email}: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }
}
