import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AlertEvaluator } from './alert-evaluator.service';
import { AlertEvent } from './entities/alert-event.entity';
import { Watch } from './entities/watch.entity';
import { horizonServer } from './horizon';
import { MonitorLeaderService } from './monitor-leader.service';
import { MonitorQueueService } from './monitor-queue.service';
import { MonitorRuntimeConfig } from './monitor-runtime.config';
import { StateEvaluationService } from './state-evaluation.service';
import { WatchRegistry } from './watch-registry.service';

jest.mock('./horizon', () => ({ horizonServer: jest.fn() }));

const horizonServerMock = horizonServer as jest.MockedFunction<
  typeof horizonServer
>;

describe('StateEvaluationService', () => {
  const key = 'testnet:account:GACCOUNT';

  function build(watch: Watch, isLeader = true) {
    const watchRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as Repository<Watch>;
    const alertEventRepository = {
      create: jest.fn((value: Partial<AlertEvent>) => value),
      save: jest.fn((value: Partial<AlertEvent>) =>
        Promise.resolve({ ...value, id: 'alert-one' }),
      ),
    } as unknown as Repository<AlertEvent>;
    const registry = {
      keys: jest.fn().mockReturnValue([key]),
      get: jest.fn().mockReturnValue([watch]),
    } as unknown as WatchRegistry;
    const queue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as MonitorQueueService;
    const configService = {
      get: (_key: string, fallback: unknown) => fallback,
    } as ConfigService;
    const runtime = new MonitorRuntimeConfig(configService);
    const leader = {
      isLeader: () => isLeader,
    } as unknown as MonitorLeaderService;
    const service = new StateEvaluationService(
      runtime,
      leader,
      configService,
      watchRepository,
      alertEventRepository,
      registry,
      new AlertEvaluator(),
      queue,
    );

    return { service, alertEventRepository, queue };
  }

  function accountWatch(overrides: Partial<Watch> = {}): Watch {
    return {
      id: 'watch-one',
      userId: 'user-one',
      publicKey: 'GACCOUNT',
      type: 'account',
      network: 'testnet',
      alertState: {},
      alertRules: [
        {
          id: 'rule-one',
          type: 'balance_below',
          threshold: '100',
          channels: ['in_app'],
        },
      ],
      ...overrides,
    } as Watch;
  }

  function stubHorizon(balance: string, transactions: string[] = []): void {
    const page = {
      records: transactions.map((created_at) => ({ created_at })),
      next: () => Promise.resolve({ records: [], next: () => page }),
    };
    horizonServerMock.mockReturnValue({
      accounts: () => ({
        accountId: () => ({
          call: () =>
            Promise.resolve({
              balances: [{ asset_type: 'native', balance }],
            }),
        }),
      }),
      transactions: () => ({
        forAccount: () => ({
          includeFailed: () => ({
            order: () => ({
              limit: () => ({ call: () => Promise.resolve(page) }),
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof horizonServer>);
  }

  beforeEach(() => {
    horizonServerMock.mockReset();
  });

  it('fires a balance alert once per crossing, not on every evaluation', async () => {
    const watch = accountWatch();
    const { service, queue } = build(watch);

    stubHorizon('40.0000000');
    await service.evaluateAll();
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(watch.alertState['rule-one']).toBe(true);

    await service.evaluateAll();
    expect(queue.enqueue).toHaveBeenCalledTimes(1);

    stubHorizon('500.0000000');
    await service.evaluateAll();
    expect(watch.alertState['rule-one']).toBe(false);

    stubHorizon('10.0000000');
    await service.evaluateAll();
    expect(queue.enqueue).toHaveBeenCalledTimes(2);
  });

  it('does not evaluate when this replica is not the leader', async () => {
    const watch = accountWatch();
    const { service, queue } = build(watch, false);

    stubHorizon('40.0000000');
    await service.evaluateAll();

    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(horizonServerMock).not.toHaveBeenCalled();
  });

  it('records the observed value and rule details on the alert payload', async () => {
    const watch = accountWatch();
    const { service, alertEventRepository } = build(watch);

    stubHorizon('40.0000000');
    await service.evaluateAll();

    expect(alertEventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        watchId: 'watch-one',
        watchEventId: null,
        ruleId: 'rule-one',
        payload: expect.objectContaining({
          kind: 'account_state',
          ruleType: 'balance_below',
          asset: 'XLM',
          threshold: '100',
          observed: '40.0000000',
        }),
      }),
    );
  });

  it('counts only the transactions inside the rule window', async () => {
    const watch = accountWatch({
      alertRules: [
        {
          id: 'rule-two',
          type: 'transaction_count',
          threshold: '2',
          windowMinutes: 10,
          channels: ['in_app'],
        },
      ],
    });
    const { service, queue } = build(watch);
    const minutesAgo = (minutes: number) =>
      new Date(Date.now() - minutes * 60_000).toISOString();

    stubHorizon('100.0000000', [minutesAgo(1), minutesAgo(30)]);
    await service.evaluateAll();
    expect(queue.enqueue).not.toHaveBeenCalled();

    stubHorizon('100.0000000', [minutesAgo(1), minutesAgo(2), minutesAgo(30)]);
    await service.evaluateAll();
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('skips watches without state rules', async () => {
    const watch = accountWatch({
      alertRules: [{ id: 'rule-three', type: 'any_activity', channels: [] }],
    });
    const { service, queue } = build(watch);

    await service.evaluateAll();

    expect(horizonServerMock).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
