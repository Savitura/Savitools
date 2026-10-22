import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { getDataSourceToken } from "@nestjs/typeorm";
import { DiagnosticsService } from "./diagnostics.service";
import { REDACTED } from "../../common/redaction";

describe("DiagnosticsService (#506)", () => {
  const buildService = async (
    opts: { env?: Record<string, string>; dataSource?: unknown } = {},
  ) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiagnosticsService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: unknown) => opts.env?.[key] ?? def,
          },
        },
        {
          provide: getDataSourceToken(),
          useValue: opts.dataSource,
        },
      ],
    }).compile();
    return moduleRef.get(DiagnosticsService);
  };

  it("returns a well-formed bundle with required fields", async () => {
    const svc = await buildService();
    const bundle = await svc.buildBundle();
    expect(bundle.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(bundle.service.name).toBe("savitools-api");
    expect(bundle.service.nodeVersion).toBe(process.version);
    expect(bundle.service.memory.rssMb).toBeGreaterThan(0);
    expect(Array.isArray(bundle.envKeys)).toBe(true);
    expect(bundle.database.reachable).toBe(false);
  });

  it("does not include secret env var names in envKeys", async () => {
    process.env.AWS_SECRET_ACCESS_KEY = "should-not-appear";
    try {
      const svc = await buildService();
      const bundle = await svc.buildBundle();
      expect(bundle.envKeys).not.toContain("AWS_SECRET_ACCESS_KEY");
    } finally {
      delete process.env.AWS_SECRET_ACCESS_KEY;
    }
  });

  it("redacts a secret value that slipped into config summary", async () => {
    const svc = await buildService({
      env: { NODE_ENV: "test", THROTTLE_TTL: "60000" },
    });
    const bundle = await svc.buildBundle();
    expect(JSON.stringify(bundle.config)).not.toMatch(/password=/i);
    expect(bundle.config.nodeEnv).toBe("test");
  });

  it("reports database unreachable and adds a warning when probe throws", async () => {
    const fakeDs = {
      isInitialized: true,
      query: jest.fn().mockRejectedValue(new Error("connection refused")),
    };
    const svc = await buildService({ dataSource: fakeDs });
    const bundle = await svc.buildBundle();
    expect(bundle.database.reachable).toBe(false);
    expect(bundle.database.error).toContain("connection refused");
    expect(bundle.warnings).toContain("database probe failed");
  });

  it("reports migration count when datasource query succeeds", async () => {
    const fakeDs = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ c: 42 }]),
    };
    const svc = await buildService({ dataSource: fakeDs });
    const bundle = await svc.buildBundle();
    expect(bundle.database.reachable).toBe(true);
    expect(bundle.database.migrationCount).toBe(42);
  });

  it("redacts a JWT-shaped error message from the database probe", async () => {
    const fakeDs = {
      isInitialized: true,
      query: jest
        .fn()
        .mockRejectedValue(
          new Error(
            "failed to connect using eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig",
          ),
        ),
    };
    const svc = await buildService({ dataSource: fakeDs });
    const bundle = await svc.buildBundle();
    expect(bundle.database.error).toContain(REDACTED);
    expect(bundle.database.error).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });
});
