import { render } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import { extractErrorCode, useErrorMessages } from '@/lib/error-messages';

jest.mock('next-intl', () => ({
  useTranslations: jest.fn(),
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<typeof useTranslations>;
const tMock = jest.fn((key: string) => `translated:${key}`);

function ErrorMessage({ error }: { error: unknown }) {
  const { translateError } = useErrorMessages();
  return <span>{translateError(error)}</span>;
}

function translateError(error: unknown): string {
  const { container } = render(<ErrorMessage error={error} />);
  return container.textContent ?? '';
}

beforeEach(() => {
  jest.clearAllMocks();
  useTranslationsMock.mockReturnValue(tMock as never);
});

describe('useErrorMessages', () => {
  it('uses the errors namespace and translates through one key', () => {
    expect(translateError({ code: 'FORBIDDEN' })).toBe('translated:forbidden');
    expect(useTranslationsMock).toHaveBeenCalledWith('errors');
    expect(tMock).toHaveBeenCalledTimes(1);
    expect(tMock).toHaveBeenCalledWith('forbidden');
  });

  it.each([
    { code: 'NETWORK_ERROR', key: 'network' },
    { code: 'VALIDATION_ERROR', key: 'validation' },
    { code: 'UNAUTHORIZED', key: 'unauthorized' },
    { code: 'FORBIDDEN', key: 'forbidden' },
    { code: 'NOT_FOUND', key: 'notFound' },
    { code: 'TIMEOUT', key: 'timeout' },
    { code: 'SERVER_ERROR', key: 'serverError' },
    { code: 'INVALID_XDR', key: 'invalidXdr' },
    { code: 'INSUFFICIENT_FUNDS', key: 'insufficientFunds' },
    { code: 'ACCOUNT_NOT_FOUND', key: 'accountNotFound' },
    { code: 'CONTRACT_NOT_FOUND', key: 'contractNotFound' },
    { code: 'INVALID_ADDRESS', key: 'invalidAddress' },
    { code: 'SIGNATURE_REQUIRED', key: 'signatureRequired' },
    { code: 'MULTISIG_THRESHOLD', key: 'multisigThreshold' },
    { code: 'GENERIC', key: 'generic' },
    { code: 'VENDOR_CODE', key: 'generic' },
  ])('maps the $code code to $key', ({ code, key }) => {
    expect(translateError({ code })).toBe(`translated:${key}`);
    expect(tMock).toHaveBeenCalledWith(key);
  });

  it.each([
    { status: 400, key: 'validation' },
    { status: 401, key: 'unauthorized' },
    { status: 403, key: 'forbidden' },
    { status: 404, key: 'notFound' },
    { status: 408, key: 'timeout' },
    { status: 504, key: 'timeout' },
    { status: 500, key: 'serverError' },
    { status: 502, key: 'serverError' },
    { status: 503, key: 'serverError' },
    { status: 599, key: 'serverError' },
    { status: 422, key: 'generic' },
    { status: 418, key: 'generic' },
  ])('maps HTTP status $status to $key', ({ status, key }) => {
    expect(translateError({ status })).toBe(`translated:${key}`);
    expect(tMock).toHaveBeenCalledWith(key);
  });

  it('prefers statusCode when status is zero or absent', () => {
    expect(translateError({ status: 0, statusCode: 404 })).toBe('translated:notFound');
    expect(translateError({ statusCode: 503 })).toBe('translated:serverError');
  });

  it('prefers an explicit code over status and message', () => {
    expect(translateError({ code: 'FORBIDDEN', status: 404, message: 'fetch failed' })).toBe(
      'translated:forbidden',
    );
    expect(tMock).toHaveBeenCalledWith('forbidden');
  });

  it.each([
    { error: { name: 'NetworkError' }, key: 'network' },
    { error: { message: 'failed to fetch token' }, key: 'network' },
    { error: { message: 'invalid sequence number' }, key: 'validation' },
    { error: { message: 'insufficient balance' }, key: 'insufficientFunds' },
    { error: { message: 'account not found' }, key: 'accountNotFound' },
    { error: { message: 'fetch failed: account not found' }, key: 'network' },
  ])('maps the error heuristic $key', ({ error, key }) => {
    expect(translateError(error)).toBe(`translated:${key}`);
    expect(tMock).toHaveBeenCalledWith(key);
  });

  it.each([
    { error: { message: 'Custom detail' }, expected: 'Custom detail' },
    { error: { message: '' }, expected: 'translated:generic' },
    { error: null, expected: 'translated:generic' },
    { error: undefined, expected: 'translated:generic' },
    { error: { code: '' }, expected: 'translated:generic' },
  ])('falls back for $error', ({ error, expected }) => {
    expect(translateError(error)).toBe(expected);
  });
});

describe('extractErrorCode', () => {
  it.each([
    'NETWORK_ERROR',
    'VALIDATION_ERROR',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'TIMEOUT',
    'SERVER_ERROR',
    'INVALID_XDR',
    'INSUFFICIENT_FUNDS',
    'ACCOUNT_NOT_FOUND',
    'CONTRACT_NOT_FOUND',
    'INVALID_ADDRESS',
    'SIGNATURE_REQUIRED',
    'MULTISIG_THRESHOLD',
    'GENERIC',
    'VENDOR_CODE',
  ])('returns the explicit code %s verbatim', (code) => {
    expect(extractErrorCode({ code })).toBe(code);
  });

  it.each([
    { status: 400, code: 'VALIDATION_ERROR' },
    { status: 401, code: 'UNAUTHORIZED' },
    { status: 403, code: 'FORBIDDEN' },
    { status: 404, code: 'NOT_FOUND' },
    { status: 408, code: 'TIMEOUT' },
    { status: 504, code: 'TIMEOUT' },
    { status: 500, code: 'SERVER_ERROR' },
    { status: 502, code: 'SERVER_ERROR' },
    { status: 503, code: 'SERVER_ERROR' },
    { status: 599, code: 'GENERIC' },
    { status: 422, code: 'GENERIC' },
  ])('maps HTTP status $status to $code', ({ status, code }) => {
    expect(extractErrorCode({ status })).toBe(code);
  });

  it('prefers statusCode when status is zero or absent', () => {
    expect(extractErrorCode({ status: 0, statusCode: 401 })).toBe('UNAUTHORIZED');
    expect(extractErrorCode({ statusCode: 404 })).toBe('NOT_FOUND');
  });

  it('maps only the network heuristics', () => {
    expect(extractErrorCode({ name: 'NetworkError' })).toBe('NETWORK_ERROR');
    expect(extractErrorCode({ message: 'failed to fetch token' })).toBe('NETWORK_ERROR');
  });

  it.each([
    { message: 'invalid sequence number' },
    { message: 'insufficient balance' },
    { message: 'account not found' },
  ])('does not infer a Stellar code from $message', (error) => {
    expect(extractErrorCode(error)).toBe('GENERIC');
  });

  it.each([null, undefined, {}, { code: '' }])(
    'returns GENERIC for nullish or empty input',
    (error) => {
      expect(extractErrorCode(error)).toBe('GENERIC');
    },
  );
});
