import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransport,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { createHash } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { BoundedTtlMap } from '../../common/bounded-ttl-map';
import {
  DISCOVERABLE_CHALLENGE_OWNER,
  PASSKEY_CHALLENGE_TTL_SECONDS,
  PASSKEY_MAX_PER_USER,
  PASSKEY_REAUTH_SCOPE,
  PASSKEY_REAUTH_TTL_SECONDS,
} from './auth.constants';
import type { IssueSessionContext, SessionTokens } from './auth.types';
import { PasskeyCredential } from './entities/passkey.entity';
import { User } from './entities/user.entity';
import { SessionService } from './session.service';

/**
 * Ceiling for the two single-use passkey maps (#291): both are written from
 * unauthenticated routes, so the bound is a memory guarantee, not a tuning knob.
 */
const PASSKEY_CHALLENGE_MAX_ENTRIES = 10_000;

/** WebAuthn passkeys (Savitura/Savitools#218): reauth grant, registration, assertion login, management. */
@Injectable()
export class PasskeyAuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(PasskeyCredential)
    private readonly passkeysRepository: Repository<PasskeyCredential>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Single-use challenge store. Keys are `${userId}:${challenge}` so a challenge
   * can only ever be consumed by the account that requested it.
   *
   * Written by unauthenticated routes (`POST /auth/passkeys/login/options`), so
   * the entry bound is what keeps a caller from growing it without limit; the
   * TTL is what makes an abandoned challenge unusable (Savitura/Savitools#291).
   */
  private readonly passkeyChallenges = new BoundedTtlMap<
    string,
    { challenge: string; type: 'registration' | 'assertion'; rpId: string }
  >({
    maxEntries: PASSKEY_CHALLENGE_MAX_ENTRIES,
    ttlMs: PASSKEY_CHALLENGE_TTL_SECONDS * 1000,
  });

  /**
   * Allow-list per issued assertion challenge. Bounded and TTL'd like the
   * challenge itself, and consumed on read: it used to be written on every
   * unauthenticated login-options call and never deleted from
   * (Savitura/Savitools#291).
   */
  private readonly challengeKeyCache = new BoundedTtlMap<string, string>({
    maxEntries: PASSKEY_CHALLENGE_MAX_ENTRIES,
    ttlMs: PASSKEY_CHALLENGE_TTL_SECONDS * 1000,
  });

  private storePasskeyChallenge(
    userId: string,
    type: 'registration' | 'assertion',
    challenge: string,
    rpId: string,
    allowedCredentialIds?: string[],
  ): void {
    this.passkeyChallenges.set(`${userId}:${challenge}`, {
      challenge,
      type,
      rpId,
    });
    if (allowedCredentialIds) {
      this.challengeKeyCache.set(challenge, allowedCredentialIds.sort().join(','));
    }
  }

  /** Consume a challenge: single-use — replay of the same challenge fails. */
  private takePasskeyChallenge(
    userId: string,
    challenge: string,
    type: 'registration' | 'assertion',
    rpId: string,
  ): void {
    const key = `${userId}:${challenge}`;
    // `get` removes an expired entry, and the explicit delete makes the
    // challenge single-use: a replay finds nothing (Savitura/Savitools#291).
    const entry = this.passkeyChallenges.get(key);
    this.passkeyChallenges.delete(key);
    if (!entry) {
      throw new UnauthorizedException(
        'PASSKEY_CHALLENGE_INVALID: challenge is expired, unknown, or already used',
      );
    }
    if (entry.type !== type || entry.rpId !== rpId) {
      throw new UnauthorizedException('PASSKEY_CHALLENGE_MISMATCH');
    }
  }

  /**
   * Mint a short-lived reauthentication grant after a fresh password check.
   * Passkey registration, renaming, and revocation all require one.
   */
  async requestPasskeyReauth(
    userId: string,
    password: string,
  ): Promise<{ reauthToken: string; expiresIn: number }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user?.passwordHash) {
      throw new ForbiddenException(
        'Reauthentication requires a password login; accounts without a password cannot be reauthenticated',
      );
    }
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid password');
    }

    const reauthToken = this.jwtService.sign(
      { sub: user.id, scope: PASSKEY_REAUTH_SCOPE },
      {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: PASSKEY_REAUTH_TTL_SECONDS,
      },
    );

    return { reauthToken, expiresIn: PASSKEY_REAUTH_TTL_SECONDS };
  }

  private verifyReauthToken(reauthToken: string, userId: string): void {
    let payload: { sub?: string; scope?: string };
    try {
      payload = this.jwtService.verify(reauthToken, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('REAUTH_REQUIRED: reauthentication grant expired or invalid');
    }
    if (payload.sub !== userId || payload.scope !== PASSKEY_REAUTH_SCOPE) {
      throw new ForbiddenException('Reauthentication grant is not valid for this account');
    }
  }

  /** Begin passkey registration: requires a fresh reauthentication grant. */
  async beginPasskeyRegistration(
    userId: string,
    reauthToken: string,
    options?: {
      rpId?: string;
      rpName?: string;
    },
  ): Promise<{ options: PublicKeyCredentialCreationOptionsJSON }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    this.verifyReauthToken(reauthToken, userId);

    if (!user.emailVerified) {
      throw new ForbiddenException('Verify your email before registering a passkey');
    }

    const existing = await this.passkeysRepository.find({
      where: { userId, revokedAt: IsNull() },
    });
    if (existing.length >= PASSKEY_MAX_PER_USER) {
      throw new ConflictException(
        `Maximum of ${PASSKEY_MAX_PER_USER} passkeys per account reached`,
      );
    }

    const { rpId, rpName } = {
      rpId:
        options?.rpId ??
        this.configService.get<string>('PASSKEY_RP_ID') ??
        new URL(this.webOrigin()).hostname,
      rpName: options?.rpName ?? 'SaviTools',
    };

    const creationOptions = await generateRegistrationOptions({
      rpName,
      rpID: rpId,
      userID: new TextEncoder().encode(user.id),
      userName: user.email,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: (c.transports ?? []) as AuthenticatorTransport[],
      })),
    });

    this.storePasskeyChallenge(
      userId,
      'registration',
      creationOptions.challenge,
      rpId,
    );

    return { options: creationOptions };
  }

  private webOrigin(): string {
    return this.configService.get<string>('WEB_ORIGIN', 'http://localhost:3000');
  }

  /** Verify an attestation response and persist the credential. */
  async verifyPasskeyRegistration(
    userId: string,
    reauthToken: string,
    name: string,
    registrationResponse: RegistrationResponseJSON,
    transports?: string[],
  ): Promise<PasskeyCredential> {
    this.verifyReauthToken(reauthToken, userId);

    const clientDataHashInput = (registrationResponse.response.clientDataJSON ?? '') as string;
    if (!clientDataHashInput) {
      throw new BadRequestException('registrationResponse.response.clientDataJSON is required');
    }

    const { rpId } = {
      rpId:
        this.configService.get<string>('PASSKEY_RP_ID') ??
        new URL(this.webOrigin()).hostname,
    };

    // The challenge bound to this registration attempt must still be
    // pending; it is consumed below after attestation verification.
    let expectedChallenge = '';
    try {
      const clientData = JSON.parse(
        Buffer.from(clientDataHashInput, 'base64url').toString('utf8'),
      ) as { challenge?: string };
      expectedChallenge = clientData.challenge ?? '';
    } catch {
      throw new BadRequestException('Malformed clientDataJSON in registration response');
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: registrationResponse,
        expectedChallenge,
        expectedOrigin: this.webOrigin(),
        expectedRPID: rpId,
        requireUserVerification: false,
      });
    } catch (err) {
      throw new BadRequestException(
        `Passkey registration failed: ${err instanceof Error ? err.message : 'invalid attestation'}`,
      );
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Passkey registration could not be verified');
    }

    this.takePasskeyChallenge(userId, expectedChallenge, 'registration', rpId);

    const { credential } = verification.registrationInfo;

    const stored = this.passkeysRepository.create({
      userId,
      name,
      credentialId: credential.id,
      algorithm: (credential as { algorithm?: number }).algorithm ?? -7,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: 0,
      transports: transports ?? credential.transports ?? null,
    });

    return this.passkeysRepository.save(stored);
  }

  /** Begin assertion login for an account (no password involved). */
  async beginPasskeyLogin(
    email?: string,
    options?: { rpId?: string },
  ): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; allowCredentials?: Array<{ id: string }> }> {
    const { rpId } = {
      rpId:
        options?.rpId ??
        this.configService.get<string>('PASSKEY_RP_ID') ??
        new URL(this.webOrigin()).hostname,
    };

    let allowCredentials: Array<{ id: string }> | undefined;
    if (email) {
      const user = await this.usersRepository.findOne({
        where: { email: email.trim().toLowerCase() },
      });
      if (user) {
        const credentials = await this.passkeysRepository.find({
          where: { userId: user.id, revokedAt: IsNull() },
        });
        allowCredentials = credentials.map((c) => ({ id: c.credentialId }));
      }
    }

    const authOptions = await generateAuthenticationOptions({
      rpID: rpId,
      allowCredentials,
      userVerification: 'preferred',
    });

    // Assertion challenges are stored under a stable owner hash of the allowed
    // credential ids, and constrained to those credentials at verification
    // time. Discoverable (usernameless) assertions are issued before the server
    // knows which credential will answer, so they are keyed under
    // DISCOVERABLE_CHALLENGE_OWNER instead (#287).
    const challengeOwner = allowCredentials
      ? this.userIdForChallenge(allowCredentials)
      : DISCOVERABLE_CHALLENGE_OWNER;
    this.storePasskeyChallenge(
      challengeOwner,
      'assertion',
      authOptions.challenge,
      rpId,
      allowCredentials?.map((c) => c.id),
    );

    return { options: authOptions, allowCredentials };
  }

  /** Resolve the storage key owner for a login challenge based on allowCredentials. */
  private userIdForChallenge(allowCredentials: Array<{ id: string }>): string {
    const ids = allowCredentials.map((c) => c.id).sort().join(',');
    return createHash('sha256').update(ids).digest('hex').slice(0, 24);
  }

  /** Consume an assertion challenge and enforce any credential allow-list. */
  private claimAssertionChallenge(
    challenge: string,
    credentialId: string,
    credentialUserId: string,
    rpId: string,
  ): void {
    const allowedRaw = this.challengeKeyCache.get(challenge);
    // Consumed on read, so the allow-list cannot outlive the challenge it belongs to.
    this.challengeKeyCache.delete(challenge);
    if (allowedRaw) {
      const allowed = allowedRaw.split(',');
      if (!allowed.includes(credentialId)) {
        throw new UnauthorizedException(
          'PASSKEY_CHALLENGE_MISMATCH: credential was not in the challenge allow-list',
        );
      }
      const owner = this.userIdForChallenge(allowed.map((id) => ({ id })));
      this.takePasskeyChallenge(owner, challenge, 'assertion', rpId);
      return;
    }

    // Discoverable credential: the challenge was issued without an allow-list,
    // so it was keyed under DISCOVERABLE_CHALLENGE_OWNER rather than under the
    // user this assertion names. Prefer the owner that actually holds it, so a
    // usernameless login can consume its own challenge (#287) — the key is
    // still consumed exactly once and still checked for type and rpId.
    const owner = this.passkeyChallenges.has(`${credentialUserId}:${challenge}`)
      ? credentialUserId
      : DISCOVERABLE_CHALLENGE_OWNER;

    this.takePasskeyChallenge(owner, challenge, 'assertion', rpId);
  }

  /** Verify an assertion and issue the same session as password login. */
  async verifyPasskeyLogin(
    assertionResponse: AuthenticationResponseJSON,
    ctx: IssueSessionContext = {},
  ): Promise<{ user: User; tokens: SessionTokens }> {
    const credentialId = assertionResponse.id ?? assertionResponse.rawId;
    if (!credentialId) {
      throw new BadRequestException('Assertion response must include a credential id');
    }

    const credential = await this.passkeysRepository.findOne({
      where: { credentialId },
      relations: ['user'],
    });

    if (!credential) {
      throw new UnauthorizedException('PASSKEY_UNKNOWN');
    }
    if (credential.revokedAt) {
      throw new UnauthorizedException('PASSKEY_REVOKED');
    }

    const { rpId, origin } = {
      rpId:
        this.configService.get<string>('PASSKEY_RP_ID') ??
        new URL(this.webOrigin()).hostname,
      origin: this.webOrigin(),
    };

    // Consume the challenge before verification so replays never verify.
    const clientChallenge =
      (assertionResponse.response as { challenge?: string }).challenge ?? '';
    this.claimAssertionChallenge(
      clientChallenge,
      credentialId,
      credential.userId,
      rpId,
    );

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: assertionResponse,
        expectedChallenge: clientChallenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        credential: {
          id: credential.credentialId,
          publicKey: Buffer.from(credential.publicKey, 'base64url'),
          counter: Number(credential.counter),
          transports: (credential.transports ?? []) as AuthenticatorTransport[],
        },
        requireUserVerification: false,
      });
    } catch (err) {
      throw new UnauthorizedException(
        `PASSKEY_ASSERTION_INVALID: ${err instanceof Error ? err.message : 'verification failed'}`,
      );
    }

    if (!verification.verified) {
      throw new UnauthorizedException('PASSKEY_ASSERTION_INVALID');
    }

    const authInfo = verification.authenticationInfo;
    if (
      typeof authInfo.newCounter === 'number' &&
      authInfo.newCounter !== 0 &&
      authInfo.newCounter <= Number(credential.counter)
    ) {
      throw new UnauthorizedException('PASSKEY_REPLAY_OR_CLONE_DETECTED');
    }

    credential.counter = authInfo.newCounter;
    credential.lastUsedAt = new Date();
    await this.passkeysRepository.save(credential);

    const tokens = await this.sessionService.issueSession(credential.user, ctx);
    return { user: credential.user, tokens };
  }

  async listPasskeys(userId: string): Promise<
    Array<{ id: string; name: string; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null }>
  > {
    const passkeys = await this.passkeysRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return passkeys.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      lastUsedAt: p.lastUsedAt,
      revokedAt: p.revokedAt,
    }));
  }

  async renamePasskey(credentialId: string, userId: string, name: string, reauthToken: string): Promise<void> {
    this.verifyReauthToken(reauthToken, userId);
    const passkey = await this.passkeysRepository.findOne({
      where: { id: credentialId, userId },
    });
    if (!passkey) throw new NotFoundException('Passkey not found');
    passkey.name = name;
    await this.passkeysRepository.save(passkey);
  }

  /** Revocation is permanent — revoked credentials can never authenticate. */
  async revokePasskey(credentialId: string, userId: string, reauthToken: string): Promise<void> {
    this.verifyReauthToken(reauthToken, userId);
    const passkey = await this.passkeysRepository.findOne({
      where: { id: credentialId, userId },
    });
    if (!passkey) throw new NotFoundException('Passkey not found');
    if (passkey.revokedAt) {
      throw new ConflictException('Passkey is already revoked');
    }
    passkey.revokedAt = new Date();
    await this.passkeysRepository.save(passkey);
  }
}
