import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VaultController } from './vault.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CreateVaultKeyDto } from './dto/create-vault-key.dto';
import { VaultKeyProvider } from './entities/vault-key.entity';
import { VaultKeyService } from './vault-key.service';

describe('VaultController', () => {
  let controller: VaultController;
  let vaultKeyService: jest.Mocked<Partial<VaultKeyService>>;

  const mockUser = { id: 'user-uuid-1' };

  beforeEach(() => {
    vaultKeyService = {
      createVaultKey: jest.fn(),
      listVaultKeys: jest.fn(),
      deleteVaultKey: jest.fn(),
    };

    controller = new VaultController(vaultKeyService as unknown as VaultKeyService);
  });

  describe('guard metadata', () => {
    it('applies JwtAuthGuard at class level', () => {
      const guards = Reflect.getMetadata('__guards__', VaultController);
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  describe('create', () => {
    const dto: CreateVaultKeyDto = {
      name: 'Fluxa Secret',
      provider: VaultKeyProvider.FLUXA,
      key: 'secret-key-12345',
    };

    it('delegates to vaultKeyService.createVaultKey with user ID and DTO', async () => {
      const createdKey = {
        id: 'vault-uuid-1',
        name: dto.name,
        provider: dto.provider,
        createdAt: new Date(),
      };
      vaultKeyService.createVaultKey = jest.fn().mockResolvedValue(createdKey);

      const result = await controller.create(dto, mockUser);

      expect(vaultKeyService.createVaultKey).toHaveBeenCalledWith(mockUser.id, dto);
      expect(result).toEqual(createdKey);
    });

    it('propagates BadRequestException on invalid key parameters', async () => {
      vaultKeyService.createVaultKey = jest
        .fn()
        .mockRejectedValue(new BadRequestException('Invalid vault key'));

      await expect(controller.create(dto, mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('list', () => {
    it('delegates to vaultKeyService.listVaultKeys with user ID', async () => {
      const keys = [
        {
          id: 'vault-uuid-1',
          name: 'Fluxa Secret',
          provider: VaultKeyProvider.FLUXA,
          createdAt: new Date(),
        },
      ];
      vaultKeyService.listVaultKeys = jest.fn().mockResolvedValue(keys);

      const result = await controller.list(mockUser);

      expect(vaultKeyService.listVaultKeys).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(keys);
    });

    it('returns empty array when user has no stored vault keys', async () => {
      vaultKeyService.listVaultKeys = jest.fn().mockResolvedValue([]);

      const result = await controller.list(mockUser);

      expect(vaultKeyService.listVaultKeys).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual([]);
    });
  });

  describe('remove', () => {
    it('delegates to vaultKeyService.deleteVaultKey and returns { success: true }', async () => {
      vaultKeyService.deleteVaultKey = jest.fn().mockResolvedValue(undefined);

      const result = await controller.remove('vault-uuid-1', mockUser);

      expect(vaultKeyService.deleteVaultKey).toHaveBeenCalledWith('vault-uuid-1', mockUser.id);
      expect(result).toEqual({ success: true });
    });

    it('propagates NotFoundException when key does not exist', async () => {
      vaultKeyService.deleteVaultKey = jest
        .fn()
        .mockRejectedValue(new NotFoundException('Key not found'));

      await expect(controller.remove('missing-key-id', mockUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(vaultKeyService.deleteVaultKey).toHaveBeenCalledWith('missing-key-id', mockUser.id);
    });
  });
});
