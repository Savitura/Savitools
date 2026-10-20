import { Test, TestingModule } from '@nestjs/testing';
import { SandboxController } from './sandbox.controller';
import { SandboxService } from './sandbox.service';
import { PaymentDto } from './dto/payment.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('SandboxController validation', () => {
  let _controller: SandboxController;

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
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    _controller = module.get<SandboxController>(SandboxController);
  });

  describe('PaymentDto validation in Sandbox', () => {
    it('accepts valid payment DTO with S... secret and G... destination', async () => {
      const dto = plainToInstance(PaymentDto, {
        fromSecret: 'SCXB2UEUJLXSQPDWCIPRSXLKCGCK6AXHLHCXGAA4QM3JPU53QIB4UVHU',
        toPublicKey: 'GBT2VWRZ7BWVTUHCH25F3ROXEZF4YBRQPZTE3OA7T6N4I75Z2DO7TRAK',
        asset: 'XLM',
        amount: '5',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects invalid secret key in sandbox payment dto', async () => {
      const dto = plainToInstance(PaymentDto, {
        fromSecret: 'BADSECRET',
        toPublicKey: 'GBT2VWRZ7BWVTUHCH25F3ROXEZF4YBRQPZTE3OA7T6N4I75Z2DO7TRAK',
        asset: 'XLM',
        amount: '5',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
