const ALLOWED_SCHEMES = ['https:'];
const BLOCKED_DOMAINS = ['localhost', '127.0.0.1', '::1'];
const DANGEROUS_PORTS = ['22', '23', '25', '445', '3389', '5900'];

export class URLValidator {
  public validate(url: string): void {
    try {
      const parsed = new URL(url);

      // Check scheme
      if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
        throw new Error(`Blocked URL scheme: ${parsed.protocol}`);
      }

      // Check domain
      if (BLOCKED_DOMAINS.includes(parsed.hostname.toLowerCase())) {
        throw new Error(`Blocked domain: ${parsed.hostname}`);
      }

      // Check port
      if (parsed.port && DANGEROUS_PORTS.includes(parsed.port)) {
        throw new Error(`Blocked port: ${parsed.port}`);
      }

      // Check for IP addresses in hostname (basic SSRF protection)
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname)) {
        throw new Error('IP addresses in hostname are not allowed');
      }

      // Validate origin change (if we have a previous origin)
      // This would be used in context where we track previous origins
    } catch (error) {
      throw new Error(`Invalid URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public validateOriginChange(currentUrl: string, newUrl: string): void {
    const current = new URL(currentUrl);
    const next = new URL(newUrl);

    if (current.origin !== next.origin) {
      console.warn(`Origin change detected: ${current.origin} -> ${next.origin}`);
    }
  }
}
