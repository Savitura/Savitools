import { Test, TestingModule } from '@nestjs/testing';
import { SandboxController } from './sandbox.controller';
import { SandboxService } from './sandbox.service';
import { PaymentDto } from './dto/payment.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

describe('SandboxController validation', () => {
  let controller: SandboxController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SandboxController],
      providers: [
        {
          provide: SandboxService,
          useValue: {
            generateKeypair: jest.fn(),
            fundFromFriendbot: jest.fn(),
            getAccount: jest.fn(),
            sendPayment: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SandboxController>(SandboxController);
  });

  describe('PaymentDto validation in Sandbox', () => {
    it('accepts valid payment DTO with S... secret and G... destination', async () => {
      const dto = plainToInstance(PaymentDto, {
        fromSecret: 'SBUQ54DRQG5Q3QLQHJEZ5ODSLGEYZIJEDYAJBSJUKAUJL4MQAQKF3PZ',
        toPublicKey: 'GBZR7WLLV5OZVUQ4WAWCKVCOVWGZFZVHG5GMRFYVZJZ2AFSGHFKDQ4C',
        asset: 'XLM',
        amount: '5',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects invalid secret key in sandbox payment dto', async () => {
      const dto = plainToInstance(PaymentDto, {
        fromSecret: 'BADSECRET',
        toPublicKey: 'GBZR7WLLV5OZVUQ4WAWCKVCOVWGZFZVHG5GMRFYVZJZ2AFSGHFKDQ4C',
        asset: 'XLM',
        amount: '5',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
