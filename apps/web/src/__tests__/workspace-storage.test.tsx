import {
  readGuestWorkspace,
  writeGuestWorkspace,
  validateWorkspaceJSON,
  WORKSPACE_FORMAT_VERSION,
} from '@/lib/workspace-storage';
import { subscribeToClientErrors, type ClientErrorReport } from '@/lib/client-error-reporter';

const DEFAULT_STATE = { composerState: { source: 'native' }, operations: [] };

describe('workspace-storage', () => {
  let reports: ClientErrorReport[];
  let unsubscribe: () => void;

  beforeEach(() => {
    window.localStorage.clear();
    reports = [];
    unsubscribe = subscribeToClientErrors((report) => reports.push(report));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    unsubscribe();
    jest.restoreAllMocks();
  });

  it('round-trips a guest workspace under the namespaced storage key', () => {
    expect(writeGuestWorkspace('composer', DEFAULT_STATE)).toBe(true);
    expect(window.localStorage.getItem('savitools:guest:composer')).toBe(
      JSON.stringify(DEFAULT_STATE),
    );
    expect(readGuestWorkspace('composer', { composerState: {}, operations: ['fallback'] })).toEqual(
      DEFAULT_STATE,
    );
  });

  it('returns the fallback when the stored workspace JSON is corrupted', () => {
    const fallback = { composerState: { restored: true }, operations: [] as unknown[] };
    window.localStorage.setItem('savitools:guest:inspector', '{broken');

    expect(readGuestWorkspace('inspector', fallback)).toEqual(fallback);
    expect(window.localStorage.getItem('savitools:guest:inspector')).toBe('{broken');
  });

  it('returns the fallback when localStorage reads are blocked', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage access denied');
    });

    expect(readGuestWorkspace('webhooks', DEFAULT_STATE)).toEqual(DEFAULT_STATE);
  });

  it('reports failed writes with actionable feedback and quota details', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const error = new Error('Storage full');
      error.name = 'QuotaExceededError';
      throw error;
    });

    expect(writeGuestWorkspace('sandbox', DEFAULT_STATE)).toBe(false);
    expect(reports).toHaveLength(1);
    expect(reports[0].area).toBe('workspace-storage');
    expect(reports[0].severity).toBe('warn');
    expect(reports[0].userMessage).toMatch(/could not be saved/i);
    expect(reports[0].details?.quotaExceeded).toBe(true);
    expect(reports[0].details?.tool).toBe('sandbox');
  });

  it('returns false when writes fail for a non-quota reason', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(writeGuestWorkspace('composer', DEFAULT_STATE)).toBe(false);
    expect(reports[0].details?.quotaExceeded).toBe(false);
  });

  it('validates current and legacy workspace export shapes', () => {
    const legacy = JSON.stringify({
      composerState: { operations: [{ id: 1 }] },
    });
    expect(validateWorkspaceJSON(legacy)).toEqual({
      formatVersion: WORKSPACE_FORMAT_VERSION,
      name: undefined,
      composerState: { operations: [{ id: 1 }] },
      operations: [{ id: 1 }],
    });

    const current = JSON.stringify({
      formatVersion: WORKSPACE_FORMAT_VERSION,
      name: 'My workspace',
      composerState: {},
      operations: [{ id: 2 }],
    });
    expect(validateWorkspaceJSON(current).name).toBe('My workspace');
    expect(() => validateWorkspaceJSON('{invalid')).toThrow('Invalid JSON file.');
  });
});
