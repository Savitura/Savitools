import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import {
  EstimateExpirationDto,
  ExtendTtlEstimateDto,
  StorageType,
  BulkEstimateDto,
} from './dto/estimate-expiration.dto';

export interface ExpirationEstimate {
  currentLedger: number;
  liveUntilLedger: number;
  ttlRemaining: number;
  storageType: StorageType;
  isExpired: boolean;
  expiresIn: {
    ledgers: number;
    seconds: number;
    minutes: number;
    hours: number;
    days: number;
  };
  estimatedExpirationDate: Date;
  status: 'critical' | 'warning' | 'healthy' | 'expired';
  recommendation: string;
}

export interface TtlExtensionEstimate {
  currentTtl: number;
  extendByLedgers: number;
  newTtl: number;
  newLiveUntilLedger?: number;
  extendedLifetime: {
    ledgers: number;
    days: number;
  };
  estimatedCost: {
    stroops: number;
    xlm: string;
  };
  recommendation: string;
}

export interface BulkExpirationResult {
  contractAddress: string;
  instanceTtl: number | null;
  wasmTtl: number | null;
  expiresIn: {
    days: number;
    hours: number;
  } | null;
  status: 'healthy' | 'warning' | 'critical' | 'error';
  error?: string;
}

@Injectable()
export class SorobanService {
  private readonly logger = new Logger(SorobanService.name);

  // Network constants
  private readonly LEDGER_CLOSE_TIME_SECONDS = 5; // Average Stellar ledger close time
  private readonly SECONDS_PER_DAY = 86400;
  private readonly LEDGERS_PER_DAY = this.SECONDS_PER_DAY / this.LEDGER_CLOSE_TIME_SECONDS;

  // TTL thresholds (in days)
  private readonly CRITICAL_THRESHOLD_DAYS = 7;
  private readonly WARNING_THRESHOLD_DAYS = 30;

  // Cost estimation constants (approximate, based on protocol)
  private readonly RENT_FEE_PER_BYTE_PER_LEDGER = 0.001; // stroops
  private readonly WRITE_FEE_BASE = 10000; // stroops

  constructor(private readonly config: ConfigService) {}

  /**
   * Estimate when a storage entry will expire and provide recommendations
   */
  estimateExpiration(dto: EstimateExpirationDto): ExpirationEstimate {
    const {
      currentLedger,
      liveUntilLedger,
      storageType = StorageType.PERSISTENT,
      ledgerCloseTime = this.LEDGER_CLOSE_TIME_SECONDS,
    } = dto;

    // Validate inputs
    if (currentLedger < 0 || liveUntilLedger < 0) {
      throw new BadRequestException('Ledger numbers must be non-negative');
    }

    const ttlRemaining = Math.max(0, liveUntilLedger - currentLedger);
    const isExpired = ttlRemaining === 0;

    // Calculate time estimates
    const secondsRemaining = ttlRemaining * ledgerCloseTime;
    const minutesRemaining = secondsRemaining / 60;
    const hoursRemaining = minutesRemaining / 60;
    const daysRemaining = hoursRemaining / 24;

    const estimatedExpirationDate = new Date(Date.now() + secondsRemaining * 1000);

    // Determine status
    let status: 'critical' | 'warning' | 'healthy' | 'expired';
    if (isExpired) {
      status = 'expired';
    } else if (daysRemaining <= this.CRITICAL_THRESHOLD_DAYS) {
      status = 'critical';
    } else if (daysRemaining <= this.WARNING_THRESHOLD_DAYS) {
      status = 'warning';
    } else {
      status = 'healthy';
    }

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      status,
      storageType,
      daysRemaining,
      ttlRemaining
    );

    return {
      currentLedger,
      liveUntilLedger,
      ttlRemaining,
      storageType,
      isExpired,
      expiresIn: {
        ledgers: ttlRemaining,
        seconds: Math.round(secondsRemaining),
        minutes: Math.round(minutesRemaining),
        hours: Math.round(hoursRemaining * 10) / 10,
        days: Math.round(daysRemaining * 100) / 100,
      },
      estimatedExpirationDate,
      status,
      recommendation,
    };
  }

  /**
   * Estimate the cost and impact of extending TTL
   */
  estimateTtlExtension(dto: ExtendTtlEstimateDto, currentLedger?: number): TtlExtensionEstimate {
    const {
      currentTtl,
      extendByLedgers,
      entrySizeBytes = 1024,
      storageType = StorageType.PERSISTENT,
    } = dto;

    // Validate inputs
    if (currentTtl < 0 || extendByLedgers < 1) {
      throw new BadRequestException('Invalid TTL values');
    }

    const newTtl = currentTtl + extendByLedgers;
    const newLiveUntilLedger = currentLedger ? currentLedger + newTtl : undefined;

    // Calculate extended lifetime in days
    const extendedDays = extendByLedgers / this.LEDGERS_PER_DAY;

    // Estimate cost (simplified formula)
    const rentCost = this.calculateRentCost(entrySizeBytes, extendByLedgers, storageType);
    const totalCostStroops = Math.round(rentCost + this.WRITE_FEE_BASE);
    const totalCostXlm = (totalCostStroops / 10_000_000).toFixed(7);

    // Generate recommendation
    const recommendation = this.generateExtensionRecommendation(
      extendedDays,
      totalCostStroops,
      storageType
    );

    return {
      currentTtl,
      extendByLedgers,
      newTtl,
      newLiveUntilLedger,
      extendedLifetime: {
        ledgers: extendByLedgers,
        days: Math.round(extendedDays * 100) / 100,
      },
      estimatedCost: {
        stroops: totalCostStroops,
        xlm: totalCostXlm,
      },
      recommendation,
    };
  }

  /**
   * Bulk estimate expiration for multiple contracts
   */
  async estimateBulkExpiration(dto: BulkEstimateDto): Promise<BulkExpirationResult[]> {
    const { contractAddresses, network } = dto;
    const server = this.getHorizonServer(network);

    const results = await Promise.all(
      contractAddresses.map(async (address) => {
        try {
          // Get current ledger
          const ledgerResponse = await server.ledgers().order('desc').limit(1).call();
          const currentLedger = ledgerResponse.records[0]?.sequence || 0;

          // Fetch contract data (this is simplified - in production you'd use RPC)
          // For now, return mock data structure
          const result: BulkExpirationResult = {
            contractAddress: address,
            instanceTtl: null,
            wasmTtl: null,
            expiresIn: null,
            status: 'healthy',
          };

          // TODO: Implement actual RPC call to get contract TTL
          // const contractData = await this.getContractTtl(address, network);

          return result;
        } catch (error) {
          return {
            contractAddress: address,
            instanceTtl: null,
            wasmTtl: null,
            expiresIn: null,
            status: 'error' as const,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    return results;
  }

  /**
   * Calculate rent cost for storage
   */
  private calculateRentCost(
    sizeBytes: number,
    ledgers: number,
    storageType: StorageType
  ): number {
    // Cost multiplier based on storage type
    const multiplier = storageType === StorageType.TEMPORARY ? 0.5 : 1.0;

    // Simplified rent calculation
    const baseCost = sizeBytes * ledgers * this.RENT_FEE_PER_BYTE_PER_LEDGER;
    return Math.round(baseCost * multiplier);
  }

  /**
   * Generate recommendation based on expiration status
   */
  private generateRecommendation(
    status: string,
    storageType: StorageType,
    daysRemaining: number,
    ttlRemaining: number
  ): string {
    if (status === 'expired') {
      if (storageType === StorageType.TEMPORARY) {
        return 'Entry has expired and been permanently deleted. Temporary storage entries cannot be recovered.';
      }
      return 'Entry has expired and been archived. Use RestoreFootprintOp to restore it before extending TTL.';
    }

    if (status === 'critical') {
      const recommendedExtension = Math.ceil(30 * this.LEDGERS_PER_DAY);
      return `URGENT: Entry expires in ${daysRemaining.toFixed(1)} days (${ttlRemaining} ledgers). Extend TTL by at least ${recommendedExtension} ledgers (≈30 days) immediately.`;
    }

    if (status === 'warning') {
      const recommendedExtension = Math.ceil(90 * this.LEDGERS_PER_DAY);
      return `Entry expires in ${daysRemaining.toFixed(1)} days. Consider extending TTL by ${recommendedExtension} ledgers (≈90 days) to avoid near-term expiration.`;
    }

    return `Entry is healthy with ${daysRemaining.toFixed(1)} days remaining. Monitor regularly and extend TTL before reaching critical threshold.`;
  }

  /**
   * Generate recommendation for TTL extension
   */
  private generateExtensionRecommendation(
    extendedDays: number,
    costStroops: number,
    storageType: StorageType
  ): string {
    const costXlm = (costStroops / 10_000_000).toFixed(7);

    if (extendedDays < 30) {
      return `Extension of ${extendedDays.toFixed(1)} days is short-term. Consider extending by 90+ days to reduce transaction frequency and overall costs.`;
    }

    if (extendedDays >= 365) {
      if (storageType === StorageType.TEMPORARY) {
        return `WARNING: Extending temporary storage by ${extendedDays.toFixed(0)} days (${costXlm} XLM). Temporary storage should only be used for short-term data. Consider using persistent storage instead.`;
      }
      return `Extension of ${extendedDays.toFixed(0)} days (${costXlm} XLM) provides long-term protection. This is recommended for critical persistent data.`;
    }

    return `Extension of ${extendedDays.toFixed(1)} days costs approximately ${costXlm} XLM. This provides a good balance between cost and protection.`;
  }

  /**
   * Get Horizon server instance
   */
  private getHorizonServer(network: 'testnet' | 'mainnet'): StellarSdk.Horizon.Server {
    const url =
      network === 'mainnet'
        ? this.config.get<string>('STELLAR_HORIZON_MAINNET_URL', 'https://horizon.stellar.org')
        : this.config.get<string>('STELLAR_HORIZON_URL', 'https://horizon-testnet.stellar.org');

    return new StellarSdk.Horizon.Server(url);
  }
}
