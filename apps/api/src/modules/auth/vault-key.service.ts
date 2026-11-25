import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncryptionService, ENCRYPTION_PURPOSES } from '../../common/encryption.service';
import { CreateVaultKeyDto } from './dto/create-vault-key.dto';
import { ConnectedAccount, ConnectedProvider } from './entities/connected-account.entity';
import { VaultKey, VaultKeyProvider } from './entities/vault-key.entity';

const HKDF_INFO_CONNECTED = ENCRYPTION_PURPOSES.CONNECTED_ACCOUNT;
const HKDF_INFO_VAULT = ENCRYPTION_PURPOSES.VAULT_KEY;

/** Encrypted API-key vault, plus key resolution (vault first, connected account as fallback). */
@Injectable()
export class VaultKeyService {
  constructor(
    @InjectRepository(VaultKey)
    private readonly vaultKeysRepository: Repository<VaultKey>,
    @InjectRepository(ConnectedAccount)
    private readonly connectedAccountsRepository: Repository<ConnectedAccount>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async createVaultKey(
    userId: string,
    dto: CreateVaultKeyDto,
  ): Promise<{ id: string; name: string; provider: VaultKeyProvider; createdAt: Date }> {
    const { encrypted, iv, authTag } = this.encryptionService.encryptForUser(
      userId,
      dto.key,
      HKDF_INFO_VAULT,
    );

    const vk = this.vaultKeysRepository.create({
      userId,
      name: dto.name,
      provider: dto.provider,
      encryptedKey: encrypted,
      iv,
      authTag,
    });

    const saved = await this.vaultKeysRepository.save(vk);
    return { id: saved.id, name: saved.name, provider: saved.provider, createdAt: saved.createdAt };
  }

  async listVaultKeys(
    userId: string,
  ): Promise<Array<{ id: string; name: string; provider: VaultKeyProvider; createdAt: Date }>> {
    const keys = await this.vaultKeysRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      provider: k.provider,
      createdAt: k.createdAt,
    }));
  }

  async deleteVaultKey(id: string, userId: string): Promise<void> {
    const key = await this.vaultKeysRepository.findOne({ where: { id, userId } });
    if (!key) {
      throw new NotFoundException('Vault key not found');
    }
    await this.vaultKeysRepository.remove(key);
  }

  /**
   * Resolve a decrypted API key for the given user and provider.
   * Checks vault_keys first, then connected_accounts as a fallback.
   * Used internally by the Playground proxy — key is never returned to the browser.
   */
  async resolveKey(
    userId: string,
    provider: 'fluxa' | 'crowdpay' | 'custom',
  ): Promise<string | null> {
    // Vault keys take priority
    const vaultKey = await this.vaultKeysRepository.findOne({
      where: {
        userId,
        provider: provider as VaultKeyProvider,
      },
      order: { createdAt: 'DESC' },
    });

    if (vaultKey) {
      return this.encryptionService.decryptForUser(
        userId,
        { encrypted: vaultKey.encryptedKey, iv: vaultKey.iv, authTag: vaultKey.authTag },
        HKDF_INFO_VAULT,
      );
    }

    // Fall back to connected account (Fluxa only)
    if (provider === 'fluxa') {
      const connected = await this.connectedAccountsRepository.findOne({
        where: { userId, provider: ConnectedProvider.FLUXA },
      });
      if (connected) {
        return this.encryptionService.decryptForUser(
          userId,
          { encrypted: connected.encryptedKey, iv: connected.iv, authTag: connected.authTag },
          HKDF_INFO_CONNECTED,
        );
      }
    }

    return null;
  }
}
