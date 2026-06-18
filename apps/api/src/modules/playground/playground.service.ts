import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { SaveApiKeyDto } from './dto/save-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';
import { ApiKey, ApiKeyProvider } from './entities/api-key.entity';
import { ProxyRequestDto } from './dto/proxy-request.dto';

interface CachedSpec {
  spec: Record<string, unknown>;
  fetchedAt: number;
}

export interface ProxyResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  latencyMs: number;
}

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const SPEC_SALT = 'savitools-playground-spec-cache';

@Injectable()
export class PlaygroundService {
  private readonly logger = new Logger(PlaygroundService.name);
  private readonly specCache = new Map<string, CachedSpec>();
  private readonly specTtlMs: number;

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeysRepository: Repository<ApiKey>,
    private readonly configService: ConfigService,
  ) {
    this.specTtlMs = this.configService.get<number>('PLAYGROUND_SPEC_TTL_MS', 3_600_000);
  }

  async getSpec(provider: ApiKeyProvider): Promise<Record<string, unknown>> {
    const cached = this.specCache.get(provider);
    if (cached && Date.now() - cached.fetchedAt < this.specTtlMs) {
      return cached.spec;
    }

    const baseUrl = this.getProviderBaseUrl(provider);
    if (!baseUrl) {
      throw new BadRequestException(`${provider} API URL is not configured`);
    }

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/openapi.json`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        if (cached) {
          this.logger.warn(`Failed to refresh ${provider} spec, serving stale cache`);
          return cached.spec;
        }
        throw new BadGatewayException(`Failed to fetch ${provider} OpenAPI spec: ${response.status}`);
      }

      const spec = (await response.json()) as Record<string, unknown>;
      this.specCache.set(provider, { spec, fetchedAt: Date.now() });
      return spec;
    } catch (error) {
      if (cached) {
        this.logger.warn(`Error refreshing ${provider} spec, serving stale cache: ${error}`);
        return cached.spec;
      }
      throw new BadGatewayException(`Failed to fetch ${provider} OpenAPI spec`);
    }
  }

  async proxyRequest(userId: string, dto: ProxyRequestDto): Promise<ProxyResult> {
    const baseUrl = this.getProviderBaseUrl(dto.provider);
    if (!baseUrl) {
      throw new BadRequestException(`${dto.provider} API URL is not configured`);
    }

    const apiKeyRecord = await this.findUserKey(userId, dto.provider);
    if (!apiKeyRecord) {
      throw new NotFoundException(
        `No ${dto.provider} API key stored. Save one in Playground → Key Manager first.`,
      );
    }

    const decryptedKey = this.decrypt(
      apiKeyRecord.encryptedKey,
      apiKeyRecord.iv,
      apiKeyRecord.authTag,
    );

    const url = new URL(dto.path, baseUrl);
    if (dto.query) {
      for (const [key, value] of Object.entries(dto.query)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...dto.headers,
    };
    delete headers.authorization;

    if (dto.body && dto.method !== 'GET' && dto.method !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
    }

    const start = Date.now();

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: dto.method.toUpperCase(),
        headers: {
          ...headers,
          Authorization: `Bearer ${decryptedKey}`,
        },
        body: dto.body && dto.method !== 'GET' && dto.method !== 'HEAD'
          ? JSON.stringify(dto.body)
          : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new BadGatewayException(`Request to ${dto.provider} failed: ${error}`);
    }

    const latencyMs = Date.now() - start;

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let body: unknown;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    this.logger.log(
      `[proxy] ${dto.provider} ${dto.method} ${dto.path} → ${response.status} (${latencyMs}ms)`,
    );

    return {
      status: response.status,
      headers: responseHeaders,
      body,
      latencyMs,
    };
  }

  async saveKey(userId: string, dto: SaveApiKeyDto): Promise<{ id: string; label: string; provider: ApiKeyProvider }> {
    const existing = await this.apiKeysRepository.findOne({
      where: { userId, provider: dto.provider, label: dto.label },
    });

    if (existing) {
      throw new BadRequestException(
        `A key with label "${dto.label}" already exists for ${dto.provider}`,
      );
    }

    const { encrypted, iv, authTag } = this.encrypt(dto.apiKey);

    const key = this.apiKeysRepository.create({
      userId,
      provider: dto.provider,
      label: dto.label,
      encryptedKey: encrypted,
      iv,
      authTag,
    });

    const saved = await this.apiKeysRepository.save(key);
    return { id: saved.id, label: saved.label, provider: saved.provider };
  }

  async listKeys(userId: string): Promise<Array<{ id: string; label: string; provider: ApiKeyProvider; maskedKey: string; createdAt: Date }>> {
    const keys = await this.apiKeysRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return keys.map((key) => {
      const decrypted = this.decrypt(key.encryptedKey, key.iv, key.authTag);
      const masked = decrypted.slice(0, 8) + '...' + decrypted.slice(-4);
      return {
        id: key.id,
        label: key.label,
        provider: key.provider,
        maskedKey: masked,
        createdAt: key.createdAt,
      };
    });
  }

  async deleteKey(id: string, userId: string): Promise<void> {
    const key = await this.apiKeysRepository.findOne({ where: { id } });
    if (!key) {
      throw new NotFoundException('API key not found');
    }
    if (key.userId !== userId) {
      throw new ForbiddenException('Cannot delete another user\'s API key');
    }
    await this.apiKeysRepository.remove(key);
  }

  async updateKey(
    id: string,
    userId: string,
    dto: UpdateApiKeyDto,
  ): Promise<{ id: string; label: string; provider: ApiKeyProvider }> {
    const key = await this.apiKeysRepository.findOne({ where: { id } });
    if (!key) {
      throw new NotFoundException('API key not found');
    }
    if (key.userId !== userId) {
      throw new ForbiddenException('Cannot update another user\'s API key');
    }

    if (dto.label !== undefined) {
      key.label = dto.label;
    }

    if (dto.apiKey !== undefined) {
      const { encrypted, iv, authTag } = this.encrypt(dto.apiKey);
      key.encryptedKey = encrypted;
      key.iv = iv;
      key.authTag = authTag;
    }

    const saved = await this.apiKeysRepository.save(key);
    return { id: saved.id, label: saved.label, provider: saved.provider };
  }

  private async findUserKey(userId: string, provider: ApiKeyProvider): Promise<ApiKey | null> {
    return this.apiKeysRepository.findOne({
      where: { userId, provider },
      order: { createdAt: 'DESC' },
    });
  }

  private getProviderBaseUrl(provider: ApiKeyProvider): string | null {
    switch (provider) {
      case ApiKeyProvider.FLUXA:
        return this.configService.get<string>('FLUXA_API_URL') ?? null;
      case ApiKeyProvider.CROWDPAY:
        return this.configService.get<string>('CROWDPAY_API_URL') ?? null;
    }
  }

  private deriveKey(): Buffer {
    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    return pbkdf2Sync(secret, SPEC_SALT, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
  }

  private encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string } {
    const key = this.deriveKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return { encrypted, iv: iv.toString('hex'), authTag };
  }

  private decrypt(encrypted: string, ivHex: string, authTagHex: string): string {
    const key = this.deriveKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
