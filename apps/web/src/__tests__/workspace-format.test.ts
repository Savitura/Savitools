import {
  WORKSPACE_FORMAT_VERSION,
  WorkspaceFormatError,
  migrateWorkspaceFile,
  parseWorkspaceFile,
  serializeWorkspaceFile,
} from '@/lib/workspace-format';

const STATE = {
  sourceAccount: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  memo: 'rent',
  operations: [{ id: 'op-1', type: 'payment', fields: { amount: '10' } }],
};

describe('workspace format', () => {
  it('exports the current schema version and round-trips the file', () => {
    const json = serializeWorkspaceFile({
      name: 'Rent',
      composerState: STATE,
      operations: STATE.operations,
    });
    const parsed = parseWorkspaceFile(json);

    expect(JSON.parse(json).formatVersion).toBe(WORKSPACE_FORMAT_VERSION);
    expect(parsed.formatVersion).toBe(WORKSPACE_FORMAT_VERSION);
    expect(parsed.name).toBe('Rent');
    expect(parsed.operations).toHaveLength(1);
    expect(parsed.composerState).toMatchObject(STATE);
  });

  it('migrates a legacy unversioned export that only stores operations inside composerState', () => {
    const legacy = {
      name: 'Old workspace',
      composerState: STATE,
    };

    const migrated = migrateWorkspaceFile(legacy);

    expect(migrated.formatVersion).toBe(WORKSPACE_FORMAT_VERSION);
    expect(migrated.operations).toEqual(STATE.operations);
    expect(migrated.composerState.operations).toEqual(STATE.operations);
  });

  it('migrates an explicit v1 file with top-level operations', () => {
    const migrated = migrateWorkspaceFile({
      formatVersion: 1,
      name: 'V1 workspace',
      composerState: { ...STATE, operations: undefined },
      operations: STATE.operations,
    });

    expect(migrated.formatVersion).toBe(WORKSPACE_FORMAT_VERSION);
    expect(migrated.operations).toEqual(STATE.operations);
  });

  it.each([3, 0, -1])(
    'rejects unsupported format version %s with an actionable message',
    (version) => {
      const json = JSON.stringify({
        formatVersion: version,
        name: 'Future',
        composerState: STATE,
        operations: STATE.operations,
      });

      expect(() => parseWorkspaceFile(json)).toThrow(WorkspaceFormatError);
      expect(() => parseWorkspaceFile(json)).toThrow(
        new RegExp(`version ${version} is not supported`),
      );
    },
  );

  it('rejects a non-integer or malformed version', () => {
    expect(() => migrateWorkspaceFile({ formatVersion: '2', composerState: STATE })).toThrow(
      /formatVersion must be an integer/,
    );
    expect(() => migrateWorkspaceFile({ formatVersion: 1.5, composerState: STATE })).toThrow(
      /formatVersion must be an integer/,
    );
  });

  it('rejects malformed files without returning partial state', () => {
    expect(() => parseWorkspaceFile('{not json')).toThrow(/Invalid JSON file/);
    expect(() => migrateWorkspaceFile({ name: 'No state' })).toThrow(
      /Missing or invalid "composerState"/,
    );
    expect(() => migrateWorkspaceFile({ composerState: { sourceAccount: 'G...' } })).toThrow(
      /Missing or invalid "operations" array/,
    );
  });

  describe('export sanitization', () => {
    it('strips Stellar secret seeds and sensitive keys from serialized export', () => {
      const stateWithSecrets = {
        ...STATE,
        secretSeed: 'SCWJZEYCUCR4DTJVHNCKLLTD3FK7YRIY7RRAU5B2H7PB22IWCIFISPHE',
        privateKey: 'private-key-material',
        authToken: 'Bearer secret_token',
        nested: {
          signingKey: 'SCWJZEYCUCR4DTJVHNCKLLTD3FK7YRIY7RRAU5B2H7PB22IWCIFISPHE',
          safeField: 'ok',
        },
      };

      const json = serializeWorkspaceFile({
        name: 'Sensitive Workspace',
        composerState: stateWithSecrets,
        operations: STATE.operations,
      });

      const parsed = JSON.parse(json);
      expect(parsed.composerState.secretSeed).toBeUndefined();
      expect(parsed.composerState.privateKey).toBeUndefined();
      expect(parsed.composerState.authToken).toBeUndefined();
      expect(parsed.composerState.nested.signingKey).toBeUndefined();
      expect(parsed.composerState.nested.safeField).toBe('ok');
    });

    it('strips signed transaction payloads and signatures', () => {
      const stateWithSignatures = {
        ...STATE,
        signedTransaction: 'AAAAAgAAAA...',
        signedXdr: 'AAAAAgAAAA...',
        signatures: ['sig1', 'sig2'],
        signature: 'single-sig',
      };

      const json = serializeWorkspaceFile({
        name: 'Signed Workspace',
        composerState: stateWithSignatures,
        operations: STATE.operations,
      });

      const parsed = JSON.parse(json);
      expect(parsed.composerState.signedTransaction).toBeUndefined();
      expect(parsed.composerState.signedXdr).toBeUndefined();
      expect(parsed.composerState.signatures).toBeUndefined();
      expect(parsed.composerState.signature).toBeUndefined();
      expect(parsed.composerState.sourceAccount).toBe(STATE.sourceAccount);
    });

    it('redacts secret seeds embedded inside string fields like memo', () => {
      const stateWithEmbeddedSeed = {
        ...STATE,
        memo: 'seed SCWJZEYCUCR4DTJVHNCKLLTD3FK7YRIY7RRAU5B2H7PB22IWCIFISPHE inside memo',
      };

      const json = serializeWorkspaceFile({
        name: 'Embedded Seed Workspace',
        composerState: stateWithEmbeddedSeed,
        operations: STATE.operations,
      });

      const parsed = JSON.parse(json);
      expect(parsed.composerState.memo).toBe('seed [REDACTED] inside memo');
    });
  });
});
