import { Test, TestingModule } from '@nestjs/testing';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { AssetControlService } from './assetcontrol.service';
import { BadRequestException } from '@nestjs/common';
import { BalancesDto } from './dto/balances.dto';
import { SendPaymentDto } from './dto/send-payment.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

describe('WalletController validation and auth guards', () => {
  let controller: WalletController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        {
          provide: WalletService,
          useValue: {
            generateKeypair: jest.fn(),
            fundFromFriendbot: jest.fn(),
            getBalances: jest.fn(),
            sendPayment: jest.fn(),
          },
        },
        {
          provide: AssetControlService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<WalletController>(WalletController);
  });

  describe('BalancesDto validation', () => {
    it('accepts valid G... stellar public key', async () => {
      const dto = plainToInstance(BalancesDto, {
        publicKey: 'GBZR7WLLV5OZVUQ4WAWCKVCOVWGZFZVHG5GMRFYVZJZ2AFSGHFKDQ4C',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects invalid stellar public key', async () => {
      const dto = plainToInstance(BalancesDto, {
        publicKey: 'INVALIDKEY',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('SendPaymentDto validation', () => {
    it('accepts valid secret key and destination', async () => {
      const dto = plainToInstance(SendPaymentDto, {
        sourceSecret: 'SBUQ54DRQG5Q3QLQHJEZ5ODSLGEYZIJEDYAJBSJUKAUJL4MQAQKF3PZ',
        destination: 'GBZR7WLLV5OZVUQ4WAWCKVCOVWGZFZVHG5GMRFYVZJZ2AFSGHFKDQ4C',
        asset: 'XLM',
        amount: '10',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects invalid source secret key format', async () => {
      const dto = plainToInstance(SendPaymentDto, {
        sourceSecret: 'NOTASECRET',
        destination: 'GBZR7WLLV5OZVUQ4WAWCKVCOVWGZFZVHG5GMRFYVZJZ2AFSGHFKDQ4C',
        asset: 'XLM',
        amount: '10',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
