import { AlertEvaluator } from './alert-evaluator.service';
import { Watch } from './entities/watch.entity';
import {
  AccountStateSnapshot,
  AlertRuleDefinition,
  NormalizedMonitorEvent,
} from './monitor.types';

describe('AlertEvaluator', () => {
  const evaluator = new AlertEvaluator();
  const watch = {
    publicKey: 'GACCOUNT',
  } as Watch;
  const payment = {
    pagingToken: '1',
    source: 'payment',
    eventType: 'payment',
    ledger: 1,
    occurredAt: new Date().toISOString(),
    amount: '100.0000000',
    asset: 'USDC:GISSUER',
    from: 'GSENDER',
    to: 'GACCOUNT',
    payload: {},
  } satisfies NormalizedMonitorEvent;

  it('matches received amounts without floating-point comparisons', () => {
    expect(
      evaluator.matches(
        rule('amount_received_gte', { threshold: '99.9999999' }),
        watch,
        payment,
      ),
    ).toBe(true);
    expect(
      evaluator.matches(
        rule('amount_received_gte', { threshold: '100.0000001' }),
        watch,
        payment,
      ),
    ).toBe(false);
  });

  it('distinguishes sent and received payments', () => {
    expect(
      evaluator.matches(
        rule('amount_sent_gte', { threshold: '1' }),
        watch,
        payment,
      ),
    ).toBe(false);
    expect(
      evaluator.matches(rule('amount_sent_gte', { threshold: '100' }), watch, {
        ...payment,
        from: 'GACCOUNT',
        to: 'GRECEIVER',
      }),
    ).toBe(true);
  });

  it('uses source amounts for outgoing path payments', () => {
    expect(
      evaluator.matches(rule('amount_sent_gte', { threshold: '150' }), watch, {
        ...payment,
        from: 'GACCOUNT',
        to: 'GRECEIVER',
        amount: '100',
        sentAmount: '200',
      }),
    ).toBe(true);
  });

  it('matches assets case-insensitively and only on receipt', () => {
    expect(
      evaluator.matches(
        rule('asset_received', { asset: 'usdc:gissuer' }),
        watch,
        payment,
      ),
    ).toBe(true);
    expect(
      evaluator.matches(
        rule('asset_received', { asset: 'USDC:GISSUER' }),
        watch,
        { ...payment, to: 'GOTHER' },
      ),
    ).toBe(false);
  });

  it('matches failed transactions and any activity', () => {
    const transaction: NormalizedMonitorEvent = {
      ...payment,
      source: 'transaction',
      eventType: 'transaction',
      successful: false,
    };
    expect(evaluator.matches(rule('tx_failed'), watch, transaction)).toBe(true);
    expect(evaluator.matches(rule('any_activity'), watch, transaction)).toBe(
      true,
    );
  });

  it('never fires state rules from a single ledger event', () => {
    expect(
      evaluator.matches(
        rule('balance_above', { threshold: '1' }),
        watch,
        payment,
      ),
    ).toBe(false);
  });

  it('matches event topic equals', () => {
    const contractEvent: NormalizedMonitorEvent = {
      pagingToken: '1',
      source: 'contract',
      eventType: 'contract',
      ledger: 1,
      occurredAt: new Date().toISOString(),
      successful: true,
      transactionHash: 'tx123',
      payload: {
        topic: 'transfer',
      },
    };
    expect(
      evaluator.matches(
        rule('event_topic_equals', { topic: 'transfer' }),
        watch,
        contractEvent,
      ),
    ).toBe(true);
    expect(
      evaluator.matches(
        rule('event_topic_equals', { topic: 'transfer' }),
        watch,
        contractEvent,
      ),
    ).toBe(true);
    expect(
      evaluator.matches(
        rule('event_topic_equals', { topic: 'approve' }),
        watch,
        contractEvent,
      ),
    ).toBe(false);
  });

  it('matches failed contract call', () => {
    const contractEvent: NormalizedMonitorEvent = {
      pagingToken: '1',
      source: 'contract',
      eventType: 'contract',
      ledger: 1,
      occurredAt: new Date().toISOString(),
      successful: false,
      transactionHash: 'tx456',
      payload: {
        topic: 'transfer',
      },
    };
    expect(
      evaluator.matches(rule('failed_contract_call'), watch, contractEvent),
    ).toBe(true);
    expect(
      evaluator.matches(rule('failed_contract_call'), watch, {
        ...contractEvent,
        successful: true,
      }),
    ).toBe(false);
  });

  it('ignores non-contract events for topic and failed rules', () => {
    const paymentEvent: NormalizedMonitorEvent = {
      ...payment,
      source: 'payment',
      eventType: 'payment',
      successful: false,
    };
    expect(
      evaluator.matches(rule('event_topic_equals', { topic: 'transfer' }), watch, paymentEvent),
    ).toBe(false);
    expect(
      evaluator.matches(rule('failed_contract_call'), watch, paymentEvent),
    ).toBe(false);
  });

  const snapshot = {
    publicKey: 'GACCOUNT',
    network: 'testnet',
    observedAt: new Date().toISOString(),
    balances: { XLM: '150.5000000', 'USDC:GISSUER': '20.0000000' },
    transactionCounts: { 60: 12 },
  } satisfies AccountStateSnapshot;

  it('compares balances against the threshold in both directions', () => {
    expect(
      evaluator.matchesState(
        rule('balance_above', { threshold: '150' }),
        snapshot,
      ),
    ).toBe(true);
    expect(
      evaluator.matchesState(
        rule('balance_above', { threshold: '151' }),
        snapshot,
      ),
    ).toBe(false);
    expect(
      evaluator.matchesState(
        rule('balance_below', { threshold: '151' }),
        snapshot,
      ),
    ).toBe(true);
    expect(
      evaluator.matchesState(
        rule('balance_below', { threshold: '150' }),
        snapshot,
      ),
    ).toBe(false);
  });

  it('defaults balance rules to XLM and honours an explicit asset', () => {
    expect(
      evaluator.matchesState(
        rule('balance_below', { threshold: '100' }),
        snapshot,
      ),
    ).toBe(false);
    expect(
      evaluator.matchesState(
        rule('balance_below', { threshold: '100', asset: 'USDC:GISSUER' }),
        snapshot,
      ),
    ).toBe(true);
  });

  it('ignores balance rules for assets the account does not hold', () => {
    expect(
      evaluator.matchesState(
        rule('balance_below', { threshold: '100', asset: 'EURC:GISSUER' }),
        snapshot,
      ),
    ).toBe(false);
  });

  it('fires transaction-count rules once the window total is reached', () => {
    expect(
      evaluator.matchesState(
        rule('transaction_count', { threshold: '12' }),
        snapshot,
      ),
    ).toBe(true);
    expect(
      evaluator.matchesState(
        rule('transaction_count', { threshold: '13' }),
        snapshot,
      ),
    ).toBe(false);
    expect(
      evaluator.matchesState(
        rule('transaction_count', { threshold: '1', windowMinutes: 15 }),
        snapshot,
      ),
    ).toBe(false);
  });
});

function rule(
  type: AlertRuleDefinition['type'],
  values: Partial<AlertRuleDefinition> = {},
): AlertRuleDefinition {
  return { id: type, type, channels: ['in_app'], ...values };
}
