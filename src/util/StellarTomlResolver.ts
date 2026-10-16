import { URLValidator } from './URLValidator';

export class StellarTomlResolver {
  private urlValidator: URLValidator;
  private cache: Map<string, Record<string, unknown>> = new Map();

  constructor() {
    this.urlValidator = new URLValidator();
  }

  public async resolve(domain: string): Promise<Record<string, unknown>> {
    const cacheKey = domain.toLowerCase();
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const url = `https://${domain}/.well-known/stellar.toml`;
    this.urlValidator.validate(url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/toml'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch stellar.toml: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    const toml = this.parseToml(text);
    this.cache.set(cacheKey, toml);

    return toml;
  }

  private parseToml(text: string): Record<string, unknown> {
    const lines = text.split('\n');
    const result: Record<string, unknown> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [key, ...valueParts] = trimmed.split('=');
      if (!key) continue;

      const cleanKey = key.trim();
      const value = valueParts.join('=').trim();

      // Remove quotes if present
      const cleanValue = value.startsWith('"') && value.endsWith('"')
        ? value.slice(1, -1)
        : value;

      result[cleanKey] = cleanValue;
    }

    return result;
  }
}
