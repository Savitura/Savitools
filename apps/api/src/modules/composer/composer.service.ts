import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  Asset,
  Horizon,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
  Transaction,
} from '@stellar/stellar-sdk';
import { BuildTransactionDto, OperationDto } from './dto/build-transaction.dto';
import { SimulateTransactionDto } from './dto/simulate-transaction.dto';

// ---------------------------------------------------------------------------
// Static operation-type manifest returned by GET /composer/operations
// ---------------------------------------------------------------------------

export const OPERATION_MANIFEST = [
  {
    type: 'payment',
    label: 'Payment',
    description: 'Send an asset to another account',
    fields: [
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'asset.code', label: 'Asset Code', type: 'text', required: true, placeholder: 'XLM / USDC' },
      { name: 'asset.issuer', label: 'Asset Issuer', type: 'text', required: false, placeholder: 'G… (omit for XLM)' },
      { name: 'amount', label: 'Amount', type: 'number', required: true, placeholder: '10' },
    ],
  },
  {
    type: 'create_account',
    label: 'Create Account',
    description: 'Fund a brand-new Stellar account',
    fields: [
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'startingBalance', label: 'Starting Balance (XLM)', type: 'number', required: true, placeholder: '1' },
    ],
  },
  {
    type: 'change_trust',
    label: 'Change Trust',
    description: 'Add or remove a trustline for an asset',
    fields: [
      { name: 'asset.code', label: 'Asset Code', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'asset.issuer', label: 'Asset Issuer', type: 'text', required: true, placeholder: 'G…' },
      { name: 'limit', label: 'Limit', type: 'number', required: false, placeholder: 'Max (omit) or 0 to remove' },
    ],
  },
  {
    type: 'manage_sell_offer',
    label: 'Manage Sell Offer',
    description: 'Create, update or delete a sell offer on the DEX',
    fields: [
      { name: 'selling.code', label: 'Selling Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'selling.issuer', label: 'Selling Issuer', type: 'text', required: false, placeholder: 'G… (omit for XLM)' },
      { name: 'buying.code', label: 'Buying Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'buying.issuer', label: 'Buying Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'amount', label: 'Amount to Sell', type: 'number', required: true, placeholder: '100' },
      { name: 'price.n', label: 'Price Numerator', type: 'number', required: true, placeholder: '1' },
      { name: 'price.d', label: 'Price Denominator', type: 'number', required: true, placeholder: '1' },
      { name: 'offerId', label: 'Offer ID (0 = new)', type: 'number', required: false, placeholder: '0' },
    ],
  },
  {
    type: 'manage_buy_offer',
    label: 'Manage Buy Offer',
    description: 'Create, update or delete a buy offer on the DEX',
    fields: [
      { name: 'selling.code', label: 'Selling Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'selling.issuer', label: 'Selling Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'buying.code', label: 'Buying Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'buying.issuer', label: 'Buying Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'buyAmount', label: 'Amount to Buy', type: 'number', required: true, placeholder: '100' },
      { name: 'price.n', label: 'Price Numerator', type: 'number', required: true, placeholder: '1' },
      { name: 'price.d', label: 'Price Denominator', type: 'number', required: true, placeholder: '1' },
      { name: 'offerId', label: 'Offer ID (0 = new)', type: 'number', required: false, placeholder: '0' },
    ],
  },
  {
    type: 'create_passive_sell_offer',
    label: 'Passive Sell Offer',
    description: 'Sell offer that does not cross existing offers',
    fields: [
      { name: 'selling.code', label: 'Selling Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'selling.issuer', label: 'Selling Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'buying.code', label: 'Buying Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'buying.issuer', label: 'Buying Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'amount', label: 'Amount', type: 'number', required: true, placeholder: '100' },
      { name: 'price.n', label: 'Price Numerator', type: 'number', required: true, placeholder: '1' },
      { name: 'price.d', label: 'Price Denominator', type: 'number', required: true, placeholder: '1' },
    ],
  },
  {
    type: 'set_options',
    label: 'Set Options',
    description: 'Configure account flags, thresholds, home domain',
    fields: [
      { name: 'inflationDest', label: 'Inflation Destination', type: 'text', required: false, placeholder: 'G…' },
      { name: 'homeDomain', label: 'Home Domain', type: 'text', required: false, placeholder: 'example.com' },
      { name: 'masterWeight', label: 'Master Weight', type: 'number', required: false, placeholder: '1' },
      { name: 'lowThreshold', label: 'Low Threshold', type: 'number', required: false, placeholder: '0' },
      { name: 'medThreshold', label: 'Med Threshold', type: 'number', required: false, placeholder: '0' },
      { name: 'highThreshold', label: 'High Threshold', type: 'number', required: false, placeholder: '0' },
      { name: 'setFlags', label: 'Set Flags (bitmask)', type: 'number', required: false, placeholder: '0' },
      { name: 'clearFlags', label: 'Clear Flags (bitmask)', type: 'number', required: false, placeholder: '0' },
    ],
  },
  {
    type: 'account_merge',
    label: 'Account Merge',
    description: 'Merge this account into another, sending all XLM',
    fields: [
      { name: 'destination', label: 'Merge Into', type: 'text', required: true, placeholder: 'G…' },
    ],
  },
  {
    type: 'allow_trust',
    label: 'Allow Trust',
    description: 'Authorize a trustor to hold your issued asset',
    fields: [
      { name: 'trustor', label: 'Trustor', type: 'text', required: true, placeholder: 'G…' },
      { name: 'assetCode', label: 'Asset Code', type: 'text', required: true, placeholder: 'MYTOKEN' },
      { name: 'authorize', label: 'Authorize', type: 'boolean', required: true, placeholder: 'true / false' },
    ],
  },
  {
    type: 'path_payment_strict_send',
    label: 'Path Payment (Strict Send)',
    description: 'Send exact amount; recipient gets at least destMin',
    fields: [
      { name: 'sendAsset.code', label: 'Send Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'sendAsset.issuer', label: 'Send Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'sendAmount', label: 'Send Amount', type: 'number', required: true, placeholder: '10' },
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'destAsset.code', label: 'Dest Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'destAsset.issuer', label: 'Dest Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'destMin', label: 'Dest Min', type: 'number', required: true, placeholder: '9.5' },
    ],
  },
  {
    type: 'path_payment_strict_receive',
    label: 'Path Payment (Strict Receive)',
    description: 'Recipient gets exact amount; sender pays at most sendMax',
    fields: [
      { name: 'sendAsset.code', label: 'Send Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'sendAsset.issuer', label: 'Send Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'sendMax', label: 'Send Max', type: 'number', required: true, placeholder: '15' },
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'destAsset.code', label: 'Dest Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'destAsset.issuer', label: 'Dest Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'destAmount', label: 'Dest Amount', type: 'number', required: true, placeholder: '10' },
    ],
  },
  {
    type: 'manage_data',
    label: 'Manage Data',
    description: 'Set or delete an arbitrary key-value data entry',
    fields: [
      { name: 'name', label: 'Key', type: 'text', required: true, placeholder: 'my-key' },
      { name: 'value', label: 'Value', type: 'text', required: false, placeholder: 'my-value (omit to delete)' },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveAsset(dto: { code: string; issuer?: string }): Asset {
  if (dto.code === 'native' || dto.code === 'XLM') return Asset.native();
  if (!dto.issuer) throw new BadRequestException(`Asset ${dto.code} requires an issuer`);
  return new Asset(dto.code, dto.issuer);
}

function buildOp(dto: OperationDto): ReturnType<typeof Operation.payment> {
  switch (dto.type) {
    case 'payment':
      return Operation.payment({
        destination: dto.destination,
        asset: resolveAsset(dto.asset),
        amount: dto.amount,
      });

    case 'create_account':
      return Operation.createAccount({
        destination: dto.destination,
        startingBalance: dto.startingBalance,
      });

    case 'change_trust':
      return Operation.changeTrust({
        asset: resolveAsset(dto.asset) as Asset,
        limit: dto.limit,
      });

    case 'manage_sell_offer':
      return Operation.manageSellOffer({
        selling: resolveAsset(dto.selling),
        buying: resolveAsset(dto.buying),
        amount: dto.amount,
        price: { n: Number(dto.price.n), d: Number(dto.price.d) },
        offerId: dto.offerId ?? '0',
      });

    case 'manage_buy_offer':
      return Operation.manageBuyOffer({
        selling: resolveAsset(dto.selling),
        buying: resolveAsset(dto.buying),
        buyAmount: dto.buyAmount,
        price: { n: Number(dto.price.n), d: Number(dto.price.d) },
        offerId: dto.offerId ?? '0',
      });

    case 'create_passive_sell_offer':
      return Operation.createPassiveSellOffer({
        selling: resolveAsset(dto.selling),
        buying: resolveAsset(dto.buying),
        amount: dto.amount,
        price: { n: Number(dto.price.n), d: Number(dto.price.d) },
      });

    case 'set_options':
      return Operation.setOptions({
        inflationDest: dto.inflationDest,
        clearFlags: dto.clearFlags,
        setFlags: dto.setFlags,
        masterWeight: dto.masterWeight,
        lowThreshold: dto.lowThreshold,
        medThreshold: dto.medThreshold,
        highThreshold: dto.highThreshold,
        homeDomain: dto.homeDomain,
      });

    case 'account_merge':
      return Operation.accountMerge({ destination: dto.destination });

    case 'allow_trust':
      return Operation.allowTrust({
        trustor: dto.trustor,
        assetCode: dto.assetCode,
        authorize: dto.authorize,
      });

    case 'path_payment_strict_send':
      return Operation.pathPaymentStrictSend({
        sendAsset: resolveAsset(dto.sendAsset),
        sendAmount: dto.sendAmount,
        destination: dto.destination,
        destAsset: resolveAsset(dto.destAsset),
        destMin: dto.destMin,
        path: (dto.path ?? []).map(resolveAsset),
      });

    case 'path_payment_strict_receive':
      return Operation.pathPaymentStrictReceive({
        sendAsset: resolveAsset(dto.sendAsset),
        sendMax: dto.sendMax,
        destination: dto.destination,
        destAsset: resolveAsset(dto.destAsset),
        destAmount: dto.destAmount,
        path: (dto.path ?? []).map(resolveAsset),
      });

    case 'manage_data':
      return Operation.manageData({
        name: dto.name,
        value: dto.value ?? null,
      });

    default: {
      const exhaustive: never = dto;
      throw new BadRequestException(`Unknown operation type: ${(exhaustive as OperationDto).type}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ComposerService {
  private readonly logger = new Logger(ComposerService.name);

  getOperations() {
    return OPERATION_MANIFEST;
  }

  async buildTransaction(dto: BuildTransactionDto) {
    const network = dto.network ?? 'testnet';
    const networkPassphrase =
      network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

    const horizonUrl =
      network === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org';

    const server = new Horizon.Server(horizonUrl);

    let account: Horizon.AccountResponse;
    try {
      account = await server.loadAccount(dto.sourceAccount);
    } catch {
      throw new BadRequestException(
        `Source account ${dto.sourceAccount} not found on ${network}`,
      );
    }

    let builder = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase,
    });

    for (const opDto of dto.operations) {
      try {
        builder = builder.addOperation(buildOp(opDto));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new BadRequestException(`Error building ${opDto.type}: ${message}`);
      }
    }

    if (dto.memo) {
      builder = builder.addMemo(Memo.text(dto.memo));
    }

    const tx = builder.setTimeout(180).build();

    return {
      xdr: tx.toXDR(),
      hash: tx.hash().toString('hex'),
      operations: dto.operations.length,
      network,
    };
  }

  async simulateTransaction(dto: SimulateTransactionDto) {
    const network = dto.network ?? 'testnet';
    const networkPassphrase =
      network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

    const horizonUrl =
      network === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org';

    let tx: Transaction;
    try {
      tx = new Transaction(dto.xdr, networkPassphrase);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Invalid XDR: ${message}`);
    }

    const server = new Horizon.Server(horizonUrl);

    try {
      const result = await server.submitTransaction(tx);
      return {
        success: true,
        hash: result.hash,
        fee: result.fee_charged,
        resultCodes: null,
        operationResults: null,
        ledger: result.ledger,
      };
    } catch (err: unknown) {
      const horizonErr = err as {
        response?: {
          data?: {
            extras?: {
              result_codes?: { transaction?: string; operations?: string[] };
            };
            result_xdr?: string;
          };
        };
      };

      const extras = horizonErr.response?.data?.extras;
      const resultCodes = extras?.result_codes ?? null;
      const txCode = resultCodes?.transaction ?? 'unknown';

      this.logger.warn(`Simulation failed: ${txCode}`);

      return {
        success: false,
        hash: null,
        fee: null,
        resultCodes: txCode,
        operationResults: resultCodes?.operations ?? null,
        ledger: null,
      };
    }
  }
}
