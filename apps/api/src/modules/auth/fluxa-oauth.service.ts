import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { EncryptionService, ENCRYPTION_PURPOSES } from '../../common/encryption.service';
import type { FluxaAccount, IssueSessionContext, SessionTokens } from './auth.types';
import { FluxaDto } from './dto/fluxa.dto';
import { ConnectedAccount, ConnectedProvider } from './entities/connected-account.entity';
import { User } from './entities/user.entity';
import { SessionService } from './session.service';

const HKDF_INFO_CONNECTED = ENCRYPTION_PURPOSES.CONNECTED_ACCOUNT;

/** Fluxa integration: legacy API-key link, OAuth connect flow, connected-account management. */
@Injectable()
export class FluxaOAuthService {
  private readonly logger = new Logger(FluxaOAuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(ConnectedAccount)
    private readonly connectedAccountsRepository: Repository<ConnectedAccount>,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly sessionService: SessionService,
  ) {}

  // ─── Legacy Fluxa API-key link (direct key exchange) ─────────────────────

  async fluxaLink(
    dto: FluxaDto,
    currentUser?: User,
    ctx: IssueSessionContext = {},
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
      throw new ConflictException(
        'This Fluxa account is already linked to another user',
      );
    }

    let user: User;

    if (currentUser) {
      // Authenticated linking: only the signed-in account may be attached, and
      // attaching a new Fluxa tenant requires explicit re-confirmation. An
      // email match must never select or mutate an existing account.
      if (!existingTenantUser && !dto.confirmLink) {
        throw new BadRequestException(
          'Linking a Fluxa tenant to your account requires explicit confirmation',
        );
      }
      user = currentUser;
    } else if (existingTenantUser) {
      // Unauthenticated return login is only permitted for a tenant that is
      // already explicitly linked to an account.
      user = existingTenantUser;
    } else {
      // Unauthenticated signup: create a brand-new account. If the Fluxa
      // email belongs to an existing local account, refuse instead of
      // selecting or mutating it — the owner must sign in and link Fluxa
      // from their settings with explicit confirmation.
      const emailOwner = await this.usersRepository.findOne({
        where: { email: fluxaAccount.email.toLowerCase() },
      });
      if (emailOwner) {
        throw new ConflictException(
          'An account with this email already exists. Sign in and link Fluxa from your settings.',
        );
      }
      user = this.usersRepository.create({
        email: fluxaAccount.email.toLowerCase(),
        passwordHash: null,
        fluxaTenantId: fluxaAccount.tenantId,
        emailVerified: true, // SSO-linked accounts are considered verified
      });
    }

    user.fluxaTenantId = fluxaAccount.tenantId;
    if (!user.email) user.email = fluxaAccount.email.toLowerCase();

    await this.usersRepository.save(user);
    const tokens = await this.sessionService.issueSession(user, ctx);
    return { user, tokens };
  }

  // ─── Connected accounts (OAuth-style flow) ────────────────────────────────

  /**
   * Begin the Fluxa OAuth connection flow.
   * Generates a state nonce stored in Redis, returns the redirect URL.
   * In-memory fallback used when Redis is not available (dev only).
   */
  async beginFluxaConnect(
    userId: string,
    redisClient: { set: (key: string, value: string, options: { EX: number }) => Promise<unknown> },
  ): Promise<{ redirectUrl: string }> {
    const nonce = randomBytes(24).toString('hex');
    const key = `fluxa_oauth_nonce:${nonce}`;
    await redisClient.set(key, userId, { EX: 600 }); // 10-minute TTL

    const fluxaAuthUrl = this.configService.get<string>('FLUXA_AUTH_URL');
    const clientId = this.configService.get<string>('FLUXA_CLIENT_ID');
    const callbackUrl =
      this.configService.get<string>('FLUXA_CALLBACK_URL') ??
      `${this.configService.get<string>('WEB_ORIGIN', 'http://localhost:3000')}/auth/fluxa`;

    if (!fluxaAuthUrl || !clientId) {
      // Dev / stub mode — return a placeholder
      return {
        redirectUrl: `/auth/fluxa?stub=true&state=${nonce}`,
      };
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: callbackUrl,
      state: nonce,
    });

    return { redirectUrl: `${fluxaAuthUrl}?${params.toString()}` };
  }

  async completeFluxaConnect(
    code: string,
    state: string,
    redisClient: {
      get: (key: string) => Promise<string | null>;
      del: (key: string) => Promise<unknown>;
    },
  ): Promise<ConnectedAccount> {
    const key = `fluxa_oauth_nonce:${state}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
    await redisClient.del(key);

    // Exchange code for API key / access token
    const accessToken = await this.exchangeFluxaCode(code);

    // Remove existing Fluxa connected account if present
    await this.connectedAccountsRepository.delete({
      userId,
      provider: ConnectedProvider.FLUXA,
    });

    const { encrypted, iv, authTag } = this.encryptionService.encryptForUser(
      userId,
      accessToken,
      HKDF_INFO_CONNECTED,
    );

    const account = this.connectedAccountsRepository.create({
      userId,
      provider: ConnectedProvider.FLUXA,
      encryptedKey: encrypted,
      iv,
      authTag,
      expiresAt: null,
    });

    return this.connectedAccountsRepository.save(account);
  }

  async listConnectedAccounts(
    userId: string,
  ): Promise<Array<{ id: string; provider: string; connectedAt: Date }>> {
    const accounts = await this.connectedAccountsRepository.find({
      where: { userId },
      order: { connectedAt: 'DESC' },
    });
    return accounts.map((a) => ({
      id: a.id,
      provider: a.provider,
      connectedAt: a.connectedAt,
    }));
  }

  async disconnectProvider(userId: string, provider: string): Promise<void> {
    const result = await this.connectedAccountsRepository.delete({
      userId,
      provider: provider as ConnectedProvider,
    });
    if (!result.affected) {
      throw new NotFoundException(`No connected account found for provider: ${provider}`);
    }
  }

  // ─── Fluxa HTTP calls ─────────────────────────────────────────────────────

  private async exchangeFluxaCode(code: string): Promise<string> {
    const fluxaTokenUrl = this.configService.get<string>('FLUXA_TOKEN_URL');
    const clientId = this.configService.get<string>('FLUXA_CLIENT_ID');
    const clientSecret = this.configService.get<string>('FLUXA_CLIENT_SECRET');
    const callbackUrl =
      this.configService.get<string>('FLUXA_CALLBACK_URL') ??
      `${this.configService.get<string>('WEB_ORIGIN', 'http://localhost:3000')}/auth/fluxa`;

    if (!fluxaTokenUrl || !clientId || !clientSecret) {
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        // Fail closed: never treat an OAuth code as a token in production.
        throw new ServiceUnavailableException(
          'Fluxa OAuth token exchange is not configured',
        );
      }
      // Dev stub: treat the code itself as the API key
      this.logger.warn('[fluxa-oauth] Token exchange not configured, using code as stub key');
      return code;
    }

    const response = await fetch(fluxaTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
      }),
    });

    if (!response.ok) {
      throw new BadRequestException('Failed to exchange Fluxa OAuth code');
    }

    const data = (await response.json()) as {
      access_token?: string;
      api_key?: string;
    };

    const key = data.access_token ?? data.api_key;
    if (!key) {
      throw new BadRequestException('Fluxa token response did not contain an access token');
    }

    return key;
  }

  private async validateFluxaApiKey(apiKey: string): Promise<FluxaAccount> {
    const fluxaApiUrl = this.configService.get<string>('FLUXA_API_URL');

    if (!fluxaApiUrl) {
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw new UnauthorizedException('Fluxa integration is not configured');
      }
      const mockTenantId = createHash('sha256')
        .update(apiKey)
        .digest('hex')
        .slice(0, 16);
      return {
        tenantId: `fluxa_${mockTenantId}`,
        email: `fluxa-${mockTenantId}@savitools.local`,
      };
    }

    const response = await fetch(
      `${fluxaApiUrl.replace(/\/$/, '')}/v1/account`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      },
    );

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
