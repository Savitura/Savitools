import { StrKey, xdr } from '@stellar/stellar-sdk';
import { decodeScVal, DecodedScVal } from '../contracts/scval-decoder';

/**
 * Friendly names for well-known Soroban event topic symbols (SEP-41 / token
 * events and a few common custom ones). Unknown topics stay null so the UI
 * can fall back to raw hex.
 */
export const WELL_KNOWN_TOPIC_NAMES: Record<string, string> = {
  transfer: 'Transfer',
  mint: 'Mint',
  burn: 'Burn',
  approve: 'Approve',
  clawback: 'Clawback',
  set_admin: 'SetAdmin',
  set_authorized: 'SetAuthorized',
  allowance: 'Allowance',
  balance: 'Balance',
  deposit: 'Deposit',
  withdraw: 'Withdraw',
  swap: 'Swap',
};

export interface DecodedEventTopic {
  index: number;
  /** Well-known or symbol/string label; null → show rawHex. */
  friendlyName: string | null;
  value: DecodedScVal | null;
  rawHex: string;
}

export interface DecodedSorobanEvent {
  index: number;
  contractId: string | null;
  type: string;
  /** Resolved event name (topic[0] friendly / symbol); null if unknown. */
  eventName: string | null;
  /** Human-readable signature, e.g. `Transfer(Address, Address, I108)`. */
  signature: string;
  topics: DecodedEventTopic[];
  data: DecodedScVal | null;
  inSuccessfulContractCall: boolean;
  /** True when topic/data decoding partially failed. */
  partial: boolean;
}

export interface SorobanEventFilter {
  contractId?: string;
  eventName?: string;
}

export interface GroupedSorobanEvents {
  contractId: string | null;
  events: DecodedSorobanEvent[];
}

function scValRawHex(val: xdr.ScVal): string {
  try {
    return Buffer.from(val.toXDR()).toString('hex');
  } catch {
    try {
      return val.toXDR('hex');
    } catch {
      return '';
    }
  }
}

function contractIdFromHash(hash: Buffer | Uint8Array | null | undefined): string | null {
  if (!hash) return null;
  try {
    return StrKey.encodeContract(Buffer.from(hash));
  } catch {
    return Buffer.from(hash).toString('hex');
  }
}

function eventTypeName(type: xdr.ContractEventType): string {
  try {
    // xdr enums expose a name() accessor in the Stellar SDK.
    const name = typeof (type as unknown as { name?: () => string }).name === 'function'
      ? (type as unknown as { name: () => string }).name()
      : (type as unknown as { name?: string }).name;
    if (typeof name === 'string' && name.length > 0) {
      // contractEventTypeContract → contract
      return name.replace(/^contractEventType/i, '').toLowerCase() || name;
    }
  } catch {
    /* fall through */
  }
  // Numeric fallback: 0 = system, 1 = contract, 2 = diagnostic.
  try {
    const v = (type as unknown as { value?: () => number }).value;
    const num = typeof v === 'function' ? v.call(type) : (type as unknown as { value?: number }).value;
    if (num === 0) return 'system';
    if (num === 1) return 'contract';
    if (num === 2) return 'diagnostic';
  } catch {
    /* ignore */
  }
  return 'unknown';
}

function resolveFriendlyName(decoded: DecodedScVal | null): string | null {
  if (!decoded) return null;
  if (
    (decoded.type === 'scvSymbol' || decoded.type === 'scvString') &&
    typeof decoded.value === 'string' &&
    decoded.value.length > 0
  ) {
    const key = decoded.value.toLowerCase();
    return WELL_KNOWN_TOPIC_NAMES[key] ?? decoded.value;
  }
  return null;
}

function shortTypeLabel(decoded: DecodedScVal | null): string {
  if (!decoded) return 'Raw';
  const t = decoded.type.replace(/^scv/i, '');
  if (!t) return 'Unknown';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function buildSignature(eventName: string | null, topics: DecodedEventTopic[], data: DecodedScVal | null): string {
  const name = eventName ?? 'event';
  // Skip topic[0] (the name) if it resolved to a name; otherwise keep all topics.
  const argTopics = eventName ? topics.slice(1) : topics;
  const typed = [
    ...argTopics.map((t) => shortTypeLabel(t.value)),
    shortTypeLabel(data),
  ];
  return `${name}(${typed.join(', ')})`;
}

function decodeTopic(val: xdr.ScVal, index: number): DecodedEventTopic {
  const rawHex = scValRawHex(val);
  try {
    const value = decodeScVal(val);
    return {
      index,
      friendlyName: resolveFriendlyName(value),
      value,
      rawHex: rawHex || value.raw,
    };
  } catch {
    return {
      index,
      friendlyName: null,
      value: null,
      rawHex: rawHex || 'undecodable',
    };
  }
}

/**
 * Decode a single ContractEvent. Never throws — malformed bodies degrade to
 * raw-hex topics so one bad event cannot crash the inspector.
 */
export function decodeContractEvent(
  event: xdr.ContractEvent,
  index: number,
  inSuccessfulContractCall = true,
): DecodedSorobanEvent {
  let contractId: string | null = null;
  let type = 'unknown';
  let topics: DecodedEventTopic[] = [];
  let data: DecodedScVal | null = null;
  let partial = false;

  try {
    contractId = contractIdFromHash(event.contractId());
  } catch {
    partial = true;
  }

  try {
    type = eventTypeName(event.type());
  } catch {
    partial = true;
  }

  try {
    const body = event.body();
    // Currently only v0 bodies exist on-chain.
    const v0 = body.value() as xdr.ContractEventV0;
    const rawTopics = v0.topics() ?? [];
    topics = rawTopics.map((t, i) => {
      const decoded = decodeTopic(t, i);
      if (!decoded.value) partial = true;
      return decoded;
    });
    try {
      data = decodeScVal(v0.data());
    } catch {
      data = null;
      partial = true;
    }
  } catch {
    partial = true;
    topics = [];
    data = null;
  }

  const eventName = topics[0]?.friendlyName ?? null;
  const signature = buildSignature(eventName, topics, data);

  return {
    index,
    contractId,
    type,
    eventName,
    signature,
    topics,
    data,
    inSuccessfulContractCall,
    partial,
  };
}

function collectFromSorobanMeta(meta: xdr.SorobanTransactionMeta): DecodedSorobanEvent[] {
  const out: DecodedSorobanEvent[] = [];
  let index = 0;

  try {
    const contractEvents = meta.events?.() ?? [];
    for (const ev of contractEvents) {
      out.push(decodeContractEvent(ev, index++, true));
    }
  } catch {
    // ignore — version skew
  }

  try {
    const diags = meta.diagnosticEvents?.() ?? [];
    for (const diag of diags) {
      try {
        const ok = Boolean(diag.inSuccessfulContractCall());
        out.push(decodeContractEvent(diag.event(), index++, ok));
      } catch {
        // skip malformed diagnostic entry
      }
    }
  } catch {
    // ignore
  }

  return out;
}

function extractSorobanMeta(meta: xdr.TransactionMeta): xdr.SorobanTransactionMeta | null {
  // Try named arms first (v3/v4), then numeric switch fallbacks.
  for (const arm of ['v3', 'v4'] as const) {
    try {
      const accessor = (meta as unknown as Record<string, () => { sorobanMeta?: () => xdr.SorobanTransactionMeta | null }>)[arm];
      if (typeof accessor !== 'function') continue;
      const soroban = accessor.call(meta)?.sorobanMeta?.();
      if (soroban) return soroban;
    } catch {
      /* try next */
    }
  }

  // Numeric switch fallback (SDK variants that expose a numeric switch).
  try {
    const switchVal = (meta as unknown as { switch?: () => number }).switch;
    const sw = typeof switchVal === 'function' ? switchVal.call(meta) : undefined;
    if (sw !== undefined && sw >= 3) {
      const v3 = (meta as unknown as { v3?: () => xdr.TransactionMetaV3 }).v3;
      const accessor = typeof v3 === 'function' ? v3.call(meta) : undefined;
      const soroban = accessor?.sorobanMeta?.();
      if (soroban) return soroban;
    }
  } catch {
    /* ignore */
  }

  return null;
}

/**
 * Extract and decode Soroban events from a Horizon `result_meta_xdr` blob.
 * Returns [] on missing/unparseable meta (never throws).
 */
export function parseSorobanEventsFromMeta(resultMetaXdr: string | null | undefined): DecodedSorobanEvent[] {
  if (!resultMetaXdr || typeof resultMetaXdr !== 'string' || !resultMetaXdr.trim()) {
    return [];
  }

  try {
    const meta = xdr.TransactionMeta.fromXDR(resultMetaXdr, 'base64');
    const soroban = extractSorobanMeta(meta);
    if (!soroban) return [];
    return collectFromSorobanMeta(soroban);
  } catch {
    return [];
  }
}

/**
 * Filter decoded events by contract ID and/or event name (case-insensitive
 * substring match on friendly name and raw topic[0] symbol).
 */
export function filterSorobanEvents(
  events: DecodedSorobanEvent[],
  filter: SorobanEventFilter = {},
): DecodedSorobanEvent[] {
  const contractNeedle = filter.contractId?.trim().toLowerCase();
  const nameNeedle = filter.eventName?.trim().toLowerCase();

  return events.filter((ev) => {
    if (contractNeedle) {
      const id = (ev.contractId ?? '').toLowerCase();
      if (!id.includes(contractNeedle)) return false;
    }
    if (nameNeedle) {
      const candidates = [
        ev.eventName ?? '',
        ev.signature,
        ev.topics[0]?.value && typeof ev.topics[0].value.value === 'string'
          ? String(ev.topics[0].value.value)
          : '',
        ev.topics[0]?.rawHex ?? '',
      ].map((s) => s.toLowerCase());
      if (!candidates.some((c) => c.includes(nameNeedle))) return false;
    }
    return true;
  });
}

/** Group events by emitting contract (null contract → `"_unknown"`). */
export function groupSorobanEventsByContract(
  events: DecodedSorobanEvent[],
): GroupedSorobanEvents[] {
  const map = new Map<string, DecodedSorobanEvent[]>();
  for (const ev of events) {
    const key = ev.contractId ?? '_unknown';
    const list = map.get(key);
    if (list) list.push(ev);
    else map.set(key, [ev]);
  }
  return [...map.entries()].map(([key, grouped]) => ({
    contractId: key === '_unknown' ? null : key,
    events: grouped,
  }));
}
