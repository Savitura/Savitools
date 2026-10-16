import { Test, TestingModule } from '@nestjs/testing';
import { WalletController } from './wallet.controller';
import { AssetControlService } from './assetcontrol.service';

describe('WalletController', () => {
  let controller: WalletController;
  const assetControlService = {
    getAssetFlags: jest.fn(),
    getTrustlines: jest.fn(),
    buildSetFlagsXdr: jest.fn(),
    buildClawbackXdr: jest.fn(),
    buildAccountFlagsXdr: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        {
          provide: AssetControlService,
          useValue: assetControlService,
        },
      ],
    }).compile();

    controller = module.get<WalletController>(WalletController);
    jest.clearAllMocks();
  });

  it('delegates asset flag reads to AssetControlService', async () => {
    assetControlService.getAssetFlags.mockResolvedValue({ authRequired: true });
    await expect(
      controller.getAssetFlags('USD', 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
    ).resolves.toEqual({ authRequired: true });
    expect(assetControlService.getAssetFlags).toHaveBeenCalledWith(
      'USD',
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    );
  });
});
