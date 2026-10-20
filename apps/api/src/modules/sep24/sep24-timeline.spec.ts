import { Keypair } from '@stellar/stellar-sdk';
import { Sep24Timeline } from './sep24-timeline';

describe('Sep24Timeline redaction', () => {
  const buildTimeline = () =>
    new Sep24Timeline('session-1', {
      assetCode: 'USDC',
      operation: 'deposit',
      anchorDomain: 'anchor.example.com',
    });

  it('redacts a JWT and a Stellar secret seed from a recorded timeline entry', () => {
    const timeline = buildTimeline();
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJHQVhYWFiIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const secret = Keypair.random().secret();
    expect(secret).toMatch(/^S[A-Z2-7]{55}$/);

    const entry = timeline.record({
      kind: 'auth',
      message: 'Using provided SEP-10 JWT',
      request: {
        // Not a key that matches SENSITIVE_KEY_PATTERNS, so this exercises
        // value-level redaction of the embedded JWT.
        note: `Authorization: Bearer ${jwt}`,
      },
      response: {
        // Also value-level: the seed sits under a benign key.
        memo: `funded by ${secret}`,
      },
      details: {
        secretKey: secret,
      },
    });

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain(jwt);
    expect(serialized).not.toContain(secret);
    expect(serialized).toContain('[REDACTED]');
  });

  it('redacts every entry in an exported timeline', () => {
    const timeline = buildTimeline();
    const secret = Keypair.random().secret();
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJHQVhYWFiIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    timeline.record({ kind: 'auth', details: { token: jwt } });
    timeline.record({ kind: 'poll', request: { body: secret } });

    const exported = JSON.stringify(timeline.export());
    expect(exported).not.toContain(jwt);
    expect(exported).not.toContain(secret);
  });
});
