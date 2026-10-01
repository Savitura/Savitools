import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { PathPaymentLabDto } from './dto/path-payment-lab.dto';
import { Direction } from './dto/find-paths.dto';
import {
  HorizonSimulatedPath,
  SimulatorService,
  StrictReceiveResult,
  StrictSendResult,
} from './simulator.service';
import {
  SlippageComparisonResult,
  SlippageDirection,
  compareSlippageScenarios,
  parseLabAmount,
} from './slippage-lab';

export type PathPaymentLabNetwork = 'mainnet' | 'testnet';

export interface PathPaymentLabRoute {
  index: number;
  pathLength: number;
  sourceAmount: string;
  destinationAmount: string;
  exchangeRate: string;
  /** The pinned leg for this direction. */
  fixedAmount: string;
  /** The leg the network prices at fill time. */
  variableAmount: string;
  hops: HorizonSimulatedPath['path'];
}

export interface PathPaymentLabResult {
  network: PathPaymentLabNetwork;
  direction: SlippageDirection;
  sourceAsset: string;
  destinationAsset: string;
  /** How many routes Horizon returned for this pair and amount. */
  routeCount: number;
  route: PathPaymentLabRoute;
  comparison: SlippageComparisonResult;
}

/**
 * Path-payment simulation lab (Savitura/Savitools#351).
 *
 * The lab answers one question with numbers rather than intuition: given the
 * routes that exist right now, *which slippage tolerance survives a given
 * adverse rate move, and which one does not?*
 *
 * It deliberately adds no persistence. A run is a pure function of the live
 * Horizon route table plus the caller's tolerances, so caching it would only
 * serve a number the caller is about to act on anyway, and the route table
 * moves under any quote that is even a few seconds old. The arithmetic lives in
 * `slippage-lab.ts` so it can be pinned without a network in the loop.
 */
@Injectable()
export class PathPaymentLabService {
  private readonly logger = new Logger(PathPaymentLabService.name);

  constructor(private readonly simulatorService: SimulatorService) {}

  async run(dto: PathPaymentLabDto): Promise<PathPaymentLabResult> {
    try {
      return await this.simulate(dto);
    } catch (error: unknown) {
      throw this.translate(error);
    }
  }

  /**
   * Everything below is the response the caller gets when a run cannot complete.
   *
   * The whole of `run` is wrapped, not just the network call: the *response*
   * amounts come from Horizon rather than from the validated request body, so a
   * malformed amount can only be caught by the amount parser. Left untranslated
   * that is a `RangeError` and therefore a 500, which would tell a caller their
   * own request was malformed when it was the upstream route table.
   */
  private translate(error: unknown): Error {
    if (error instanceof HttpException) {
      return error;
    }
    if (error instanceof RangeError) {
      this.logger.warn(`Path payment lab rejected an upstream amount: ${error.message}`);
      return new BadRequestException(error.message);
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`Path payment lab route lookup failed: ${message}`);
    return new BadRequestException(`Route lookup failed: ${message}`);
  }

  private async simulate(dto: PathPaymentLabDto): Promise<PathPaymentLabResult> {
    const network: PathPaymentLabNetwork = dto.network ?? 'testnet';
    const routeIndex = dto.routeIndex ?? 0;

    const result =
      dto.direction === Direction.STRICT_SEND
        ? await this.fetchStrictSend(dto, network)
        : await this.fetchStrictReceive(dto, network);

    const routes = result.paths;
    if (routeIndex >= routes.length) {
      // The caller pinned a route that does not exist. Name the routes that do,
      // so a stale shared link says what to pick instead of just "out of range".
      throw new BadRequestException(
        `routeIndex ${routeIndex} is out of range: Horizon returned ${routes.length} route(s) for this pair and amount`,
      );
    }

    const direction: SlippageDirection =
      dto.direction === Direction.STRICT_SEND ? 'strict_send' : 'strict_receive';
    const chosen = routes[routeIndex];
    const best = routes.reduce((top, route) =>
      direction === 'strict_send'
        ? Number(route.destinationAmount) > Number(top.destinationAmount)
          ? route
          : top
        : Number(route.sourceAmount) < Number(top.sourceAmount)
          ? route
          : top,
    );

    const comparison = compareSlippageScenarios({
      direction,
      fixedAmountStroops: parseLabAmount(
        direction === 'strict_send' ? chosen.sourceAmount : chosen.destinationAmount,
        direction === 'strict_send' ? 'sourceAmount' : 'destinationAmount',
      ),
      variableAmountStroops: parseLabAmount(
        direction === 'strict_send' ? chosen.destinationAmount : chosen.sourceAmount,
        direction === 'strict_send' ? 'destinationAmount' : 'sourceAmount',
      ),
      slippageScenarios: dto.slippageScenarios,
      adverseMovePercent: dto.adverseMovePercent ?? 0,
      bestVariableAmountStroops: parseLabAmount(
        direction === 'strict_send' ? best.destinationAmount : best.sourceAmount,
        'best route amount',
      ),
    });

    return {
      network,
      direction,
      sourceAsset: dto.sourceAsset,
      destinationAsset: dto.destinationAsset,
      routeCount: routes.length,
      route: {
        index: routeIndex,
        pathLength: chosen.pathLength,
        sourceAmount: chosen.sourceAmount,
        destinationAmount: chosen.destinationAmount,
        exchangeRate: chosen.exchangeRate,
        fixedAmount: comparison.fixedAmount,
        variableAmount: comparison.quotedVariableAmount,
        hops: chosen.path,
      },
      comparison,
    };
  }

  private async fetchStrictSend(
    dto: PathPaymentLabDto,
    network: PathPaymentLabNetwork,
  ): Promise<StrictSendResult> {
    return this.simulatorService.simulateStrictSend({
      sourceAsset: dto.sourceAsset,
      sourceAmount: dto.amount,
      destAsset: dto.destinationAsset,
      network,
    });
  }

  private async fetchStrictReceive(
    dto: PathPaymentLabDto,
    network: PathPaymentLabNetwork,
  ): Promise<StrictReceiveResult> {
    return this.simulatorService.simulateStrictReceive({
      sourceAsset: dto.sourceAsset,
      destAsset: dto.destinationAsset,
      destAmount: dto.amount,
      network,
    });
  }
}
