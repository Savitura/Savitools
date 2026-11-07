import { readFileSync } from "fs";
import { join } from "path";
import { ConfigService } from "@nestjs/config";
import { RedisProvider } from "./redis.provider";

const makeProvider = (env: Record<string, string | undefined>) =>
    new RedisProvider({ get: (key: string) => env[key] } as unknown as ConfigService);

describe("Redis-degraded mode", () => {
    it("starts without Redis when REDIS_URL is unset and skips operations", async () => {
        const provider = makeProvider({});
        await provider.connect();
        expect(provider.isReady()).toBe(false);
        const op = jest.fn();
        await expect(provider.safeExecute(op)).resolves.toBeNull();
        expect(op).not.toHaveBeenCalled();
    });

    it("throws from getClient when not connected", () => {
        expect(() => makeProvider({}).getClient()).toThrow(/not connected/);
    });
});

describe("Redis troubleshooting docs", () => {
    const doc = readFileSync(join(__dirname, "../../../../docs/troubleshooting-redis.md"), "utf8");

    it("documents the logged symptoms and recovery steps", () => {
        expect(doc).toContain("Redis not available, skipping operation");
        expect(doc).toContain("docker compose up -d");
        expect(doc).toContain("redis-cli ping");
        expect(doc).toContain("REDIS_URL");
    });
});
