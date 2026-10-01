import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FastifyReply, FastifyRequest } from "fastify";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";

const PAYLOAD = "# HELP savitools_http_requests_total ok\nsavitools_http_requests_total 1\n";
const CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string, defaultValue?: string) =>
      Object.prototype.hasOwnProperty.call(overrides, key)
        ? overrides[key]
        : defaultValue,
    ),
  } as unknown as ConfigService;
}

function makeReply() {
  const header = jest.fn();
  const send = jest.fn((payload: unknown) => payload);
  return { header, send } as unknown as FastifyReply & {
    header: jest.Mock;
    send: jest.Mock;
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  ip = "127.0.0.1",
): FastifyRequest {
  return { headers, ip } as unknown as FastifyRequest;
}

function makeController(overrides: Record<string, string> = {}) {
  const metricsService = {
    contentType: jest.fn(() => CONTENT_TYPE),
    metrics: jest.fn(async () => PAYLOAD),
  } as unknown as MetricsService;
  const controller = new MetricsController(makeConfig(overrides), metricsService);
  return { controller, metricsService };
}

describe("MetricsController", () => {
  it("serves the scrape when no key is configured and the caller is loopback", async () => {
    const { controller, metricsService } = makeController();
    const reply = makeReply();

    const body = await controller.scrape(makeRequest({}, "127.0.0.1"), reply);

    expect(body).toBe(PAYLOAD);
    expect(reply.header).toHaveBeenCalledWith("Content-Type", CONTENT_TYPE);
    expect(reply.send).toHaveBeenCalledWith(PAYLOAD);
    expect(metricsService.metrics).toHaveBeenCalled();
  });

  it("accepts the API key as a header or as a bearer token", async () => {
    const { controller } = makeController({ METRICS_API_KEY: "s3cret" });

    await expect(
      controller.scrape(
        makeRequest({ "x-metrics-api-key": "s3cret" }, "203.0.113.5"),
        makeReply(),
      ),
    ).resolves.toBe(PAYLOAD);

    await expect(
      controller.scrape(
        makeRequest({ authorization: "Bearer s3cret" }, "203.0.113.5"),
        makeReply(),
      ),
    ).resolves.toBe(PAYLOAD);
  });

  it("rejects a missing or wrong API key", async () => {
    const { controller } = makeController({ METRICS_API_KEY: "s3cret" });

    await expect(
      controller.scrape(makeRequest({}, "203.0.113.5"), makeReply()),
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      controller.scrape(
        makeRequest({ "x-metrics-api-key": "wrong" }, "203.0.113.5"),
        makeReply(),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("restricts to internal networks when METRICS_INTERNAL_ONLY is unset", async () => {
    const { controller } = makeController();

    await expect(
      controller.scrape(makeRequest({}, "203.0.113.5"), makeReply()),
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      controller.scrape(makeRequest({}, "192.168.1.10"), makeReply()),
    ).resolves.toBe(PAYLOAD);

    await expect(
      controller.scrape(makeRequest({}, "::1"), makeReply()),
    ).resolves.toBe(PAYLOAD);
  });

  it("allows any address when METRICS_INTERNAL_ONLY is explicitly false", async () => {
    const { controller } = makeController({ METRICS_INTERNAL_ONLY: "false" });

    await expect(
      controller.scrape(makeRequest({}, "203.0.113.5"), makeReply()),
    ).resolves.toBe(PAYLOAD);
  });

  it("does not treat other METRICS_INTERNAL_ONLY values as opt-out", async () => {
    const { controller } = makeController({ METRICS_INTERNAL_ONLY: "0" });

    await expect(
      controller.scrape(makeRequest({}, "203.0.113.5"), makeReply()),
    ).rejects.toThrow(UnauthorizedException);
  });
});
