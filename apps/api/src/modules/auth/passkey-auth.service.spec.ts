import { UnauthorizedException } from '@nestjs/common';
import { DISCOVERABLE_CHALLENGE_OWNER } from './auth.constants';
import { PasskeyAuthService } from './passkey-auth.service';
import { SessionService } from './session.service';
import {
  hashTestPassword,
  mockConfig,
  mockJwt,
  mockRepo,
} from './testing/auth-test-helpers';

describe('PasskeyAuthService', () => {
  let service: PasskeyAuthService;
  let usersRepo: ReturnType<typeof mockRepo>;
  let passkeysRepo: ReturnType<typeof mockRepo>;
  let refreshTokensRepo: ReturnType<typeof mockRepo>;
  let jwt: ReturnType<typeof mockJwt>;
  let config: ReturnType<typeof mockConfig>;

  /** Argon2id hash of 'password123' generated once for the reauth tests */
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashTestPassword();
  });

  beforeEach(() => {
    usersRepo = mockRepo();
    passkeysRepo = mockRepo();
    refreshTokensRepo = mockRepo();
    jwt = mockJwt();
    config = mockConfig();

    service = new PasskeyAuthService(
      usersRepo as any,
      passkeysRepo as any,
      jwt as any,
      config as any,
      new SessionService(refreshTokensRepo as any, jwt as any, config as any),
    );
  });

  describe('passkeys (Savitura/Savitools#218)', () => {
    const user = () => ({
      id: 'u-passkey',
      email: 'passkey@example.com',
      emailVerified: true,
      passwordHash,
    });
    it('requires a valid reauthentication grant to register', async () => {
      usersRepo.findOne.mockResolvedValue(user());
      const grant = await service.requestPasskeyReauth(user().id, 'password123');
      usersRepo.findOne.mockResolvedValue(user());
      passkeysRepo.find.mockResolvedValue([]);

      await expect(
        service.beginPasskeyRegistration(user().id, 'forged-grant'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.beginPasskeyRegistration(user().id, grant.reauthToken),
      ).resolves.toBeDefined();
    });

    it('rejects reauthentication with a wrong password', async () => {
      usersRepo.findOne.mockResolvedValue(user());
      await expect(
        service.requestPasskeyReauth(user().id, 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('issues single-use, short-lived challenges bound to the RP', async () => {
      usersRepo.findOne.mockResolvedValue(user());
      passkeysRepo.find.mockResolvedValue([]);
      const grant = await service.requestPasskeyReauth(user().id, 'password123');

      const { options } = await service.beginPasskeyRegistration(
        user().id,
        grant.reauthToken,
      );
      expect(options.rp.name).toBe('SaviTools');
      expect(options.challenge).toBeDefined();

      // The challenge is stored for this user only. The store is a
      // BoundedTtlMap, so the expiry lives on the map (#291).
      const stored = (service as any).passkeyChallenges;
      const entry = stored
        .keys()
        .map((key: string) => stored.get(key))
        .find((e: any) => e?.challenge === options.challenge);
      expect(entry.rpId).toBe('localhost');
      expect(entry.type).toBe('registration');
      expect(stored.ttl).toBe(120_000);
      expect(stored.capacity).toBe(10_000);
    });

    it('revoked credentials cannot authenticate', async () => {
      passkeysRepo.findOne.mockResolvedValue({
        id: 'cred-1',
        userId: user().id,
        user: user(),
        credentialId: 'cred-id-1',
        publicKey: Buffer.from('pubkey').toString('base64url'),
        counter: 0,
        transports: null,
        revokedAt: new Date(),
      });

      await expect(
        service.verifyPasskeyLogin({
          id: 'cred-id-1',
          rawId: 'cred-id-1',
          type: 'public-key',
          response: { challenge: 'x' } as any,
        } as any),
      ).rejects.toThrow(/PASSKEY_REVOKED/);
    });

    it('lets a usernameless login consume the challenge it was issued (#287)', () => {
      const rpId = 'localhost';
      // beginPasskeyLogin without an email keys the challenge under the
      // discoverable owner; nothing is written to challengeKeyCache.
      (service as any).storePasskeyChallenge(
        DISCOVERABLE_CHALLENGE_OWNER,
        'assertion',
        'challenge-discoverable',
        rpId,
      );

      // The assertion names a credential owned by a real user, which is the
      // only thing the server learns at verification time.
      expect(() =>
        (service as any).claimAssertionChallenge(
          'challenge-discoverable',
          'cred-id-1',
          'u-passkey',
          rpId,
        ),
      ).not.toThrow();

      // Still single-use.
      expect(() =>
        (service as any).claimAssertionChallenge(
          'challenge-discoverable',
          'cred-id-1',
          'u-passkey',
          rpId,
        ),
      ).toThrow(/PASSKEY_CHALLENGE_INVALID/);
    });

    it('does not let the discoverable owner stand in for a user-owned challenge (#287)', () => {
      const rpId = 'localhost';
      (service as any).storePasskeyChallenge('u-passkey', 'assertion', 'challenge-user', rpId);

      // Another user's credential holds no challenge of its own, and the
      // fallback reaches only the discoverable owner — so this must fail.
      expect(() =>
        (service as any).claimAssertionChallenge('challenge-user', 'cred-id-2', 'u-other', rpId),
      ).toThrow(/PASSKEY_CHALLENGE_INVALID/);

      // The user the challenge was issued for can still consume it.
      expect(() =>
        (service as any).claimAssertionChallenge('challenge-user', 'cred-id-1', 'u-passkey', rpId),
      ).not.toThrow();
    });

    it('rejects an assertion whose challenge was already consumed', async () => {
      const rpId = 'localhost';
      (service as any).storePasskeyChallenge(
        'u-passkey',
        'assertion',
        'challenge-abc',
        rpId,
      );

      // Consume it once via the claim path (allowed-list branch returns
      // early only when allowCredentials were used, so discoverable flow
      // keys by userId).
      (service as any).claimAssertionChallenge(
        'challenge-abc',
        'cred-id-1',
        'u-passkey',
        rpId,
      );

      expect(() =>
        (service as any).claimAssertionChallenge(
          'challenge-abc',
          'cred-id-1',
          'u-passkey',
          rpId,
        ),
      ).toThrow(/PASSKEY_CHALLENGE_INVALID/);
    });

    it('rejects assertions with a credential outside the challenge allow-list', async () => {
      const rpId = 'localhost';
      const allowed = [{ id: 'cred-allowed' }];
      (service as any).storePasskeyChallenge(
        (service as any).userIdForChallenge(allowed),
        'assertion',
        'challenge-allow',
        rpId,
        allowed.map((c) => c.id),
      );

      expect(() =>
        (service as any).claimAssertionChallenge(
          'challenge-allow',
          'cred-allowed',
          'u1',
          rpId,
        ),
      ).not.toThrow();

      // Re-issue and try a foreign credential
      (service as any).storePasskeyChallenge(
        (service as any).userIdForChallenge(allowed),
        'assertion',
        'challenge-allow-2',
        rpId,
        allowed.map((c) => c.id),
      );
      expect(() =>
        (service as any).claimAssertionChallenge(
          'challenge-allow-2',
          'cred-foreign',
          'u2',
          rpId,
        ),
      ).toThrow(/PASSKEY_CHALLENGE_MISMATCH/);
    });

    it('renames and revokes credentials only with a fresh reauth grant', async () => {
      usersRepo.findOne.mockResolvedValue(user());
      passkeysRepo.findOne.mockResolvedValue({
        id: 'cred-1',
        userId: user().id,
        name: 'Old',
        revokedAt: null,
      });
      passkeysRepo.save.mockImplementation(async (e: any) => e);

      const grant = await service.requestPasskeyReauth(user().id, 'password123');

      await expect(
        service.renamePasskey('cred-1', user().id, 'New Name', 'forged'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.renamePasskey('cred-1', user().id, 'New Name', grant.reauthToken),
      ).resolves.toBeUndefined();

      const revokeGrant = await service.requestPasskeyReauth(
        user().id,
        'password123',
      );
      await expect(
        service.revokePasskey('cred-1', user().id, revokeGrant.reauthToken),
      ).resolves.toBeUndefined();

      const saved: any = passkeysRepo.save.mock.calls.flat().pop();
      expect(saved.revokedAt).toBeInstanceOf(Date);
    });

    it('lists credentials including revoked ones with their state', async () => {
      passkeysRepo.find.mockResolvedValue([
        {
          id: 'cred-1',
          name: 'MacBook',
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
        },
        {
          id: 'cred-2',
          name: 'Phone',
          createdAt: new Date(),
          lastUsedAt: new Date(),
          revokedAt: new Date(),
        },
      ]);

      const list = await service.listPasskeys(user().id);
      expect(list).toHaveLength(2);
      expect(list.find((p) => p.id === 'cred-2')?.revokedAt).toBeInstanceOf(Date);
    });
  });
});
