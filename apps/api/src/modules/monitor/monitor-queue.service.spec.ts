import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { AlertEvent } from './entities/alert-event.entity';
import { MonitorLeaderService } from './monitor-leader.service';
import { MonitorQueueService } from './monitor-queue.service';
import { MonitorRuntimeConfig } from './monitor-runtime.config';
import { NotificationJobData } from './monitor.types';

describe('MonitorQueueService', () => {
  function createService(
    repository: Repository<AlertEvent>,
    isLeader = true,
  ) {
    const config = { get: jest.fn() } as unknown as ConfigService;
    const runtime = new MonitorRuntimeConfig(config);
    const leader = {
      isLeader: () => isLeader,
    } as unknown as MonitorLeaderService;
    const service = new MonitorQueueService(runtime, leader, config, repository);
    const add = jest.fn().mockResolvedValue(undefined);
    (
      service as unknown as {
        queue: Pick<Queue<NotificationJobData>, 'add'>;
      }
    ).queue = { add };
    return { service, add };
  }

  it('re-enqueues pending alerts from PostgreSQL when leader', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([{ id: 'one' }, { id: 'two' }]),
    } as unknown as Repository<AlertEvent>;
    const { service, add } = createService(repository, true);

    await service.dispatchPending();

    expect(add).toHaveBeenNthCalledWith(
      1,
      'deliver-alert',
      { alertEventId: 'one' },
      { jobId: 'one' },
    );
    expect(add).toHaveBeenNthCalledWith(
      2,
      'deliver-alert',
      { alertEventId: 'two' },
      { jobId: 'two' },
    );
  });

  it('does not dispatch pending alerts when not leader', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([{ id: 'one' }]),
    } as unknown as Repository<AlertEvent>;
    const { service, add } = createService(repository, false);

    await service.dispatchPending();

    expect(repository.find).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});

