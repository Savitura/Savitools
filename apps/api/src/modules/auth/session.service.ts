import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from './auth.constants';
import type { IssueSessionContext, SessionTokens } from './auth.types';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from './entities/user.entity';

/**
 * Mints access/refresh token pairs. Extracted from AuthService because every
 * sign-in path (password, email verification, refresh rotation, passkey, Fluxa
 * link) ends here, and the sub-services must not depend on each other.
 */
@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async issueSession(
    user: User,
    ctx: IssueSessionContext,
    familyId?: string,
  ): Promise<SessionTokens> {
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, emailVerified: user.emailVerified },
      {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    const refreshToken = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

    await this.refreshTokensRepository.save(
      this.refreshTokensRepository.create({
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        familyId: familyId ?? randomUUID(),
        revokedAt: null,
        expiresAt,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      }),
    );

    return { accessToken, refreshToken };
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
