import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { resolveStellarRpcUrl } from '../../config/stellar-endpoints';
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
  status: 'healthy' | 'warning' | 'critical' | 'expired' | 'error';
  error?: string;
}

export interface ContractTtlInfo {
  currentLedger: number;
  instanceTtl: number | null;
  wasmTtl: number | null;
  instanceLiveUntilLedger: number | null;
  wasmLiveUntilLedger: number | null;
  isStellarAsset?: boolean;
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
      ttlRemaining,
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
      storageType,
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
   * Look up actual contract instance and WASM code TTL via Soroban RPC
   */
  async getContractTtl(
    address: string,
    network: 'testnet' | 'mainnet',
  ): Promise<ContractTtlInfo> {
    if (!StellarSdk.StrKey.isValidContract(address)) {
      throw new BadRequestException(`Invalid contract address: ${address}`);
    }

    const rpcServer = this.getSorobanRpcServer(network);
    const latestLedger = await rpcServer.getLatestLedger();
    const currentLedger = latestLedger.sequence;

    const contractScAddress = StellarSdk.Address.fromString(address).toScAddress();
    const instanceKey = StellarSdk.xdr.LedgerKey.contractData(
      new StellarSdk.xdr.LedgerKeyContractData({
        contract: contractScAddress,
        key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: StellarSdk.xdr.ContractDataDurability.persistent(),
      }),
    );

    const instanceResponse = await rpcServer.getLedgerEntries(instanceKey);
    const instanceEntry = instanceResponse.entries?.[0];

    if (!instanceEntry || instanceEntry.liveUntilLedgerSeq === undefined) {
      return {
        currentLedger,
        instanceTtl: null,
        wasmTtl: null,
        instanceLiveUntilLedger: null,
        wasmLiveUntilLedger: null,
      };
    }

    const instanceLiveUntilLedger = instanceEntry.liveUntilLedgerSeq;
    const instanceTtl = Math.max(0, instanceLiveUntilLedger - currentLedger);

    const { wasmHash, isStellarAsset } = this.extractWasmHash(instanceEntry.val);
    if (!wasmHash) {
      return {
        currentLedger,
        instanceTtl,
        wasmTtl: null,
        instanceLiveUntilLedger,
        wasmLiveUntilLedger: null,
        isStellarAsset,
      };
    }

    const wasmKey = StellarSdk.xdr.LedgerKey.contractCode(
      new StellarSdk.xdr.LedgerKeyContractCode({
        hash: wasmHash,
      }),
    );

    const wasmResponse = await rpcServer.getLedgerEntries(wasmKey);
    const wasmEntry = wasmResponse.entries?.[0];
    const wasmLiveUntilLedger =
      wasmEntry?.liveUntilLedgerSeq !== undefined ? wasmEntry.liveUntilLedgerSeq : null;
    const wasmTtl =
      wasmLiveUntilLedger !== null ? Math.max(0, wasmLiveUntilLedger - currentLedger) : null;

    return {
      currentLedger,
      instanceTtl,
      wasmTtl,
      instanceLiveUntilLedger,
      wasmLiveUntilLedger,
      isStellarAsset,
    };
  }

  /**
   * Bulk estimate expiration for multiple contracts
   */
  async estimateBulkExpiration(dto: BulkEstimateDto): Promise<BulkExpirationResult[]> {
    const { contractAddresses, network } = dto;

    const results = await Promise.all(
      contractAddresses.map(async (address) => {
        try {
          const ttlInfo = await this.getContractTtl(address, network);
          return this.buildBulkExpirationResult(address, ttlInfo);
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
      }),
    );

    return results;
  }

  private buildBulkExpirationResult(
    address: string,
    ttlInfo: ContractTtlInfo,
  ): BulkExpirationResult {
    const { instanceTtl, wasmTtl, isStellarAsset } = ttlInfo;

    if (instanceTtl === null || (!isStellarAsset && wasmTtl === null)) {
      return {
        contractAddress: address,
        instanceTtl,
        wasmTtl,
        expiresIn: null,
        status: 'expired',
      };
    }

    const effectiveTtl =
      wasmTtl !== null ? Math.min(instanceTtl, wasmTtl) : instanceTtl;

    if (effectiveTtl <= 0) {
      return {
        contractAddress: address,
        instanceTtl,
        wasmTtl,
        expiresIn: null,
        status: 'expired',
      };
    }

    const daysRemaining = effectiveTtl / this.LEDGERS_PER_DAY;
    let status: BulkExpirationResult['status'];
    if (daysRemaining <= this.CRITICAL_THRESHOLD_DAYS) {
      status = 'critical';
    } else if (daysRemaining <= this.WARNING_THRESHOLD_DAYS) {
      status = 'warning';
    } else {
      status = 'healthy';
    }

    const totalHours = (effectiveTtl * this.LEDGER_CLOSE_TIME_SECONDS) / 3600;

    return {
      contractAddress: address,
      instanceTtl,
      wasmTtl,
      expiresIn: {
        days: Math.floor(totalHours / 24),
        hours: Math.floor(totalHours % 24),
      },
      status,
    };
  }

  private extractWasmHash(val: StellarSdk.xdr.LedgerEntryData): {
    wasmHash: Buffer | null;
    isStellarAsset: boolean;
  } {
    if (val.switch() !== StellarSdk.xdr.LedgerEntryType.contractData()) {
      return { wasmHash: null, isStellarAsset: false };
    }

    const scVal = val.contractData().val();
    if (scVal.switch() !== StellarSdk.xdr.ScValType.scvContractInstance()) {
      return { wasmHash: null, isStellarAsset: false };
    }

    const executable = scVal.instance().executable();
    if (
      executable.switch() ===
      StellarSdk.xdr.ContractExecutableType.contractExecutableWasm()
    ) {
      return {
        wasmHash: Buffer.from(executable.wasmHash()),
        isStellarAsset: false,
      };
    }

    if (
      executable.switch() ===
      StellarSdk.xdr.ContractExecutableType.contractExecutableStellarAsset()
    ) {
      return { wasmHash: null, isStellarAsset: true };
    }

    return { wasmHash: null, isStellarAsset: false };
  }

  /**
   * Calculate rent cost for storage
   */
  private calculateRentCost(sizeBytes: number, ledgers: number, storageType: StorageType): number {
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
    ttlRemaining: number,
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
    storageType: StorageType,
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
   * Get Soroban RPC server instance
   */
  private getSorobanRpcServer(network: 'testnet' | 'mainnet'): StellarSdk.rpc.Server {
    const url = resolveStellarRpcUrl(
      {
        STELLAR_RPC_URL: this.config.get<string>('STELLAR_RPC_URL'),
        STELLAR_RPC_PUBLIC_URL: this.config.get<string>('STELLAR_RPC_PUBLIC_URL'),
        STELLAR_RPC_MAINNET_URL: this.config.get<string>('STELLAR_RPC_MAINNET_URL'),
      },
      network,
    );

    return new StellarSdk.rpc.Server(url, {
      allowHttp: url.startsWith('http://'),
    });
  }
}
