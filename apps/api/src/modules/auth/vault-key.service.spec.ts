import { EncryptionService, ENCRYPTION_PURPOSES } from '../../common/encryption.service';
import { VaultKeyService } from './vault-key.service';
import { mockConfig, mockRepo } from './testing/auth-test-helpers';

describe('VaultKeyService', () => {
  let service: VaultKeyService;
  let vaultKeysRepo: ReturnType<typeof mockRepo>;
  let connectedAccountsRepo: ReturnType<typeof mockRepo>;
  let encryptionService: EncryptionService;

  beforeEach(() => {
    vaultKeysRepo = mockRepo();
    connectedAccountsRepo = mockRepo();
    encryptionService = new EncryptionService(mockConfig() as any);

    service = new VaultKeyService(
      vaultKeysRepo as any,
      connectedAccountsRepo as any,
      encryptionService,
    );
  });

  // ─── vault ─────────────────────────────────────────────────────────────────

  describe('createVaultKey', () => {
    it('encrypts key and does not return plaintext', async () => {
      const savedKey = { id: 'vk1', name: 'My Key', provider: 'fluxa', createdAt: new Date() };
      vaultKeysRepo.create.mockReturnValue(savedKey);
      vaultKeysRepo.save.mockResolvedValue(savedKey);

      const result = await service.createVaultKey('u1', {
        name: 'My Key',
        provider: 'fluxa' as any,
        key: 'secret-api-key',
      });

      expect(result.id).toBe('vk1');
      expect(result).not.toHaveProperty('key');
      expect(result).not.toHaveProperty('encryptedKey');

      // Verify what was stored is encrypted (not the plaintext)
      const createArgs = vaultKeysRepo.create.mock.calls[0][0];
      expect(createArgs.encryptedKey).toBeDefined();
      expect(createArgs.encryptedKey).not.toBe('secret-api-key');
    });
  });

  describe('resolveKey', () => {
    it('returns decrypted vault key when one exists', async () => {
      // Encrypt a test key so we can verify round-trip
      const userId = 'u1';
      const plainKey = 'my-fluxa-api-key';

      const encryptedData = encryptionService.encryptForUser(
        userId,
        plainKey,
        ENCRYPTION_PURPOSES.VAULT_KEY,
      );

      vaultKeysRepo.findOne.mockResolvedValue({
        id: 'vk1',
        userId,
        provider: 'fluxa',
        encryptedKey: encryptedData.encrypted,
        iv: encryptedData.iv,
        authTag: encryptedData.authTag,
        createdAt: new Date(),
      });

      const resolved = await service.resolveKey(userId, 'fluxa');
      expect(resolved).toBe(plainKey);
    });

    it('returns null when no key exists for the provider', async () => {
      vaultKeysRepo.findOne.mockResolvedValue(null);
      connectedAccountsRepo.findOne.mockResolvedValue(null);

      const resolved = await service.resolveKey('u1', 'fluxa');
      expect(resolved).toBeNull();
    });

    it('falls back to the connected Fluxa account when no vault key exists', async () => {
      const userId = 'u1';
      const plainKey = 'oauth-access-token';
      const enc = encryptionService.encryptForUser(
        userId,
        plainKey,
        ENCRYPTION_PURPOSES.CONNECTED_ACCOUNT,
      );
      vaultKeysRepo.findOne.mockResolvedValue(null);
      connectedAccountsRepo.findOne.mockResolvedValue({
        userId,
        encryptedKey: enc.encrypted,
        iv: enc.iv,
        authTag: enc.authTag,
      });

      await expect(service.resolveKey(userId, 'fluxa')).resolves.toBe(plainKey);
    });

    it('does not consult connected accounts for non-Fluxa providers', async () => {
      vaultKeysRepo.findOne.mockResolvedValue(null);

      await expect(service.resolveKey('u1', 'custom')).resolves.toBeNull();
      expect(connectedAccountsRepo.findOne).not.toHaveBeenCalled();
    });
  });
});
