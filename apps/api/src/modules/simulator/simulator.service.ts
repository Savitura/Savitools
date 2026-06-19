import { Injectable, Logger } from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Direction, AssetType, FindPathsDto } from './dto/find-paths.dto';
import { EstimateDto } from './dto/estimate.dto';

export interface SimulatedAsset {
  type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
  code?: string;
  issuer?: string;
  label: string;
}

export interface SimulatedPath {
  source_asset: SimulatedAsset;
  destination_asset: SimulatedAsset;
  source_amount: string;
  destination_amount: string;
  path: SimulatedAsset[];
  effective_rate: string;
  estimated_fee: string;
  recommended_slippage: number;
  hops: number;
}

export interface EstimateResult {
  destination_min?: string;
  send_max?: string;
  source_amount: string;
  destination_amount: string;
  path: SimulatedAsset[];
}

@Injectable()
export class SimulatorService {
  private readonly logger = new Logger(SimulatorService.name);

  private readonly servers = {
    mainnet: new StellarSdk.Horizon.Server('https://horizon.stellar.org'),
    testnet: new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org'),
  };

  private buildAsset(
    type: AssetType,
    code?: string,
    issuer?: string,
  ): StellarSdk.Asset {
    if (type === AssetType.NATIVE) {
      return StellarSdk.Asset.native();
    }
    if (!code || !issuer) {
      throw new Error(
        `Asset code and issuer are required for ${type} assets`,
      );
    }
    return new StellarSdk.Asset(code, issuer);
  }

  private parseAsset(
    raw: {
      asset_type?: string;
      asset_code?: string;
      asset_issuer?: string;
    },
    fallbackType?: AssetType,
  ): SimulatedAsset {
    const type =
      (raw.asset_type as SimulatedAsset['type']) ??
      (fallbackType as SimulatedAsset['type']) ??
      'native';
    const code = raw.asset_code;
    const issuer = raw.asset_issuer;

    let label: string;
    if (type === 'native') {
      label = 'XLM';
    } else if (code && issuer) {
      label = `${code}:${issuer.slice(0, 4)}…${issuer.slice(-4)}`;
    } else {
      label = code ?? 'Unknown';
    }

    return { type, code, issuer, label };
  }

  private calculateRecommendedSlippage(
    sourceAmount: string,
    destinationAmount: string,
    hops: number,
  ): number {
    const src = parseFloat(sourceAmount);
    const dst = parseFloat(destinationAmount);

    if (src === 0 || dst === 0 || isNaN(src) || isNaN(dst)) {
      return Math.min(1 + hops * 0.5, 10);
    }

    const rateDeviation = Math.abs(1 - dst / src);
    const depthPenalty = hops * 0.3;
    const baseSlippage = Math.max(rateDeviation * 100, 0.1);
    const recommended = Math.min(baseSlippage * 1.5 + depthPenalty, 25);

    return Math.round(recommended * 10) / 10;
  }

  async findPaths(dto: FindPathsDto): Promise<SimulatedPath[]> {
    const network = dto.network ?? 'testnet';
    const server = this.servers[network];

    const sourceAsset = this.buildAsset(
      dto.source_asset_type,
      dto.source_asset_code,
      dto.source_asset_issuer,
    );
    const destAsset = this.buildAsset(
      dto.destination_asset_type,
      dto.destination_asset_code,
      dto.destination_asset_issuer,
    );

    let rawPaths: any[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serverAny = server as any;

    if (dto.direction === Direction.STRICT_SEND) {
      const result = await serverAny
        .strictSendPaths(sourceAsset, dto.amount, [destAsset])
        .call();
      rawPaths = result.records;
    } else {
      const result = await serverAny
        .strictReceivePaths([sourceAsset], dto.amount, destAsset)
        .call();
      rawPaths = result.records;
    }

    return rawPaths.map((record: any) => {
      const sourceAssetParsed = this.parseAsset({
        asset_type: record.source_asset_type,
        asset_code: record.source_asset_code,
        asset_issuer: record.source_asset_issuer,
      });
      const destAssetParsed = this.parseAsset({
        asset_type: record.destination_asset_type,
        asset_code: record.destination_asset_code,
        asset_issuer: record.destination_asset_issuer,
      });

      const intermediateAssets: SimulatedAsset[] = (record.path ?? []).map(
        (p: any) => this.parseAsset(p),
      );

      const srcAmt = parseFloat(record.source_amount);
      const dstAmt = parseFloat(record.destination_amount);
      const effectiveRate =
        dstAmt > 0 && srcAmt > 0
          ? (dstAmt / srcAmt).toFixed(8)
          : 'N/A';

      return {
        source_asset: sourceAssetParsed,
        destination_asset: destAssetParsed,
        source_amount: record.source_amount,
        destination_amount: record.destination_amount,
        path: intermediateAssets,
        effective_rate: effectiveRate,
        estimated_fee: '0.00001',
        recommended_slippage: this.calculateRecommendedSlippage(
          record.source_amount,
          record.destination_amount,
          intermediateAssets.length,
        ),
        hops: intermediateAssets.length,
      };
    });
  }

  async estimateSlippage(dto: EstimateDto): Promise<EstimateResult> {
    const network = dto.network ?? 'testnet';
    const server = this.servers[network];

    const sourceAsset = this.buildAsset(
      dto.source_asset.type as AssetType,
      dto.source_asset.code,
      dto.source_asset.issuer,
    );
    const destAsset = this.buildAsset(
      dto.destination_asset.type as AssetType,
      dto.destination_asset.code,
      dto.destination_asset.issuer,
    );

    let rawPaths: any[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serverAny = server as any;

    if (dto.direction === Direction.STRICT_SEND) {
      const result = await serverAny
        .strictSendPaths(sourceAsset, dto.amount, [destAsset])
        .call();
      rawPaths = result.records;
    } else {
      const result = await serverAny
        .strictReceivePaths([sourceAsset], dto.amount, destAsset)
        .call();
      rawPaths = result.records;
    }

    if (rawPaths.length === 0) {
      throw new Error(
        'No paths found for the given assets and amount',
      );
    }

    const bestPath = rawPaths[0];

    const intermediateAssets: SimulatedAsset[] = (bestPath.path ?? []).map(
      (p: any) => this.parseAsset(p),
    );

    const srcAmt = parseFloat(bestPath.source_amount);
    const dstAmt = parseFloat(bestPath.destination_amount);

    const slippageMultiplier = 1 - dto.slippage_percent / 100;

    if (dto.direction === Direction.STRICT_SEND) {
      const destinationMin = (dstAmt * slippageMultiplier).toFixed(7);
      return {
        destination_min: destinationMin,
        source_amount: bestPath.source_amount,
        destination_amount: bestPath.destination_amount,
        path: intermediateAssets,
      };
    } else {
      const sendMax = (srcAmt / slippageMultiplier).toFixed(7);
      return {
        send_max: sendMax,
        source_amount: bestPath.source_amount,
        destination_amount: bestPath.destination_amount,
        path: intermediateAssets,
      };
    }
  }
}
