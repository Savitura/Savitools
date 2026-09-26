/**
 * pool-quote.controller.spec.ts
 *
 * Tests the SimulatorController.getPoolQuote method, which delegates to
 * PoolQuoteService. Covers the happy path for both scenarios plus error
 * propagation from the service.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SimulatorController } from './simulator.controller';
import { SimulatorService } from './simulator.service';
import { OrderbookService } from './orderbook.service';
import { PoolQuoteService } from './pool-quote.service';
import { PoolQuoteDto } from './dto/pool-quote.dto';
import type { DepositQuoteResult, WithdrawalQuoteResult } from './pool-quote.service';

// ─── fixtures ─────────────────────────────────────────────────────────────

const DEPOSIT_RESULT: DepositQuoteResult = {
  poolId: 'abc123',
  network: 'testnet',
  scenario: 'deposit',
  assetA: { asset: 'native', reserve: '1000.0000000' },
  assetB: { asset: 'USDC:GISSUER', reserve: '500.0000000' },
  totalShares: '700.0000000',
  feePct: '0.30%',
  spotPriceAperB: '2.0000000',
  spotPriceBperA: '0.5000000',
  priceImpactBps: '0',
  depositA: '100.0000000',
  depositB: '50.0000000',
  sharesOut: '70.0000000',
  minSharesOut: '69.6500000',
  composerHint: {
    operation: 'liquidityPoolDeposit',
    poolId: 'abc123',
    maxAmountA: '100.0000000',
    maxAmountB: '50.0000000',
    minPrice: '1.9800000',
    maxPrice: '2.0200000',
  },
};

const WITHDRAWAL_RESULT: WithdrawalQuoteResult = {
  poolId: 'abc123',
  network: 'testnet',
  scenario: 'withdrawal',
  assetA: { asset: 'native', reserve: '1000.0000000' },
  assetB: { asset: 'USDC:GISSUER', reserve: '500.0000000' },
  totalShares: '700.0000000',
  feePct: '0.30%',
  spotPriceAperB: '2.0000000',
  spotPriceBperA: '0.5000000',
  priceImpactBps: '100',
  sharesToBurn: '70.0000000',
  reserveAOut: '100.0000000',
  reserveBOut: '50.0000000',
  minReserveAOut: '99.5000000',
  minReserveBOut: '49.7500000',
  composerHint: {
    operation: 'liquidityPoolWithdraw',
    poolId: 'abc123',
    amount: '70.0000000',
    minAmountA: '99.5000000',
    minAmountB: '49.7500000',
  },
};

// ─── helpers ──────────────────────────────────────────────────────────────

function buildController(poolQuoteService: Partial<PoolQuoteService>) {
  return new SimulatorController(
    {} as SimulatorService,
    {} as OrderbookService,
    poolQuoteService as PoolQuoteService,
  );
}

// ─── tests ─────────────────────────────────────────────────────────────────

describe('SimulatorController.getPoolQuote', () => {
  describe('deposit scenario — happy path', () => {
    it('delegates the DTO to PoolQuoteService and returns its result', async () => {
      const mockService = {
        getPoolQuote: jest.fn().mockResolvedValue(DEPOSIT_RESULT),
      };
      const controller = buildController(mockService);

      const dto: PoolQuoteDto = {
        scenario: 'deposit',
        network: 'testnet',
        assetA: 'XLM',
        assetB: 'USDC:GISSUER',
        amountA: '100',
      };

      const result = await controller.getPoolQuote(dto);

      expect(mockService.getPoolQuote).toHaveBeenCalledWith(dto);
      expect(result).toBe(DEPOSIT_RESULT);
      expect(result.scenario).toBe('deposit');
    });

    it('deposit result includes composerHint with correct operation type', async () => {
      const mockService = { getPoolQuote: jest.fn().mockResolvedValue(DEPOSIT_RESULT) };
      const controller = buildController(mockService);
      const result = (await controller.getPoolQuote({
        scenario: 'deposit',
        assetA: 'XLM',
        assetB: 'USDC:GISSUER',
        amountA: '100',
      })) as DepositQuoteResult;
      expect(result.composerHint.operation).toBe('liquidityPoolDeposit');
      expect(result.composerHint.poolId).toBe('abc123');
      expect(result.composerHint.maxAmountA).toBe('100.0000000');
      expect(result.composerHint.maxAmountB).toBe('50.0000000');
    });
  });

  describe('withdrawal scenario — happy path', () => {
    it('delegates the DTO to PoolQuoteService and returns its result', async () => {
      const mockService = {
        getPoolQuote: jest.fn().mockResolvedValue(WITHDRAWAL_RESULT),
      };
      const controller = buildController(mockService);

      const dto: PoolQuoteDto = {
        scenario: 'withdrawal',
        network: 'testnet',
        assetA: 'XLM',
        assetB: 'USDC:GISSUER',
        shares: '70',
      };

      const result = await controller.getPoolQuote(dto);

      expect(mockService.getPoolQuote).toHaveBeenCalledWith(dto);
      expect(result).toBe(WITHDRAWAL_RESULT);
    });

    it('withdrawal result includes composerHint with correct operation type', async () => {
      const mockService = { getPoolQuote: jest.fn().mockResolvedValue(WITHDRAWAL_RESULT) };
      const controller = buildController(mockService);
      const result = (await controller.getPoolQuote({
        scenario: 'withdrawal',
        assetA: 'XLM',
        assetB: 'USDC:GISSUER',
        shares: '70',
      })) as WithdrawalQuoteResult;
      expect(result.composerHint.operation).toBe('liquidityPoolWithdraw');
      expect(result.composerHint.amount).toBe('70.0000000');
      expect(result.composerHint.minAmountA).toBe('99.5000000');
    });
  });

  describe('error propagation', () => {
    it('propagates BadRequestException from service (invalid params)', async () => {
      const mockService = {
        getPoolQuote: jest
          .fn()
          .mockRejectedValue(
            new BadRequestException('Deposit scenario requires amountA or amountB'),
          ),
      };
      const controller = buildController(mockService);

      await expect(
        controller.getPoolQuote({ scenario: 'deposit', assetA: 'XLM', assetB: 'USDC:GISSUER' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates NotFoundException from service (unknown pool)', async () => {
      const mockService = {
        getPoolQuote: jest
          .fn()
          .mockRejectedValue(
            new NotFoundException('No liquidity pool found for XLM / USDC:GISSUER on this network'),
          ),
      };
      const controller = buildController(mockService);

      await expect(
        controller.getPoolQuote({
          scenario: 'deposit',
          assetA: 'XLM',
          assetB: 'USDC:GISSUER',
          amountA: '100',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates BadRequestException for cross-scenario params', async () => {
      const mockService = {
        getPoolQuote: jest
          .fn()
          .mockRejectedValue(
            new BadRequestException('shares and withdrawAmountA are only valid for the withdrawal scenario'),
          ),
      };
      const controller = buildController(mockService);

      await expect(
        controller.getPoolQuote({
          scenario: 'deposit',
          assetA: 'XLM',
          assetB: 'USDC:GISSUER',
          amountA: '100',
          shares: '70', // invalid for deposit
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates BadRequestException for non-constant-product pool type', async () => {
      const mockService = {
        getPoolQuote: jest
          .fn()
          .mockRejectedValue(
            new BadRequestException('Pool "abc123" is of type "other". Only constant_product pools are supported.'),
          ),
      };
      const controller = buildController(mockService);

      await expect(
        controller.getPoolQuote({
          scenario: 'deposit',
          poolId: 'abc123',
          amountA: '100',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('poolId lookup', () => {
    it('passes the poolId to service when provided', async () => {
      const mockService = { getPoolQuote: jest.fn().mockResolvedValue(DEPOSIT_RESULT) };
      const controller = buildController(mockService);

      const dto: PoolQuoteDto = {
        scenario: 'deposit',
        poolId: 'deadbeef1234',
        amountA: '100',
      };

      await controller.getPoolQuote(dto);
      expect(mockService.getPoolQuote).toHaveBeenCalledWith(dto);
    });
  });
});
