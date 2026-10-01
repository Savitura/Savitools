import { INestApplication, Injectable, OnApplicationShutdown, OnModuleDestroy } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { enableGracefulShutdown } from './graceful-shutdown';

/** Stands in for the services that release resources on shutdown. */
@Injectable()
class RecordingTeardown implements OnModuleDestroy, OnApplicationShutdown {
  destroyed = 0;
  shutdowns: (string | undefined)[] = [];

  onModuleDestroy(): void {
    this.destroyed += 1;
  }

  onApplicationShutdown(signal?: string): void {
    this.shutdowns.push(signal);
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !predicate()) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('enableGracefulShutdown', () => {
  let kill: jest.SpyInstance;

  beforeEach(() => {
    // After the teardown hooks run, Nest re-raises the signal with
    // `process.kill(process.pid, signal)`. Intercept it so the suite survives.
    kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
  });

  afterEach(() => {
    kill.mockRestore();
  });

  it('delegates to the application shutdown-hook registration', () => {
    const app = { enableShutdownHooks: jest.fn() };

    enableGracefulShutdown(app as unknown as INestApplication);

    expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1);
  });

  it('turns SIGTERM into a real teardown: hooks run and the adapter closes', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RecordingTeardown],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    const probe = app.get(RecordingTeardown);
    const close = jest.spyOn(app.getHttpAdapter(), 'close');

    enableGracefulShutdown(app);
    // Real signal delivery passes the signal name to the listener; `emit` needs it explicitly.
    process.emit('SIGTERM', 'SIGTERM');

    await waitFor(() => probe.shutdowns.length > 0);
    await waitFor(() => close.mock.calls.length > 0);

    expect(probe.destroyed).toBe(1);
    expect(probe.shutdowns).toEqual(['SIGTERM']);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('stays unreachable without the call, which is the bug this guards against', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RecordingTeardown],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    const probe = app.get(RecordingTeardown);

    process.emit('SIGTERM', 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(probe.destroyed).toBe(0);
    expect(probe.shutdowns).toEqual([]);
  });

  it('is called by main.ts before the server starts listening', () => {
    const source = readFileSync(join(__dirname, '..', 'main.ts'), 'utf8');
    const call = source.indexOf('enableGracefulShutdown(app)');
    const listen = source.indexOf('await app.listen(');

    expect(call).toBeGreaterThan(-1);
    expect(listen).toBeGreaterThan(-1);
    expect(call).toBeLessThan(listen);
  });
});
