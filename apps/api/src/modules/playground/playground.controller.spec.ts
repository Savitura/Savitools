import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlaygroundController } from './playground.controller';
import { PlaygroundService } from './playground.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyProvider } from './entities/api-key.entity';
import { ProxyRequestDto } from './dto/proxy-request.dto';
import { SaveApiKeyDto } from './dto/save-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';
import { ImportProviderDto, RenameProviderDto } from './dto/import-provider.dto';
import { ListHistoryDto } from './dto/list-history.dto';

describe('PlaygroundController', () => {
  let controller: PlaygroundController;
  let playgroundService: jest.Mocked<Partial<PlaygroundService>>;

  const mockUser = { id: 'user-uuid-1' };

  beforeEach(() => {
    playgroundService = {
      getSpec: jest.fn(),
      proxyRequest: jest.fn(),
      saveKey: jest.fn(),
      listKeys: jest.fn(),
      updateKey: jest.fn(),
      deleteKey: jest.fn(),
      importProvider: jest.fn(),
      listProviders: jest.fn(),
      renameProvider: jest.fn(),
      deleteProvider: jest.fn(),
      listHistory: jest.fn(),
      diffHistory: jest.fn(),
      getHistoryEntry: jest.fn(),
    };

    controller = new PlaygroundController(playgroundService as unknown as PlaygroundService);
  });

  describe('guard metadata', () => {
    it('applies JwtAuthGuard at class level', () => {
      const guards = Reflect.getMetadata('__guards__', PlaygroundController);
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  describe('getSpec', () => {
    it('fetches and returns the OpenAPI spec for a provider', async () => {
      const mockSpec = { openapi: '3.0.0', info: { title: 'Fluxa API', version: '1.0' } };
      playgroundService.getSpec = jest.fn().mockResolvedValue(mockSpec);

      const result = await controller.getSpec(ApiKeyProvider.FLUXA);

      expect(playgroundService.getSpec).toHaveBeenCalledWith(ApiKeyProvider.FLUXA);
      expect(result).toEqual({ provider: ApiKeyProvider.FLUXA, spec: mockSpec });
    });

    it('propagates NotFoundException if spec cannot be found', async () => {
      playgroundService.getSpec = jest
        .fn()
        .mockRejectedValue(new NotFoundException('Provider spec not found'));

      await expect(controller.getSpec(ApiKeyProvider.CUSTOM)).rejects.toThrow(NotFoundException);
    });
  });

  describe('proxy', () => {
    const dto: ProxyRequestDto = {
      provider: ApiKeyProvider.FLUXA,
      method: 'GET',
      path: '/v1/balances',
      query: { asset: 'XLM' },
      body: undefined,
      headers: { 'X-Custom-Header': 'val' },
    };

    it('delegates proxy execution to playgroundService with user ID and DTO', async () => {
      const mockResponse = {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { balance: '100' },
        durationMs: 42,
      };
      playgroundService.proxyRequest = jest.fn().mockResolvedValue(mockResponse);

      const result = await controller.proxy(mockUser, dto);

      expect(playgroundService.proxyRequest).toHaveBeenCalledWith(mockUser.id, dto);
      expect(result).toEqual(mockResponse);
    });

    it('propagates BadRequestException on invalid proxy request', async () => {
      playgroundService.proxyRequest = jest
        .fn()
        .mockRejectedValue(new BadRequestException('Invalid proxy request'));

      await expect(controller.proxy(mockUser, dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('saveKey', () => {
    const dto: SaveApiKeyDto = {
      provider: ApiKeyProvider.FLUXA,
      label: 'Main Production Key',
      apiKey: 'sec_test_key_123',
    };

    it('delegates to playgroundService.saveKey with user ID and DTO', async () => {
      const savedKey = {
        id: 'key-uuid-1',
        provider: dto.provider,
        label: dto.label,
        maskedKey: 'sec_..._123',
        createdAt: new Date(),
      };
      playgroundService.saveKey = jest
        .fn()
        .mockResolvedValue(
          savedKey as unknown as Awaited<ReturnType<PlaygroundService['saveKey']>>,
        );

      const result = await controller.saveKey(mockUser, dto);

      expect(playgroundService.saveKey).toHaveBeenCalledWith(mockUser.id, dto);
      expect(result).toEqual(savedKey);
    });

    it('propagates error when saving key fails', async () => {
      playgroundService.saveKey = jest
        .fn()
        .mockRejectedValue(new BadRequestException('Invalid API key data'));

      await expect(controller.saveKey(mockUser, dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('listKeys', () => {
    it('delegates to playgroundService.listKeys with user ID', async () => {
      const keys = [
        {
          id: 'key-uuid-1',
          provider: ApiKeyProvider.FLUXA,
          label: 'Fluxa Key',
          maskedKey: 'sec_..._123',
        },
      ];
      playgroundService.listKeys = jest
        .fn()
        .mockResolvedValue(keys as unknown as Awaited<ReturnType<PlaygroundService['listKeys']>>);

      const result = await controller.listKeys(mockUser);

      expect(playgroundService.listKeys).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(keys);
    });
  });

  describe('updateKey', () => {
    const dto: UpdateApiKeyDto = {
      label: 'Renamed Key',
      apiKey: 'sec_updated_key_456',
    };

    it('delegates to playgroundService.updateKey with key ID, user ID, and DTO', async () => {
      const updatedKey = {
        id: 'key-uuid-1',
        label: dto.label,
        maskedKey: 'sec_..._456',
      };
      playgroundService.updateKey = jest
        .fn()
        .mockResolvedValue(
          updatedKey as unknown as Awaited<ReturnType<PlaygroundService['updateKey']>>,
        );

      const result = await controller.updateKey(mockUser, 'key-uuid-1', dto);

      expect(playgroundService.updateKey).toHaveBeenCalledWith('key-uuid-1', mockUser.id, dto);
      expect(result).toEqual(updatedKey);
    });

    it('propagates NotFoundException if key does not exist', async () => {
      playgroundService.updateKey = jest
        .fn()
        .mockRejectedValue(new NotFoundException('API key not found'));

      await expect(controller.updateKey(mockUser, 'invalid-key-id', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteKey', () => {
    it('delegates to playgroundService.deleteKey and returns { success: true }', async () => {
      playgroundService.deleteKey = jest.fn().mockResolvedValue(undefined);

      const result = await controller.deleteKey(mockUser, 'key-uuid-1');

      expect(playgroundService.deleteKey).toHaveBeenCalledWith('key-uuid-1', mockUser.id);
      expect(result).toEqual({ success: true });
    });

    it('propagates NotFoundException when key does not exist', async () => {
      playgroundService.deleteKey = jest
        .fn()
        .mockRejectedValue(new NotFoundException('API key not found'));

      await expect(controller.deleteKey(mockUser, 'missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('importProvider', () => {
    const dto: ImportProviderDto = {
      name: 'Custom Provider',
      openApiJson: { openapi: '3.0.0', info: { title: 'Custom', version: '1.0' } },
      origin: 'https://api.custom.example',
      apiKey: 'cust_key_999',
    };

    it('delegates to playgroundService.importProvider with user ID and DTO', async () => {
      const imported = {
        id: 'provider-uuid-1',
        name: dto.name,
        origin: dto.origin,
      };
      playgroundService.importProvider = jest
        .fn()
        .mockResolvedValue(
          imported as unknown as Awaited<ReturnType<PlaygroundService['importProvider']>>,
        );

      const result = await controller.importProvider(mockUser, dto);

      expect(playgroundService.importProvider).toHaveBeenCalledWith(mockUser.id, dto);
      expect(result).toEqual(imported);
    });

    it('propagates BadRequestException when OpenAPI document or key is invalid', async () => {
      playgroundService.importProvider = jest
        .fn()
        .mockRejectedValue(new BadRequestException('Invalid OpenAPI document'));

      await expect(controller.importProvider(mockUser, dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('listProviders', () => {
    it('delegates to playgroundService.listProviders with user ID', async () => {
      const providers = [
        { id: 'provider-1', name: 'Custom One', origin: 'https://api1.example.com' },
      ];
      playgroundService.listProviders = jest
        .fn()
        .mockResolvedValue(
          providers as unknown as Awaited<ReturnType<PlaygroundService['listProviders']>>,
        );

      const result = await controller.listProviders(mockUser);

      expect(playgroundService.listProviders).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(providers);
    });
  });

  describe('renameProvider', () => {
    const dto: RenameProviderDto = { name: 'Updated Provider Name' };

    it('delegates to playgroundService.renameProvider with ID, user ID, and DTO', async () => {
      const updated = { id: 'prov-1', name: dto.name };
      playgroundService.renameProvider = jest
        .fn()
        .mockResolvedValue(
          updated as unknown as Awaited<ReturnType<PlaygroundService['renameProvider']>>,
        );

      const result = await controller.renameProvider(mockUser, 'prov-1', dto);

      expect(playgroundService.renameProvider).toHaveBeenCalledWith('prov-1', mockUser.id, dto);
      expect(result).toEqual(updated);
    });

    it('propagates NotFoundException if provider does not exist', async () => {
      playgroundService.renameProvider = jest
        .fn()
        .mockRejectedValue(new NotFoundException('API key not found'));

      await expect(controller.renameProvider(mockUser, 'prov-99', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteProvider', () => {
    it('delegates to playgroundService.deleteProvider and returns { success: true }', async () => {
      playgroundService.deleteProvider = jest.fn().mockResolvedValue(undefined);

      const result = await controller.deleteProvider(mockUser, 'prov-1');

      expect(playgroundService.deleteProvider).toHaveBeenCalledWith('prov-1', mockUser.id);
      expect(result).toEqual({ success: true });
    });

    it('propagates NotFoundException when provider does not exist', async () => {
      playgroundService.deleteProvider = jest
        .fn()
        .mockRejectedValue(new NotFoundException('API key not found'));

      await expect(controller.deleteProvider(mockUser, 'prov-99')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listHistory', () => {
    it('delegates to playgroundService.listHistory with user ID and query parameters', async () => {
      const query: ListHistoryDto = { provider: ApiKeyProvider.FLUXA, limit: 10, offset: 0 };
      const historyList = {
        items: [{ id: 'hist-1', provider: ApiKeyProvider.FLUXA, path: '/v1/wallets' }],
        total: 1,
      };
      playgroundService.listHistory = jest
        .fn()
        .mockResolvedValue(
          historyList as unknown as Awaited<ReturnType<PlaygroundService['listHistory']>>,
        );

      const result = await controller.listHistory(mockUser, query);

      expect(playgroundService.listHistory).toHaveBeenCalledWith(mockUser.id, query);
      expect(result).toEqual(historyList);
    });
  });

  describe('diffHistory', () => {
    it('throws BadRequestException if query param "a" is missing', async () => {
      await expect(controller.diffHistory(mockUser, '', 'entry-b')).rejects.toThrow(
        new BadRequestException('Both "a" and "b" history entry IDs are required'),
      );
    });

    it('throws BadRequestException if query param "b" is missing', async () => {
      await expect(controller.diffHistory(mockUser, 'entry-a', '')).rejects.toThrow(
        new BadRequestException('Both "a" and "b" history entry IDs are required'),
      );
    });

    it('delegates to playgroundService.diffHistory and returns { a, b, diff }', async () => {
      const mockDiff = { statusDiff: null, bodyDiff: [{ op: 'replace', path: '/val', value: 2 }] };
      playgroundService.diffHistory = jest
        .fn()
        .mockResolvedValue(
          mockDiff as unknown as Awaited<ReturnType<PlaygroundService['diffHistory']>>,
        );

      const result = await controller.diffHistory(mockUser, 'entry-a', 'entry-b');

      expect(playgroundService.diffHistory).toHaveBeenCalledWith('entry-a', 'entry-b', mockUser.id);
      expect(result).toEqual({
        a: 'entry-a',
        b: 'entry-b',
        diff: mockDiff,
      });
    });
  });

  describe('getHistoryEntry', () => {
    it('delegates to playgroundService.getHistoryEntry with ID and user ID', async () => {
      const entry = { id: 'hist-1', provider: ApiKeyProvider.FLUXA, path: '/v1/wallets' };
      playgroundService.getHistoryEntry = jest
        .fn()
        .mockResolvedValue(
          entry as unknown as Awaited<ReturnType<PlaygroundService['getHistoryEntry']>>,
        );

      const result = await controller.getHistoryEntry(mockUser, 'hist-1');

      expect(playgroundService.getHistoryEntry).toHaveBeenCalledWith('hist-1', mockUser.id);
      expect(result).toEqual(entry);
    });

    it('propagates NotFoundException if history entry is not found', async () => {
      playgroundService.getHistoryEntry = jest
        .fn()
        .mockRejectedValue(new NotFoundException('History entry not found'));

      await expect(controller.getHistoryEntry(mockUser, 'missing-hist-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
