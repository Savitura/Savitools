import { Injectable } from '@nestjs/common';
import {
  AccountStateSnapshot,
  AlertRuleDefinition,
  NormalizedMonitorEvent,
  isStateAlertRule,
} from './monitor.types';
import { Watch } from './entities/watch.entity';

export const DEFAULT_BALANCE_ASSET = 'XLM';
export const DEFAULT_TRANSACTION_WINDOW_MINUTES = 60;

@Injectable()
export class AlertEvaluator {
  matches(
    rule: AlertRuleDefinition,
    watch: Watch,
    event: NormalizedMonitorEvent,
  ): boolean {
    switch (rule.type) {
      case 'any_activity':
        return true;
      case 'tx_failed':
        return event.source === 'transaction' && event.successful === false;
      case 'event_topic_equals':
        return (
          event.source === 'contract' &&
          event.payload.topic &&
          event.payload.topic === rule.topic
        );
      case 'failed_contract_call':
        return event.source === 'contract' && event.successful === false;
      case 'asset_received':
        return (
          event.source === 'payment' &&
          event.to === watch.publicKey &&
          this.sameAsset(event.receivedAsset ?? event.asset, rule.asset)
        );
      case 'amount_received_gte':
        return (
          event.source === 'payment' &&
          event.to === watch.publicKey &&
          this.meetsThreshold(
            event.receivedAmount ?? event.amount,
            rule.threshold,
          )
        );
      case 'amount_sent_gte':
        return (
          event.source === 'payment' &&
          event.from === watch.publicKey &&
          this.meetsThreshold(event.sentAmount ?? event.amount, rule.threshold)
        );
      default:
        // Balance and transaction-count rules are evaluated against account
        // state on a schedule, not against individual ledger events.
        return false;
    }
  }

  /**
   * Evaluates a state-based rule against the latest account snapshot. State
   * rules stay true for as long as the condition holds, so callers fire on the
   * transition from false to true rather than on every evaluation.
   */
  matchesState(
    rule: AlertRuleDefinition,
    snapshot: AccountStateSnapshot,
  ): boolean {
    switch (rule.type) {
      case 'balance_above':
        return this.compareBalance(rule, snapshot) === 'above';
      case 'balance_below':
        return this.compareBalance(rule, snapshot) === 'below';
      case 'transaction_count': {
        const observed = snapshot.transactionCounts[this.windowMinutes(rule)];
        if (observed === undefined || !rule.threshold) {
          return false;
        }
        return this.meetsThreshold(String(observed), rule.threshold);
      }
      default:
        return false;
    }
  }

  balanceAsset(rule: AlertRuleDefinition): string {
    return rule.asset?.trim() || DEFAULT_BALANCE_ASSET;
  }

  windowMinutes(rule: AlertRuleDefinition): number {
    return rule.windowMinutes ?? DEFAULT_TRANSACTION_WINDOW_MINUTES;
  }

  /** The observed value a rule compared against, for the alert payload. */
  observedValue(
    rule: AlertRuleDefinition,
    snapshot: AccountStateSnapshot,
  ): string | undefined {
    if (!isStateAlertRule(rule.type)) {
      return undefined;
    }
    if (rule.type === 'transaction_count') {
      const observed = snapshot.transactionCounts[this.windowMinutes(rule)];
      return observed === undefined ? undefined : String(observed);
    }
    return snapshot.balances[this.balanceAsset(rule)];
  }

  private compareBalance(
    rule: AlertRuleDefinition,
    snapshot: AccountStateSnapshot,
  ): 'above' | 'below' | null {
    const balance = snapshot.balances[this.balanceAsset(rule)];
    if (!balance || !rule.threshold) {
      return null;
    }

    const comparison = this.compareDecimals(balance, rule.threshold);
    if (comparison === null || comparison === 0) {
      return null;
    }
    return comparison > 0 ? 'above' : 'below';
  }

  private sameAsset(actual?: string, expected?: string): boolean {
    return Boolean(
      actual && expected && actual.toLowerCase() === expected.toLowerCase(),
    );
  }

  private meetsThreshold(actual?: string, threshold?: string): boolean {
    if (!actual || !threshold) {
      return false;
    }
    const comparison = this.compareDecimals(actual, threshold);
    return comparison !== null && comparison >= 0;
  }

  private compareDecimals(left: string, right: string): number | null {
    const leftParts = this.decimalParts(left);
    const rightParts = this.decimalParts(right);
    if (!leftParts || !rightParts) {
      return null;
    }

    const scale = Math.max(
      leftParts.fraction.length,
      rightParts.fraction.length,
    );
    const leftValue = BigInt(
      `${leftParts.whole}${leftParts.fraction.padEnd(scale, '0')}`,
    );
    const rightValue = BigInt(
      `${rightParts.whole}${rightParts.fraction.padEnd(scale, '0')}`,
    );
    if (leftValue === rightValue) {
      return 0;
    }
    return leftValue > rightValue ? 1 : -1;
  }

  private decimalParts(
    value: string,
  ): { whole: string; fraction: string } | null {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match) {
      return null;
    }
    return { whole: match[1], fraction: match[2] ?? '' };
  }
}
