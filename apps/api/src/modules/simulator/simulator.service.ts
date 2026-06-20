import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { SimulateStrictSendDto } from './dto/strict-send.dto';
import { SimulateStrictReceiveDto } from './dto/strict-receive.dto';

export interface PathHop {
  assetType: string;
  assetCode: string | null;
  assetIssuer: string | null;
}

export interface SimulatedPath {
  sourceAmount: string;
  destinationAmount: string;
  path: PathHop[];
  pathLength: number;
  exchangeRate: string;
}

export interface StrictSendResult {
  sourceAsset: string;
  sourceAmount: string;
  destAsset: string;
  network: string;
  mode: 'strict_send';
  totalPathsFound: number;
  paths: SimulatedPath[];
  bestPath: SimulatedPath;
  slippagePercent: string;
}

export interface StrictReceiveResult {
  sourceAsset: string;
  destAsset: string;
  destAmount: string;
  network: string;
  mode: 'strict_receive';
  totalPathsFound: number;
  paths: SimulatedPath[];
  bestPath: SimulatedPath;
  sourceAmountNeeded: string;
  slippagePercent: string;
}

export interface FeeResult {
  network: string;
  operations: number;
  baseFeeStroops: number;
  totalFeeStroops: number;
  totalFeeXlm: string;
  feeChargedPercentiles: {
    p10: string;
    p50: string;
    p90: string;
    p99: string;
  };
  lastLedger: number;
}

interface HorizonPathRecord {
  source_asset_type: string;
  source_asset_code?: string;
  source_asset_issuer?: string;
  source_amount: string;
  destination_asset_type: string;
  destination_asset_code?: string;
  destination_asset_issuer?: string;
  destination_amount: string;
  path: Array<{
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
  }>;
}

@Injectable()
export class SimulatorService {
  private readonly logger = new Logger(SimulatorService.name);

  private readonly horizonUrls: Record<string, string> = {
    mainnet: 'https://horizon.stellar.org',
    testnet: 'https://horizon-testnet.stellar.org',
  };

  private getHorizonUrl(network: string): string {
    const url = this.horizonUrls[network];
    if (!url) {
      throw new BadRequestException(`Invalid network: "${network}". Use "testnet" or "mainnet"`);
    }
    return url;
  }

  private parseAssetParams(assetString: string): { type: string; code?: string; issuer?: string } {
    if (assetString === 'XLM') {
      return { type: 'native' };
    }
    const parts = assetString.split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new BadRequestException(
        `Invalid asset format: "${assetString}". Use "XLM" or "CODE:ISSUER"`,
      );
    }
    const code = parts[0];
    const issuer = parts[1];
    const type = code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12';
    return { type, code, issuer };
  }

  private async fetchFromHorizon(url: string): Promise<any> {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new BadRequestException(
        `Horizon error (${response.status}): ${body || response.statusText}`,
      );
    }
    return response.json();
  }

  private buildHorizonPathUrl(
    horizonUrl: string,
    mode: 'strict_send' | 'strict_receive',
    params: Record<string, string>,
  ): string {
    const base = `${horizonUrl}/paths/${mode}`;
    const qs = new URLSearchParams(params).toString();
    return `${base}?${qs}`;
  }

  async simulateStrictSend(dto: SimulateStrictSendDto): Promise<StrictSendResult> {
    const horizonUrl = this.getHorizonUrl(dto.network);
    const src = this.parseAssetParams(dto.sourceAsset);
    const dst = this.parseAssetParams(dto.destAsset);

    const params: Record<string, string> = {
      source_asset_type: src.type,
      source_amount: dto.sourceAmount,
      destination_asset_type: dst.type,
    };
    if (src.code) params.source_asset_code = src.code;
    if (src.issuer) params.source_asset_issuer = src.issuer;
    if (dst.code) params.destination_asset_code = dst.code;
    if (dst.issuer) params.destination_asset_issuer = dst.issuer;

    let json: { _embedded?: { records?: HorizonPathRecord[] } };
    try {
      const url = this.buildHorizonPathUrl(horizonUrl, 'strict_send', params);
      json = await this.fetchFromHorizon(url);
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Strict send path lookup failed: ${message}`);
      throw new BadRequestException(`Path lookup failed: ${message}`);
    }

    const records = json._embedded?.records ?? [];

    if (records.length === 0) {
      throw new BadRequestException(
        `No path found from ${dto.sourceAsset} to ${dto.destAsset} on ${dto.network}`,
      );
    }

    const paths: SimulatedPath[] = records.map((record) => {
      const destAmount = record.destination_amount;
      const rate = (Number(destAmount) / Number(dto.sourceAmount)).toString();
      return {
        sourceAmount: record.source_amount,
        destinationAmount: destAmount,
        path: record.path.map((hop) => ({
          assetType: hop.asset_type,
          assetCode: hop.asset_code || null,
          assetIssuer: hop.asset_issuer || null,
        })),
        pathLength: record.path.length,
        exchangeRate: rate,
      };
    });

    const bestPath = paths.reduce((best, p) =>
      Number(p.destinationAmount) > Number(best.destinationAmount) ? p : best,
    );

    const slippage = paths.length > 1
      ? ((Number(bestPath.destinationAmount) - Number(paths[paths.length - 1].destinationAmount))
          / Number(bestPath.destinationAmount) * 100).toFixed(2)
      : '0';

    return {
      sourceAsset: dto.sourceAsset,
      sourceAmount: dto.sourceAmount,
      destAsset: dto.destAsset,
      network: dto.network,
      mode: 'strict_send',
      totalPathsFound: paths.length,
      paths,
      bestPath,
      slippagePercent: slippage,
    };
  }

  async simulateStrictReceive(dto: SimulateStrictReceiveDto): Promise<StrictReceiveResult> {
    const horizonUrl = this.getHorizonUrl(dto.network);
    const src = this.parseAssetParams(dto.sourceAsset);
    const dst = this.parseAssetParams(dto.destAsset);

    const params: Record<string, string> = {
      source_asset_type: src.type,
      destination_asset_type: dst.type,
      destination_amount: dto.destAmount,
    };
    if (src.code) params.source_asset_code = src.code;
    if (src.issuer) params.source_asset_issuer = src.issuer;
    if (dst.code) params.destination_asset_code = dst.code;
    if (dst.issuer) params.destination_asset_issuer = dst.issuer;

    let json: { _embedded?: { records?: HorizonPathRecord[] } };
    try {
      const url = this.buildHorizonPathUrl(horizonUrl, 'strict_receive', params);
      json = await this.fetchFromHorizon(url);
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Strict receive path lookup failed: ${message}`);
      throw new BadRequestException(`Path lookup failed: ${message}`);
    }

    const records = json._embedded?.records ?? [];

    if (records.length === 0) {
      throw new BadRequestException(
        `No path found to ${dto.destAsset} for ${dto.destAmount} from ${dto.sourceAsset} on ${dto.network}`,
      );
    }

    const paths: SimulatedPath[] = records.map((record) => {
      const srcAmount = record.source_amount;
      const rate = (Number(dto.destAmount) / Number(srcAmount)).toString();
      return {
        sourceAmount: srcAmount,
        destinationAmount: record.destination_amount,
        path: record.path.map((hop) => ({
          assetType: hop.asset_type,
          assetCode: hop.asset_code || null,
          assetIssuer: hop.asset_issuer || null,
        })),
        pathLength: record.path.length,
        exchangeRate: rate,
      };
    });

    const bestPath = paths.reduce((best, p) =>
      Number(p.sourceAmount) < Number(best.sourceAmount) ? p : best,
    );

    const slippage = paths.length > 1
      ? ((Number(paths[paths.length - 1].sourceAmount) - Number(bestPath.sourceAmount))
          / Number(paths[paths.length - 1].sourceAmount) * 100).toFixed(2)
      : '0';

    return {
      sourceAsset: dto.sourceAsset,
      destAsset: dto.destAsset,
      destAmount: dto.destAmount,
      network: dto.network,
      mode: 'strict_receive',
      totalPathsFound: paths.length,
      paths,
      bestPath,
      sourceAmountNeeded: bestPath.sourceAmount,
      slippagePercent: slippage,
    };
  }

  async simulateFee(operations: number, network: string): Promise<FeeResult> {
    const horizonUrl = this.getHorizonUrl(network);

    let json: Record<string, any>;
    try {
      json = await this.fetchFromHorizon(`${horizonUrl}/fee_stats`);
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Fee stats fetch failed: ${message}`);
      throw new BadRequestException(`Fee stats fetch failed: ${message}`);
    }

    const baseFee = parseInt(json.last_ledger_base_fee, 10) || 100;
    const totalFeeStroops = baseFee * operations;
    const totalFeeXlm = (totalFeeStroops * 1e-7).toFixed(7);

    return {
      network,
      operations,
      baseFeeStroops: baseFee,
      totalFeeStroops,
      totalFeeXlm,
      feeChargedPercentiles: {
        p10: json.fee_charged?.p10 ?? '0',
        p50: json.fee_charged?.p50 ?? '0',
        p90: json.fee_charged?.p90 ?? '0',
        p99: json.fee_charged?.p99 ?? '0',
      },
      lastLedger: json.last_ledger ?? 0,
    };
  }
}
