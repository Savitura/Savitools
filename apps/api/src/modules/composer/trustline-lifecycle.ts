import { BadRequestException } from '@nestjs/common';
import { Asset, Operation } from '@stellar/stellar-sdk';

export type TrustlineAction = 'open' | 'update' | 'remove';

export interface TrustlineRequest {
  code: string;
  issuer: string;
  limit?: string;
}

/** Build one unsigned ChangeTrust operation for the complete lifecycle. */
export function buildTrustlineOperation(request: TrustlineRequest): ReturnType<typeof Operation.changeTrust> {
  const code = request.code.trim();
  const issuer = request.issuer.trim();
  if (!/^[A-Za-z0-9]{1,12}$/.test(code) || code.toUpperCase() === 'XLM') {
    throw new BadRequestException('Trustline asset code must be 1–12 characters and cannot be XLM');
  }
  if (!/^[G][A-Z2-7]{55}$/.test(issuer)) {
    throw new BadRequestException('Trustline issuer must be a Stellar account');
  }
  const limit = request.limit === undefined ? '922337203685.4775807' : request.limit.trim();
  if (!/^\d+(?:\.\d+)?$/.test(limit)) {
    throw new BadRequestException('Trustline limit must be a non-negative decimal amount');
  }
  return Operation.changeTrust({ asset: new Asset(code, issuer), limit });
}

export function trustlineLimitForAction(action: TrustlineAction, limit?: string): string {
  if (action === 'remove') return '0';
  if (action === 'open' && limit === undefined) return '922337203685.4775807';
  if (!limit) throw new BadRequestException(`${action} trustline requires a limit`);
  return limit;
}
