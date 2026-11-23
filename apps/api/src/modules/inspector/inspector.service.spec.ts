import { Test, TestingModule } from '@nestjs/testing';
import { InspectorService } from './inspector.service';

describe('InspectorService', () => {
  let service: InspectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InspectorService],
    }).compile();

    service = module.get<InspectorService>(InspectorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('XDR decoding', () => {
    it('should reject empty or malformed XDR input', () => {
      expect(() => service.decodeXdr('')).toThrow();
      expect(() => service.decodeXdr('not-valid-base64-xdr!!')).toThrow();
    });

    it('should decode a valid transaction envelope XDR', () => {
      const xdr = service.encodeTestEnvelope();
      const decoded = service.decodeXdr(xdr);
      expect(decoded).toBeDefined();
      expect(decoded.type).toBeDefined();
    });
  });

  describe('auth entry inspection', () => {
    it('should return an empty list for transactions without auth entries', () => {
      const xdr = service.encodeTestEnvelope();
      const entries = service.inspectAuthEntries(service.decodeXdr(xdr));
      expect(Array.isArray(entries)).toBe(true);
      expect(entries).toHaveLength(0);
    });

    it('should report each auth entry with its credential type', () => {
      const xdr = service.encodeTestEnvelopeWithAuth();
      const entries = service.inspectAuthEntries(service.decodeXdr(xdr));
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.credentialType).toBeDefined();
      }
    });
  });

  describe('StrKey validation', () => {
    it('should accept a valid account public key (G...)', () => {
      const key = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';
      expect(service.isValidStrKey(key)).toBe(true);
    });

    it('should reject keys with an invalid checksum', () => {
      const key = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN8';
      expect(service.isValidStrKey(key)).toBe(false);
    });

    it('should reject strings with the wrong prefix or length', () => {
      expect(service.isValidStrKey('')).toBe(false);
      expect(service.isValidStrKey('XAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7')).toBe(false);
      expect(service.isValidStrKey('GAAZI4')).toBe(false);
    });
  });
});
