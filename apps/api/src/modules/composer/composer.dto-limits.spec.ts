import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../config/validation-pipe.config';
import { BuildTransactionDto } from './dto/build-transaction.dto';
import {
  RunTransactionSequenceDto,
  MAX_OPERATIONS_PER_TRANSACTION,
  MAX_SEQUENCE_STEPS,
} from './dto/transaction-sequence.dto';

interface ValidationErrorResponse {
  response?: {
    message?: string | string[];
  };
}

describe('Composer DTO payload size and operation-count limits', () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

  const validPublicKey = 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI';
  const validPaymentOp = {
    type: 'payment',
    destination: validPublicKey,
    asset: { code: 'XLM' },
    amount: '10',
  };

  describe('BuildTransactionDto validation', () => {
    it('accepts a valid transaction with reasonable operations', async () => {
      const payload = {
        sourceAccount: validPublicKey,
        network: 'testnet',
        operations: [validPaymentOp],
      };

      const result = await pipe.transform(payload, {
        type: 'body',
        metatype: BuildTransactionDto,
      });

      expect(result).toBeInstanceOf(BuildTransactionDto);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].destination).toBe(validPublicKey);
    });

    it('accepts up to exactly 100 operations', async () => {
      const operations = Array.from({ length: MAX_OPERATIONS_PER_TRANSACTION }, () => ({
        ...validPaymentOp,
      }));

      const payload = {
        sourceAccount: validPublicKey,
        network: 'testnet',
        operations,
      };

      const result = await pipe.transform(payload, {
        type: 'body',
        metatype: BuildTransactionDto,
      });

      expect(result.operations).toHaveLength(100);
    });

    it('rejects more than 100 operations with a 400 validation error', async () => {
      const operations = Array.from({ length: 101 }, () => ({
        ...validPaymentOp,
      }));

      const payload = {
        sourceAccount: validPublicKey,
        network: 'testnet',
        operations,
      };

      await expect(
        pipe.transform(payload, { type: 'body', metatype: BuildTransactionDto }),
      ).rejects.toThrow(BadRequestException);

      try {
        await pipe.transform(payload, { type: 'body', metatype: BuildTransactionDto });
      } catch (err: unknown) {
        const messages = (err as ValidationErrorResponse).response?.message;
        const arrayMaxError = Array.isArray(messages)
          ? messages.find((m: string) => m.includes('cannot contain more than 100 operations'))
          : messages;
        expect(arrayMaxError).toBeDefined();
      }
    });

    it('rejects an operation that exceeds the maximum JSON nesting depth of 6', async () => {
      // depth 7 nested object inside an operation
      const nestedExcessive = {
        type: 'custom',
        l1: { l2: { l3: { l4: { l5: { l6: { l7: 'too deep' } } } } } },
      };

      const payload = {
        sourceAccount: validPublicKey,
        network: 'testnet',
        operations: [nestedExcessive],
      };

      await expect(
        pipe.transform(payload, { type: 'body', metatype: BuildTransactionDto }),
      ).rejects.toThrow(BadRequestException);

      try {
        await pipe.transform(payload, { type: 'body', metatype: BuildTransactionDto });
      } catch (err: unknown) {
        const messages = JSON.stringify((err as ValidationErrorResponse).response?.message);
        expect(messages).toContain('exceeds maximum allowed depth of 6');
      }
    });

    it('rejects an operation whose JSON payload size exceeds 64 KB', async () => {
      const hugeString = 'X'.repeat(70_000); // 70 KB
      const oversizedOp = {
        type: 'manage_data',
        name: 'overflow',
        value: hugeString,
      };

      const payload = {
        sourceAccount: validPublicKey,
        network: 'testnet',
        operations: [oversizedOp],
      };

      await expect(
        pipe.transform(payload, { type: 'body', metatype: BuildTransactionDto }),
      ).rejects.toThrow(BadRequestException);

      try {
        await pipe.transform(payload, { type: 'body', metatype: BuildTransactionDto });
      } catch (err: unknown) {
        const messages = JSON.stringify((err as ValidationErrorResponse).response?.message);
        expect(messages).toContain('exceeds maximum allowed limit of 65536 bytes');
      }
    });
  });

  describe('RunTransactionSequenceDto validation', () => {
    it('accepts a valid transaction sequence with literal and referenced sources', async () => {
      const payload = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: validPublicKey,
            operations: [validPaymentOp],
          },
          {
            source: { step: 0, field: 'destination' },
            operations: [validPaymentOp],
          },
        ],
      };

      const result = await pipe.transform(payload, {
        type: 'body',
        metatype: RunTransactionSequenceDto,
      });

      expect(result).toBeInstanceOf(RunTransactionSequenceDto);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].operations[0].destination).toBe(validPublicKey);
    });

    it('rejects a step with more than 100 operations', async () => {
      const operations = Array.from({ length: 101 }, () => ({
        ...validPaymentOp,
      }));

      const payload = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: validPublicKey,
            operations,
          },
        ],
      };

      await expect(
        pipe.transform(payload, { type: 'body', metatype: RunTransactionSequenceDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a sequence run with more than 100 steps', async () => {
      const steps = Array.from({ length: MAX_SEQUENCE_STEPS + 1 }, () => ({
        source: validPublicKey,
        operations: [validPaymentOp],
      }));

      const payload = {
        network: 'testnet',
        stopOnFailure: true,
        steps,
      };

      await expect(
        pipe.transform(payload, { type: 'body', metatype: RunTransactionSequenceDto }),
      ).rejects.toThrow(BadRequestException);

      try {
        await pipe.transform(payload, { type: 'body', metatype: RunTransactionSequenceDto });
      } catch (err: unknown) {
        const messages = JSON.stringify((err as ValidationErrorResponse).response?.message);
        expect(messages).toContain('cannot contain more than 100 steps');
      }
    });

    it('rejects a step with an operation exceeding nesting depth', async () => {
      const deepOp = {
        type: 'payment',
        l1: { l2: { l3: { l4: { l5: { l6: { l7: 'deep' } } } } } },
      };

      const payload = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: validPublicKey,
            operations: [deepOp],
          },
        ],
      };

      await expect(
        pipe.transform(payload, { type: 'body', metatype: RunTransactionSequenceDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a step with a source exceeding nesting depth', async () => {
      const deepSource = {
        step: 0,
        l1: { l2: { l3: { l4: { l5: { l6: { l7: 'deep' } } } } } },
      };

      const payload = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: deepSource,
            operations: [validPaymentOp],
          },
        ],
      };

      await expect(
        pipe.transform(payload, { type: 'body', metatype: RunTransactionSequenceDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a step missing a source property', async () => {
      const payload = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            operations: [validPaymentOp],
          },
        ],
      };

      await expect(
        pipe.transform(payload, { type: 'body', metatype: RunTransactionSequenceDto }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
