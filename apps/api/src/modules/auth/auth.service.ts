import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';
import { FluxaDto } from './dto/fluxa.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from './entities/user.entity';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface FluxaAccount {
  tenantId: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: User; tokens: SessionTokens }> {
    const existing = await this.usersRepository.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.usersRepository.create({
      email: dto.email.toLowerCase(),
      passwordHash,
    });

    await this.usersRepository.save(user);
    const tokens = await this.issueSession(user);

    return { user, tokens };
  }

  async login(dto: LoginDto): Promise<{ user: User; tokens: SessionTokens }> {
    const user = await this.usersRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.issueSession(user);
    return { user, tokens };
  }

  async refresh(rawRefreshToken: string): Promise<{ user: User; tokens: SessionTokens }> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.refreshTokensRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!stored || stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.refreshTokensRepository.delete(stored.id);

    const tokens = await this.issueSession(stored.user);
    return { user: stored.user, tokens };
  }

  async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    const tokenHash = this.hashToken(rawRefreshToken);
    await this.refreshTokensRepository.delete({ tokenHash });
  }

  async fluxaLink(
    dto: FluxaDto,
    currentUser?: User,
  ): Promise<{ user: User; tokens: SessionTokens }> {
    const fluxaAccount = await this.validateFluxaApiKey(dto.apiKey);

    const existingTenantUser = await this.usersRepository.findOne({
      where: { fluxaTenantId: fluxaAccount.tenantId },
    });

    if (
      existingTenantUser &&
      currentUser &&
      existingTenantUser.id !== currentUser.id
    ) {
      throw new ConflictException('This Fluxa account is already linked to another user');
    }

    let user =
      currentUser ??
      existingTenantUser ??
      (await this.usersRepository.findOne({
        where: { email: fluxaAccount.email.toLowerCase() },
      }));

    if (user) {
      user.fluxaTenantId = fluxaAccount.tenantId;
      if (!user.email) {
        user.email = fluxaAccount.email.toLowerCase();
      }
    } else {
      user = this.usersRepository.create({
        email: fluxaAccount.email.toLowerCase(),
        passwordHash: null,
        fluxaTenantId: fluxaAccount.tenantId,
      });
    }

    await this.usersRepository.save(user);
    const tokens = await this.issueSession(user);

    return { user, tokens };
  }

  async getUserById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  private async issueSession(user: User): Promise<SessionTokens> {
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email },
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
        expiresAt,
      }),
    );

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async validateFluxaApiKey(apiKey: string): Promise<FluxaAccount> {
    const fluxaApiUrl = this.configService.get<string>('FLUXA_API_URL');

    if (!fluxaApiUrl) {
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw new UnauthorizedException('Fluxa integration is not configured');
      }

      const mockTenantId = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
      return {
        tenantId: `fluxa_${mockTenantId}`,
        email: `fluxa-${mockTenantId}@savitools.local`,
      };
    }

    const response = await fetch(`${fluxaApiUrl.replace(/\/$/, '')}/v1/account`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException('Invalid Fluxa API key');
    }

    const payload = (await response.json()) as {
      tenant_id?: string;
      tenantId?: string;
      id?: string;
      email?: string;
    };

    const tenantId = payload.tenant_id ?? payload.tenantId ?? payload.id;
    const email = payload.email;

    if (!tenantId || !email) {
      throw new UnauthorizedException('Fluxa account response was incomplete');
    }

    return { tenantId: String(tenantId), email };
  }
}
