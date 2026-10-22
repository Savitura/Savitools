import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit tracker that uses Fastify's resolved client address when the
 * adapter's `trustProxy` option is enabled (Savitura/Savitools#419).
 *
 * With `trustProxy` set, Fastify sets `req.ip` to the client address derived
 * from `X-Forwarded-For`. Prefer that over `req.ips[0]`: the ips array is
 * ordered [socket/proxy, …, client], so index 0 is the reverse proxy and
 * would collapse every client into one bucket.
 *
 * Without `trustProxy`, `req.ip` is the non-spoofable socket address.
 */
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    if (typeof req.ip === 'string' && req.ip.length > 0) {
      return req.ip;
    }
    const ips = req.ips;
    if (Array.isArray(ips) && ips.length > 0) {
      const client = ips[ips.length - 1];
      if (typeof client === 'string' && client.length > 0) {
        return client;
      }
    }
    return 'unknown';
  }
}
