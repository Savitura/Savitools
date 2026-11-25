import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { EncryptionService } from '../../common/encryption.service';
import { FluxaOAuthService } from './fluxa-oauth.service';
import { SessionService } from './session.service';
import { mockConfig, mockJwt, mockRepo } from './testing/auth-test-helpers';

describe('FluxaOAuthService', () => {
  let service: FluxaOAuthService;
  let usersRepo: ReturnType<typeof mockRepo>;
  let connectedAccountsRepo: ReturnType<typeof mockRepo>;
  let refreshTokensRepo: ReturnType<typeof mockRepo>;
  let jwt: ReturnType<typeof mockJwt>;
  let config: ReturnType<typeof mockConfig>;

  beforeEach(() => {
    usersRepo = mockRepo();
    connectedAccountsRepo = mockRepo();
    refreshTokensRepo = mockRepo();
    jwt = mockJwt();
    config = mockConfig();

    service = new FluxaOAuthService(
      usersRepo as any,
      connectedAccountsRepo as any,
      config as any,
      new EncryptionService(config as any),
      new SessionService(refreshTokensRepo as any, jwt as any, config as any),
    );
  });

  // ─── fluxaLink (Fluxa SSO) ─────────────────────────────────────────────────

  describe('fluxaLink', () => {
    const fluxaApiKey = 'flx_valid-key';
    const fluxaEmail = (tenantId: string) => `fluxa-${tenantId}@savitools.local`;

    const tenantIdFor = (apiKey: string) => {
      const hash = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
      return `fluxa_${hash}`;
    };

    const fluxaDto = (apiKey: string, confirmLink?: boolean) => ({
      apiKey,
      ...(confirmLink === undefined ? {} : { confirmLink }),
    });

    /**
     * Stateful users repo mirroring the unique fluxa_tenant_id / email
     * constraints, so repeated fluxaLink calls exercise the same paths a
     * real database would (return login, idempotent relink).
     */
    const withFakeUsersTable = (seed: Array<Record<string, unknown>> = []) => {
      const rows = new Map<string, Record<string, unknown>>();
      for (const row of seed) {
        if (row.email) rows.set(`email:${row.email}`, row);
        if (row.fluxaTenantId) rows.set(`tenant:${row.fluxaTenantId}`, row);
      }
      let counter = 0;
      usersRepo.findOne.mockImplementation(
        async ({ where }: { where: Record<string, unknown> }) => {
          if (where.fluxaTenantId) return rows.get(`tenant:${where.fluxaTenantId}`) ?? null;
          if (where.email) return rows.get(`email:${where.email}`) ?? null;
          return null;
        },
      );
      usersRepo.create.mockImplementation((dto: Record<string, unknown>) => ({
        id: `new-user-${++counter}`,
        ...dto,
      }));
      usersRepo.save.mockImplementation(async (entity: Record<string, unknown>) => {
        if (entity.email) rows.set(`email:${entity.email}`, entity);
        if (entity.fluxaTenantId) rows.set(`tenant:${entity.fluxaTenantId}`, entity);
        return entity;
      });
      return rows;
    };

    it('logs in an unauthenticated caller only via an already-linked tenant', async () => {
      const tenantId = tenantIdFor(fluxaApiKey);
      const linked = {
        id: 'linked-user',
        email: 'owner@example.com',
        fluxaTenantId: tenantId,
        emailVerified: true,
      };
      usersRepo.findOne.mockResolvedValue(linked);

      const { user } = await service.fluxaLink(fluxaDto(fluxaApiKey));

      expect(user.id).toBe('linked-user');
      expect(user.fluxaTenantId).toBe(tenantId);
      expect(usersRepo.save).toHaveBeenCalledTimes(1);
    });

    it('never selects or mutates an existing account solely from an email match', async () => {
      const tenantId = tenantIdFor(fluxaApiKey);
      const emailOwner = {
        id: 'email-owner',
        email: fluxaEmail(tenantId),
        fluxaTenantId: null,
      };

      withFakeUsersTable();
      usersRepo.findOne.mockImplementation(
        async ({ where }: { where: Record<string, unknown> }) => {
          if (where.fluxaTenantId) return null;
          return emailOwner;
        },
      );

      await expect(service.fluxaLink(fluxaDto(fluxaApiKey))).rejects.toThrow(
        ConflictException,
      );
      expect(usersRepo.save).not.toHaveBeenCalled();
    });

    it('requires authenticated re-confirmation before attaching a new tenant to an existing user', async () => {
      const currentUser = {
        id: 'user-a',
        email: 'user-a@example.com',
        fluxaTenantId: null,
        emailVerified: false,
      };
      withFakeUsersTable(); // no tenant user, no email owner

      await expect(
        service.fluxaLink(fluxaDto(fluxaApiKey), currentUser as any),
      ).rejects.toThrow(BadRequestException);
      expect(usersRepo.save).not.toHaveBeenCalled();

      const { user } = await service.fluxaLink(
        fluxaDto(fluxaApiKey, true),
        currentUser as any,
      );
      expect(user.id).toBe('user-a');
      expect(user.fluxaTenantId).toBe(tenantIdFor(fluxaApiKey));
      expect(usersRepo.save).toHaveBeenCalledTimes(1);
    });

    it('rejects cross-user tenant linking', async () => {
      const existingTenantUser = {
        id: 'user-b',
        email: 'user-b@example.com',
        fluxaTenantId: tenantIdFor(fluxaApiKey),
      };

      usersRepo.findOne.mockResolvedValue(existingTenantUser);

      await expect(
        service.fluxaLink(fluxaDto(fluxaApiKey), { id: 'user-a', email: 'user-a@example.com' } as any),
      ).rejects.toThrow(ConflictException);
      expect(usersRepo.save).not.toHaveBeenCalled();
    });

    it('creates a brand-new account for unauthenticated Fluxa signup', async () => {
      withFakeUsersTable(); // no tenant user, no email owner

      const { user } = await service.fluxaLink(fluxaDto(fluxaApiKey));

      expect(user.fluxaTenantId).toBe(tenantIdFor(fluxaApiKey));
      expect(user.emailVerified).toBe(true);
      expect(usersRepo.create).toHaveBeenCalledTimes(1);
    });

    it('replays the same Fluxa key onto the linked account without creating a duplicate', async () => {
      withFakeUsersTable();

      const { user: first } = await service.fluxaLink(fluxaDto(fluxaApiKey));
      const { user: second } = await service.fluxaLink(fluxaDto(fluxaApiKey));

      expect(usersRepo.create).toHaveBeenCalledTimes(1);
      expect(second.id).toBe(first.id);
      expect(second.fluxaTenantId).toBe(tenantIdFor(fluxaApiKey));
    });
  });

  describe('completeFluxaConnect', () => {
    const redisWithNonce = () => {
      let stored: string | null = 'user-1';
      return {
        get: jest.fn(async () => {
          const value = stored;
          stored = null;
          return value;
        }),
        del: jest.fn(async () => undefined),
      };
    };

    it('rejects replayed OAuth states', async () => {
      const redis = redisWithNonce();

      await service.completeFluxaConnect('auth-code', 'state-1', redis);

      await expect(
        service.completeFluxaConnect('auth-code', 'state-1', redis),
      ).rejects.toThrow(BadRequestException);
    });

    it('fails closed when production Fluxa OAuth token-exchange configuration is incomplete', async () => {
      const prodConfig = {
        getOrThrow: jest.fn((key: string) => {
          if (key === 'JWT_SECRET') return 'test-secret';
          if (key === 'ENCRYPTION_SECRET') return 'test-encryption-secret-32-bytes!!';
          throw new Error(`Missing config key: ${key}`);
        }),
        get: jest.fn((key: string, defaultValue?: unknown) => {
          if (key === 'NODE_ENV') return 'production';
          return defaultValue ?? undefined;
        }),
      };

      const prodService = new FluxaOAuthService(
        usersRepo as any,
        connectedAccountsRepo as any,
        prodConfig as any,
        new EncryptionService(prodConfig as any),
        new SessionService(refreshTokensRepo as any, jwt as any, prodConfig as any),
      );

      const redis = redisWithNonce();

      await expect(
        prodService.completeFluxaConnect('auth-code', 'state-1', redis),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(connectedAccountsRepo.save).not.toHaveBeenCalled();
    });
  });
});
