import type { Operation } from '@stellar/stellar-sdk';

export interface DecodedOperation {
  type: string;
  label: string;
  fields: Record<string, string | null>;
  sourceAccount: string | null;
}

function assetLabel(asset: { isNative(): boolean; getCode(): string; getIssuer(): string }): string {
  return asset.isNative() ? 'XLM' : `${asset.getCode()}:${asset.getIssuer()}`;
}

function priceLabel(price: { n: number; d: number }): string {
  return `${price.n}/${price.d} (≈${(price.n / price.d).toFixed(7)})`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decodeOperation(op: any): DecodedOperation {
  const source: string | null = op.source ?? null;

  switch (op.type as string) {
    case 'createAccount':
      return {
        type: 'create_account', label: 'Create Account', sourceAccount: source,
        fields: { destination: op.destination, startingBalance: `${op.startingBalance} XLM` },
      };

    case 'payment':
      return {
        type: 'payment', label: 'Payment', sourceAccount: source,
        fields: { destination: op.destination, asset: assetLabel(op.asset), amount: op.amount },
      };

    case 'pathPaymentStrictReceive':
      return {
        type: 'path_payment_strict_receive', label: 'Path Payment (Strict Receive)', sourceAccount: source,
        fields: {
          sendAsset: assetLabel(op.sendAsset), sendMax: op.sendMax,
          destination: op.destination, destAsset: assetLabel(op.destAsset),
          destAmount: op.destAmount,
          path: op.path?.map(assetLabel).join(' → ') || 'direct',
        },
      };

    case 'pathPaymentStrictSend':
      return {
        type: 'path_payment_strict_send', label: 'Path Payment (Strict Send)', sourceAccount: source,
        fields: {
          sendAsset: assetLabel(op.sendAsset), sendAmount: op.sendAmount,
          destination: op.destination, destAsset: assetLabel(op.destAsset),
          destMin: op.destMin,
          path: op.path?.map(assetLabel).join(' → ') || 'direct',
        },
      };

    case 'manageSellOffer':
      return {
        type: 'manage_sell_offer', label: 'Manage Sell Offer', sourceAccount: source,
        fields: {
          selling: assetLabel(op.selling), buying: assetLabel(op.buying),
          amount: op.amount, price: priceLabel(op.price), offerId: String(op.offerId ?? 0),
        },
      };

    case 'manageBuyOffer':
      return {
        type: 'manage_buy_offer', label: 'Manage Buy Offer', sourceAccount: source,
        fields: {
          selling: assetLabel(op.selling), buying: assetLabel(op.buying),
          buyAmount: op.buyAmount, price: priceLabel(op.price), offerId: String(op.offerId ?? 0),
        },
      };

    case 'createPassiveSellOffer':
      return {
        type: 'create_passive_sell_offer', label: 'Passive Sell Offer', sourceAccount: source,
        fields: {
          selling: assetLabel(op.selling), buying: assetLabel(op.buying),
          amount: op.amount, price: priceLabel(op.price),
        },
      };

    case 'setOptions':
      return {
        type: 'set_options', label: 'Set Options', sourceAccount: source,
        fields: {
          inflationDest: op.inflationDest ?? null,
          homeDomain: op.homeDomain ?? null,
          masterWeight: op.masterWeight != null ? String(op.masterWeight) : null,
          lowThreshold: op.lowThreshold != null ? String(op.lowThreshold) : null,
          medThreshold: op.medThreshold != null ? String(op.medThreshold) : null,
          highThreshold: op.highThreshold != null ? String(op.highThreshold) : null,
          setFlags: op.setFlags != null ? String(op.setFlags) : null,
          clearFlags: op.clearFlags != null ? String(op.clearFlags) : null,
          signer: op.signer ? `${op.signer.ed25519PublicKey ?? op.signer.sha256Hash ?? op.signer.preAuthTx} (weight ${op.signer.weight})` : null,
        },
      };

    case 'changeTrust':
      return {
        type: 'change_trust', label: 'Change Trust', sourceAccount: source,
        fields: {
          asset: assetLabel(op.line ?? op.asset),
          limit: op.limit ?? 'max',
        },
      };

    case 'allowTrust':
      return {
        type: 'allow_trust', label: 'Allow Trust', sourceAccount: source,
        fields: { trustor: op.trustor, assetCode: op.assetCode, authorize: String(op.authorize) },
      };

    case 'accountMerge':
      return {
        type: 'account_merge', label: 'Account Merge', sourceAccount: source,
        fields: { destination: op.destination },
      };

    case 'inflation':
      return { type: 'inflation', label: 'Inflation', sourceAccount: source, fields: {} };

    case 'manageData':
      return {
        type: 'manage_data', label: 'Manage Data', sourceAccount: source,
        fields: { name: op.name, value: op.value ? op.value.toString('utf8') : null },
      };

    case 'bumpSequence':
      return {
        type: 'bump_sequence', label: 'Bump Sequence', sourceAccount: source,
        fields: { bumpTo: String(op.bumpTo) },
      };

    case 'createClaimableBalance':
      return {
        type: 'create_claimable_balance', label: 'Create Claimable Balance', sourceAccount: source,
        fields: {
          asset: assetLabel(op.asset), amount: op.amount,
          claimants: op.claimants?.length ? String(op.claimants.length) : '0',
        },
      };

    case 'claimClaimableBalance':
      return {
        type: 'claim_claimable_balance', label: 'Claim Claimable Balance', sourceAccount: source,
        fields: { balanceId: op.balanceId },
      };

    case 'beginSponsoringFutureReserves':
      return {
        type: 'begin_sponsoring_future_reserves', label: 'Begin Sponsoring Future Reserves',
        sourceAccount: source, fields: { sponsoredId: op.sponsoredId },
      };

    case 'endSponsoringFutureReserves':
      return {
        type: 'end_sponsoring_future_reserves', label: 'End Sponsoring Future Reserves',
        sourceAccount: source, fields: {},
      };

    case 'revokeSponsorship':
      return {
        type: 'revoke_sponsorship', label: 'Revoke Sponsorship', sourceAccount: source,
        fields: { type: op.revokeSponsorshipType ?? 'unknown' },
      };

    case 'clawback':
      return {
        type: 'clawback', label: 'Clawback', sourceAccount: source,
        fields: { asset: assetLabel(op.asset), from: op.from, amount: op.amount },
      };

    case 'clawbackClaimableBalance':
      return {
        type: 'clawback_claimable_balance', label: 'Clawback Claimable Balance',
        sourceAccount: source, fields: { balanceId: op.balanceId },
      };

    case 'setTrustLineFlags':
      return {
        type: 'set_trust_line_flags', label: 'Set Trustline Flags', sourceAccount: source,
        fields: {
          trustor: op.trustor, asset: assetLabel(op.asset),
          setFlags: op.setFlags != null ? String(op.setFlags) : null,
          clearFlags: op.clearFlags != null ? String(op.clearFlags) : null,
        },
      };

    case 'liquidityPoolDeposit':
      return {
        type: 'liquidity_pool_deposit', label: 'Liquidity Pool Deposit', sourceAccount: source,
        fields: {
          liquidityPoolId: op.liquidityPoolId,
          maxAmountA: op.maxAmountA, maxAmountB: op.maxAmountB,
          minPrice: priceLabel(op.minPrice), maxPrice: priceLabel(op.maxPrice),
        },
      };

    case 'liquidityPoolWithdraw':
      return {
        type: 'liquidity_pool_withdraw', label: 'Liquidity Pool Withdraw', sourceAccount: source,
        fields: {
          liquidityPoolId: op.liquidityPoolId, amount: op.amount,
          minAmountA: op.minAmountA, minAmountB: op.minAmountB,
        },
      };

    case 'invokeHostFunction':
      return {
        type: 'invoke_host_function', label: 'Invoke Host Function (Soroban)', sourceAccount: source,
        fields: { hostFunction: op.func?.switch?.().name ?? 'unknown' },
      };

    case 'extendFootprintTtl':
      return {
        type: 'extend_footprint_ttl', label: 'Extend Footprint TTL', sourceAccount: source,
        fields: { extendTo: String(op.extendTo) },
      };

    case 'restoreFootprint':
      return {
        type: 'restore_footprint', label: 'Restore Footprint', sourceAccount: source,
        fields: {},
      };

    default:
      return {
        type: op.type ?? 'unknown', label: op.type ?? 'Unknown Operation',
        sourceAccount: source, fields: {},
      };
  }
}
