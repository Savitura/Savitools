import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";
import { Watch } from "./entities/watch.entity";
import { EventIngestionService } from "./event-ingestion.service";
import { MonitorGateway } from "./monitor.gateway";
import { StreamManager } from "./stream-manager.service";
import { WatchRegistry } from "./watch-registry.service";

interface StreamHandlers {
  onmessage?: (record: Record<string, unknown>) => void;
  onerror?: (error: Error) => void;
}

class FakeBuilder {
  cursorValue?: string;
  handlers?: StreamHandlers;
  readonly close = jest.fn();

  constructor(private readonly failStream = false) {}

  forAccount(): this {
    return this;
  }

  includeFailed(): this {
    return this;
  }

  cursor(value: string): this {
    this.cursorValue = value;
    return this;
  }

  order(): this {
    return this;
  }

  limit(): this {
    return this;
  }

  async call(): Promise<{ records: never[] }> {
    return { records: [] };
  }

  stream(handlers: StreamHandlers): () => void {
    if (this.failStream) {
      throw new Error("stream unavailable");
    }
    this.handlers = handlers;
    return this.close;
  }
}

class FakeHorizonServer {
  readonly transactionBuilders: FakeBuilder[] = [];
  readonly paymentBuilders: FakeBuilder[] = [];
  failTransactionStreams = 0;

  transactions(): FakeBuilder {
    const builder = new FakeBuilder(this.failTransactionStreams-- > 0);
    this.transactionBuilders.push(builder);
    return builder;
  }

  payments(): FakeBuilder {
    const builder = new FakeBuilder();
    this.paymentBuilders.push(builder);
    return builder;
  }

  streamBuilders(): FakeBuilder[] {
    return [...this.transactionBuilders, ...this.paymentBuilders].filter(
      (builder) => builder.handlers,
    );
  }
}

describe("StreamManager", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("opens one shared stream group and closes it when the last watch is removed", async () => {
    const watch = makeWatch("one", "GACCOUNT", "10", "20");
    const setup = createManager([watch]);

    await setup.manager.start(setup.registry.keyFor(watch));
    await setup.manager.start(setup.registry.keyFor(watch));

    expect(setup.horizon.streamBuilders()).toHaveLength(2);
    await setup.manager.stop(setup.registry.keyFor(watch));
    expect(
      setup.horizon
        .streamBuilders()
        .every((builder) => builder.close.mock.calls.length === 1),
    ).toBe(true);
  });

  it("reconnects after one second using exponential backoff starting at 1s", async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
    const watch = makeWatch("one", "GACCOUNT", "100", "200");
    const setup = createManager([watch]);
    const key = setup.registry.keyFor(watch);
    await setup.manager.start(key);

    const firstPaymentStream = setup.horizon.paymentBuilders.find(
      (builder) => builder.handlers,
    );
    expect(firstPaymentStream?.cursorValue).toBe("200");
    firstPaymentStream?.handlers?.onerror?.(new Error("connection closed"));
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(999);
    expect(
      setup.horizon.paymentBuilders.filter((builder) => builder.handlers),
    ).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(
      setup.horizon.paymentBuilders.filter((builder) => builder.handlers),
    ).toHaveLength(2);
    expect(setup.horizon.paymentBuilders.at(-1)?.cursorValue).toBe("200");

    await setup.manager.onApplicationShutdown();
  });

  it("exponentially backs up reconnection attempts and caps at 60 seconds", () => {
    const manager = createManager([]).manager;

    // Test with 0 jitter
    expect(manager.calculateReconnectDelay(0, 0)).toBe(1_000);
    expect(manager.calculateReconnectDelay(1, 0)).toBe(2_000);
    expect(manager.calculateReconnectDelay(2, 0)).toBe(4_000);
    expect(manager.calculateReconnectDelay(3, 0)).toBe(8_000);
    expect(manager.calculateReconnectDelay(4, 0)).toBe(16_000);
    expect(manager.calculateReconnectDelay(5, 0)).toBe(32_000);
    expect(manager.calculateReconnectDelay(6, 0)).toBe(60_000);
    expect(manager.calculateReconnectDelay(10, 0)).toBe(60_000);

    // Test with jitter
    const delayWithJitter0 = manager.calculateReconnectDelay(0, 0.5);
    expect(delayWithJitter0).toBe(1_100);

    const delayWithJitter1 = manager.calculateReconnectDelay(1, 1.0);
    expect(delayWithJitter1).toBe(2_400);

    // Ensure cap of 60 seconds is always respected even with jitter
    expect(manager.calculateReconnectDelay(6, 1.0)).toBe(60_000);
    expect(manager.calculateReconnectDelay(100, 1.0)).toBe(60_000);
  });

  it("backs off exponentially on consecutive failed reconnection attempts", async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
    const watch = makeWatch("one", "GACCOUNT", "100", "200");
    const setup = createManager([watch]);
    const key = setup.registry.keyFor(watch);
    await setup.manager.start(key);

    const firstPaymentStream = setup.horizon.paymentBuilders.find(
      (builder) => builder.handlers,
    );
    // Initial error -> 1s delay (attempt 0)
    firstPaymentStream?.handlers?.onerror?.(new Error("connection closed 1"));
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(1_000);
    const secondPaymentStream = setup.horizon.paymentBuilders.at(-1);
    expect(
      setup.horizon.paymentBuilders.filter((b) => b.handlers),
    ).toHaveLength(2);

    // Second error -> 2s delay (attempt 1)
    secondPaymentStream?.handlers?.onerror?.(new Error("connection closed 2"));
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(1_999);
    expect(
      setup.horizon.paymentBuilders.filter((b) => b.handlers),
    ).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(
      setup.horizon.paymentBuilders.filter((b) => b.handlers),
    ).toHaveLength(3);

    // Third error -> 4s delay (attempt 2)
    const thirdPaymentStream = setup.horizon.paymentBuilders.at(-1);
    thirdPaymentStream?.handlers?.onerror?.(new Error("connection closed 3"));
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(3_999);
    expect(
      setup.horizon.paymentBuilders.filter((b) => b.handlers),
    ).toHaveLength(3);
    await jest.advanceTimersByTimeAsync(1);
    expect(
      setup.horizon.paymentBuilders.filter((b) => b.handlers),
    ).toHaveLength(4);

    // Stream receives a message -> resets backoff attempts to 0
    const fourthPaymentStream = setup.horizon.paymentBuilders.at(-1);
    fourthPaymentStream?.handlers?.onmessage?.({
      paging_token: "201",
      asset_type: "native",
      amount: "10",
      created_at: new Date().toISOString(),
    });
    await Promise.resolve();

    // Next error should start at 1s again (attempt 0)
    fourthPaymentStream?.handlers?.onerror?.(new Error("connection closed 4"));
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(999);
    expect(
      setup.horizon.paymentBuilders.filter((b) => b.handlers),
    ).toHaveLength(4);
    await jest.advanceTimersByTimeAsync(1);
    expect(
      setup.horizon.paymentBuilders.filter((b) => b.handlers),
    ).toHaveLength(5);

    await setup.manager.onApplicationShutdown();
  });

  it("keeps a watch registered and schedules recovery when initial streaming fails", async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
    const watch = makeWatch("one", "GACCOUNT", "100", "200");
    const setup = createManager([watch]);
    setup.horizon.failTransactionStreams = 1;

    await expect(
      setup.manager.start(setup.registry.keyFor(watch)),
    ).resolves.toBeUndefined();
    expect(watch.status).toBe("error");

    await jest.advanceTimersByTimeAsync(1_000);
    expect(
      setup.horizon.transactionBuilders.filter((builder) => builder.handlers),
    ).toHaveLength(1);
    expect(watch.status).toBe("streaming");

    await setup.manager.onApplicationShutdown();
  });

  it("resumes the same cursors after one simulated idle hour and restart", async () => {
    jest.useFakeTimers();
    const watch = makeWatch("one", "GACCOUNT", "501", "601");
    const first = createManager([watch]);
    await first.manager.start(first.registry.keyFor(watch));
    await jest.advanceTimersByTimeAsync(60 * 60 * 1_000);
    await first.manager.onApplicationShutdown();

    const restarted = createManager([watch]);
    await restarted.manager.start(restarted.registry.keyFor(watch));
    expect(
      restarted.horizon.transactionBuilders.find((builder) => builder.handlers)
        ?.cursorValue,
    ).toBe("501");
    expect(
      restarted.horizon.paymentBuilders.find((builder) => builder.handlers)
        ?.cursorValue,
    ).toBe("601");
    expect(restarted.horizon.streamBuilders()).toHaveLength(2);

    await restarted.manager.onApplicationShutdown();
  });

  it("holds 50 SSE sockets for a simulated hour and polls excess watches", async () => {
    jest.useFakeTimers();
    const watches = Array.from({ length: 26 }, (_, index) =>
      makeWatch(String(index), `GACCOUNT${index}`, "1", "1"),
    );
    const setup = createManager(watches);

    await setup.manager.startAll();

    const groups = (
      setup.manager as unknown as {
        groups: Map<string, { mode: "sse" | "poll" }>;
      }
    ).groups;
    expect(
      Array.from(groups.values()).filter((group) => group.mode === "sse"),
    ).toHaveLength(25);
    expect(
      Array.from(groups.values()).filter((group) => group.mode === "poll"),
    ).toHaveLength(1);
    expect(setup.horizon.streamBuilders()).toHaveLength(50);
    expect(setup.horizon.transactionBuilders).toHaveLength(26);
    expect(setup.horizon.paymentBuilders).toHaveLength(26);

    await jest.advanceTimersByTimeAsync(60 * 60 * 1_000);
    expect(
      Array.from(groups.values()).filter((group) => group.mode === "sse"),
    ).toHaveLength(25);
    expect(
      Array.from(groups.values()).filter((group) => group.mode === "poll"),
    ).toHaveLength(1);
    expect(setup.horizon.streamBuilders()).toHaveLength(50);
    expect(setup.horizon.transactionBuilders).toHaveLength(146);
    expect(setup.horizon.paymentBuilders).toHaveLength(146);

    await setup.manager.onApplicationShutdown();
  });

  it("polls contract events and persists the page cursor", async () => {
    const watch = {
      ...makeWatch("contract", "CCONTRACT", "", ""),
      type: "contract",
      eventTypes: ["contract"],
      transactionCursor: null,
      paymentCursor: null,
    } as Watch;
    const setup = createManager([watch]);
    const rpc = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 321 }),
      getEvents: jest.fn().mockResolvedValue({
        events: [],
        cursor: "contract-cursor",
        latestLedger: 321,
      }),
    };
    Object.defineProperty(setup.manager, "rpcServer", {
      value: () => rpc,
    });
    const key = setup.registry.keyFor(watch);

    await setup.manager.start(key);

    expect(rpc.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        startLedger: 321,
        filters: [{ type: "contract", contractIds: ["CCONTRACT"] }],
      }),
    );
    expect(setup.ingestion.updateCursor).toHaveBeenCalledWith(
      key,
      "contract",
      "contract-cursor",
      321,
    );
    await setup.manager.onApplicationShutdown();
  });
});

function createManager(watches: Watch[]) {
  const byKey = new Map<string, Watch[]>();
  const registry = {
    get: (key: string) => byKey.get(key) ?? [],
    keys: () => Array.from(byKey.keys()),
    keyFor: (watch: Watch) =>
      `${watch.network}:${watch.type}:${watch.publicKey}`,
  } as WatchRegistry;
  for (const watch of watches) {
    const key = registry.keyFor(watch);
    byKey.set(key, [...(byKey.get(key) ?? []), watch]);
  }

  const watchRepository = {
    update: jest.fn().mockResolvedValue(undefined),
  } as unknown as Repository<Watch>;
  const ingestion = {
    ingest: jest.fn().mockResolvedValue(undefined),
    updateCursor: jest.fn().mockResolvedValue(undefined),
  } as unknown as EventIngestionService;
  const gateway = {
    emitToUser: jest.fn(),
  } as unknown as MonitorGateway;
  const config = {
    get: jest.fn((_key: string, fallback: string) => fallback),
  } as unknown as ConfigService;
  const horizon = new FakeHorizonServer();
  const manager = new StreamManager(
    config,
    watchRepository,
    registry,
    ingestion,
    gateway,
  );
  Object.defineProperty(manager, "horizonServer", {
    value: () => horizon,
  });

  return { manager, registry, horizon, ingestion };
}

function makeWatch(
  id: string,
  publicKey: string,
  transactionCursor: string,
  paymentCursor: string,
): Watch {
  return {
    id,
    userId: `user-${id}`,
    network: "testnet",
    type: "account",
    publicKey,
    eventTypes: ["transaction", "payment"],
    alertRules: [],
    transactionCursor,
    paymentCursor,
    contractCursor: null,
    cursorLedger: null,
    streamMode: "sse",
    status: "streaming",
    lastError: null,
  } as unknown as Watch;
}
