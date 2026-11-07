import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { MultisigSimulateDto } from './dto/simulate-multisig.dto';
import {
  MAX_SIGNER_WEIGHT,
  MAX_SIGNERS,
  MultisigSimulationResult,
  OPERATION_THRESHOLDS,
  simulateMultisig,
} from './multisig-weights';

export type { MultisigSimulationResult } from './multisig-weights';

export interface MultisigLimits {
  maxSigners: number;
  maxSignerWeight: number;
  maxThreshold: number;
  /** Which operations each weight class gates, so the UI can label the rows. */
  operationThresholds: ReadonlyArray<{
    kind: (typeof OPERATION_THRESHOLDS)[number];
    gates: string;
  }>;
}

/**
 * Multisig signer-weight and threshold simulator (Savitura/Savitools#352).
 *
 * Stateless by design: nothing here reads Horizon or touches Postgres. A
 * multisig is described by its signer list and three thresholds, so the
 * simulation is a function of the request body alone — which also means a
 * signed transaction built from the answer is reproducible offline, and the
 * suite can pin every boundary without a network or a database.
 *
 * The service's only real work is turning the request into integers and
 * turning a rejected configuration into a 400 rather than a 500.
 */
@Injectable()
export class MultisigService {
  private readonly logger = new Logger(MultisigService.name);

  /**
   * The bounds the DTO enforces, published so a client can check a form before
   * a round trip instead of after a 400.
   */
  getLimits(): MultisigLimits {
    return {
      maxSigners: MAX_SIGNERS,
      maxSignerWeight: MAX_SIGNER_WEIGHT,
      maxThreshold: MAX_SIGNER_WEIGHT,
      operationThresholds: [
        { kind: 'low', gates: 'Trustline and offer operations' },
        { kind: 'medium', gates: 'Payments and path payments' },
        { kind: 'high', gates: 'Account settings and clawbacks' },
      ],
    };
  }

  simulate(dto: MultisigSimulateDto): MultisigSimulationResult {
    const minTime = parseTimeBound(dto.minTime, 'minTime');
    const maxTime = parseTimeBound(dto.maxTime, 'maxTime');

    try {
      return simulateMultisig({
        threshold: dto.threshold,
        lowThreshold: dto.lowThreshold,
        highThreshold: dto.highThreshold,
        minTime,
        maxTime,
        signers: dto.signers.map((signer) => ({
          key: signer.key,
          weight: signer.weight,
          signed: signer.signed ?? false,
          required: signer.required ?? false,
        })),
      });
    } catch (error: unknown) {
      // `simulateMultisig` validates the configuration with RangeError so the
      // arithmetic module stays free of HTTP. A rejected configuration is the
      // caller's problem, so it is a 400 and never a 500.
      if (error instanceof RangeError) {
        this.logger.warn(`Rejected multisig configuration: ${error.message}`);
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}

/**
 * Accepts unix seconds or an ISO 8601 instant and returns unix seconds.
 *
 * Horizon reports the transaction time bounds in unix seconds while operators
 * read them as timestamps, so both spellings are accepted rather than making
 * the caller convert. `null`, `undefined` and blank all mean "unbounded".
 *
 * The numeric branch is anchored before the date branch on purpose:
 * `Date.parse('-5')` yields a real instant in Node, so a negative timestamp
 * would otherwise sail through as a date rather than being rejected.
 */
function parseTimeBound(value: string | undefined, label: string): number | null {
  if (value === undefined || value === null || value.trim() === '') return null;

  const trimmed = value.trim();
  if (/^-?[0-9]+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isSafeInteger(seconds) || seconds < 0) {
      throw new BadRequestException(`${label} must be a non-negative unix timestamp`);
    }
    return seconds;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new BadRequestException(
      `${label} must be unix seconds or an ISO 8601 timestamp, got "${value}"`,
    );
  }
  return Math.floor(parsed / 1000);
}
