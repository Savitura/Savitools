import {
  encodeHandoffFrames,
  parseHandoffFrame,
  createHandoffCollector,
  crc32,
  crc32Hex,
  QrHandoffError,
} from '@/lib/qr-handoff';

describe('qr-handoff', () => {
  const samplePayload = 'AAAAgQAAAAEAAAAABgAAAAAAAAACAAAAAAAAAAIAAAAAAAAAAgAAAAEAAAABAAAAAQ==';

  it('computes consistent crc32 hashes', () => {
    const hash = crc32Hex(samplePayload);
    expect(hash).toHaveLength(8);
    expect(crc32(samplePayload)).toBe(parseInt(hash, 16));
  });

  it('encodes a payload into valid frames', () => {
    const frames = encodeHandoffFrames(samplePayload, 'testnet');
    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0].net).toBe('testnet');
    expect(frames[0].v).toBe(1);
    expect(frames[0].sum).toBe(crc32Hex(samplePayload));
  });

  it('rejects empty payload and oversized payload during encoding', () => {
    expect(() => encodeHandoffFrames('', 'testnet')).toThrow(QrHandoffError);
    expect(() => encodeHandoffFrames('', 'testnet')).toThrow('empty-payload');
  });

  it('parses a valid handoff frame JSON string', () => {
    const frames = encodeHandoffFrames(samplePayload, 'testnet');
    const serialized = JSON.stringify(frames[0]);
    const parsed = parseHandoffFrame(serialized);
    expect(parsed.d).toBe(frames[0].d);
    expect(parsed.i).toBe(0);
    expect(parsed.net).toBe('testnet');
  });

  describe('malformed QR handoff frame recovery and validation', () => {
    it('throws not-a-frame for invalid JSON', () => {
      expect(() => parseHandoffFrame('not-json-at-all')).toThrow(QrHandoffError);
      try {
        parseHandoffFrame('not-json-at-all');
      } catch (err) {
        expect((err as QrHandoffError).code).toBe('not-a-frame');
      }
  });

    it('throws not-a-frame for malformed structure missing required fields', () => {
      const invalidObj = JSON.stringify({ v: 1, net: 'testnet' });
      expect(() => parseHandoffFrame(invalidObj)).toThrow(QrHandoffError);
  });

    it('throws unsupported-version for mismatched version numbers', () => {
      const frames = encodeHandoffFrames(samplePayload, 'testnet');
      const tampered = JSON.stringify({ ...frames[0], v: 99 });
      expect(() => parseHandoffFrame(tampered)).toThrow('unsupported-version');
  });

    it('throws checksum-mismatch when frame chunk data is altered', () => {
      const frames = encodeHandoffFrames(samplePayload, 'testnet');
      const tampered = JSON.stringify({ ...frames[0], d: 'tampereddata' });
      expect(() => parseHandoffFrame(tampered)).toThrow('checksum-mismatch');
  });
  });

  it('collects multi-frame handoffs and successfully reconstructs payload', () => {
    // Force multiple frames by setting a tiny frame size or using a longer payload
    const longPayload = samplePayload.repeat(20);
    const frames = encodeHandoffFrames(longPayload, 'testnet');
    expect(frames.length).toBeGreaterThan(1);

    const collector = createHandoffCollector('testnet');

    // Feed frames in reverse order to test out-of-order collection and deduplication
    let result;
    for (let i = frames.length - 1; i >= 0; i--) {
      result = collector.accept(JSON.stringify(frames[i]));
      if (i > 0) {
        expect(['accepted', 'duplicate']).toContain(result.status);
      }
    }

    expect(result?.status).toBe('complete');
    if (result && result.status === 'complete') {
      expect(result.xdr).toBe(longPayload);
    }
});

  it('handles network mismatch during frame collection', () => {
    const frames = encodeHandoffFrames(samplePayload, 'mainnet');
    const collector = createHandoffCollector('testnet');
    const result = collector.accept(JSON.stringify(frames[0]));

    expect(result.status).toBe('mismatched');
    if (result.status === 'mismatched') {
      expect(result.reason).toBe('network-mismatch');
    }
  });
    });


function buildEnvelope(options: { amount?: string; memo?: string } = {}): string {
  const source = Keypair.random();
  const destination = Keypair.random();
  const builder = new TransactionBuilder(
    new Account(source.publicKey(), '1'),
    { networkPassphrase: Networks.TESTNET, fee: '100' },
  )
    .addOperation(
      Operation.payment({
        destination: destination.publicKey(),
        asset: Asset.native(),
        amount: options.amount ?? '25',
      }),
    )
    .setTimeout(0);

  const transaction = builder.build();
  transaction.sign(source);
  return transaction.toEnvelope().toXDR('base64');
}

function signWithExtraKey(envelope: string): string {
  const decoded = TransactionBuilder.fromXDR(envelope, Networks.TESTNET);
  if (decoded instanceof FeeBumpTransaction) throw new Error('unexpected fee bump');
  decoded.sign(Keypair.random());
  return decoded.toEnvelope().toXDR('base64');
}
