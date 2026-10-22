import type { OpenApiModuleFixture } from './openapi-contract';

/**
 * Representative success and validation-error operations for every public
 * feature module (Savitura/Savitools#445).
 *
 * Each entry names a route the module really serves and the status code its
 * controller documents. The OpenAPI gate fails when a module disappears from
 * this list, when a route is renamed without updating the fixture, or when the
 * documented response is missing. Paths use OpenAPI syntax (`{id}`).
 *
 * Health and metrics are intentionally absent: they are infrastructure probes
 * with no feature input of their own (see `NON_FEATURE_API_MODULES`).
 */
export const OPENAPI_MODULE_FIXTURES: OpenApiModuleFixture[] = [
  {
    module: 'auth',
    success: {
      method: 'POST',
      path: '/api/v1/auth/register',
      status: 201,
      request: { body: { email: 'dev@example.com', password: 'SecurePassword123' } },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/auth/register',
      status: 400,
      request: { body: { email: 'not-an-email', password: 'short' } },
    },
  },
  {
    module: 'composer',
    success: { method: 'POST', path: '/api/v1/composer/build', status: 201 },
    validationError: { method: 'POST', path: '/api/v1/composer/fee-bump', status: 400 },
  },
  {
    module: 'contracts',
    success: { method: 'GET', path: '/api/v1/contracts/events', status: 200 },
    validationError: {
      method: 'POST',
      path: '/api/v1/contracts/events/filter',
      status: 400,
      request: { body: {} },
    },
  },
  {
    module: 'federation',
    success: {
      method: 'GET',
      path: '/api/v1/federation/resolve',
      status: 200,
      request: { query: { address: 'alice*stellar.org' } },
    },
    validationError: {
      method: 'GET',
      path: '/api/v1/federation/resolve',
      status: 400,
      request: { query: { address: '' } },
    },
  },
  {
    module: 'inspector',
    success: {
      method: 'POST',
      path: '/api/v1/inspector/decode-xdr',
      status: 201,
      request: { body: { xdr: 'AAAAAgAAAAA=' } },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/inspector/decode-xdr',
      status: 400,
      request: { body: { xdr: '' } },
    },
  },
  {
    module: 'ledger-close',
    success: {
      method: 'GET',
      path: '/api/v1/ledger-close/stats',
      status: 200,
      request: { query: { network: 'testnet' } },
    },
    validationError: {
      method: 'GET',
      path: '/api/v1/ledger-close/stats',
      status: 400,
      request: { query: { from: 'not-a-date' } },
    },
  },
  {
    module: 'liquidity-pools',
    success: {
      method: 'GET',
      path: '/api/v1/liquidity-pools/search',
      status: 200,
      request: { query: { assetA: 'XLM', assetB: 'USDC:GISSUER' } },
    },
    validationError: {
      method: 'GET',
      path: '/api/v1/liquidity-pools/search',
      status: 400,
      request: { query: { assetA: 'not-an-asset', assetB: '' } },
    },
  },
  {
    module: 'monitor',
    success: {
      method: 'POST',
      path: '/api/v1/monitor/watches',
      status: 201,
      request: {
        body: {
          publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
          eventTypes: ['payment'],
        },
      },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/monitor/watches',
      status: 400,
      request: { body: { publicKey: 'not-a-stellar-key', eventTypes: [] } },
    },
  },
  {
    module: 'multisig',
    success: {
      method: 'POST',
      path: '/api/v1/multisig/simulate',
      status: 200,
      request: { body: { signers: [], thresholds: {} } },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/multisig/simulate',
      status: 400,
      request: { body: { signers: [], thresholds: { high: 100 } } },
    },
  },
  {
    module: 'network',
    success: {
      method: 'GET',
      path: '/api/v1/network/status',
      status: 200,
      request: { query: { network: 'testnet' } },
    },
    validationError: {
      method: 'GET',
      path: '/api/v1/network/status/history',
      status: 400,
      request: { query: { from: 'not-a-date' } },
    },
  },
  {
    module: 'playground',
    success: {
      method: 'POST',
      path: '/api/v1/playground/keys',
      status: 201,
      request: { body: { provider: 'fluxa', name: 'ci', key: 'test-key' } },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/playground/keys',
      status: 400,
      request: { body: { provider: 'unknown' } },
    },
  },
  {
    module: 'sandbox',
    success: {
      method: 'POST',
      path: '/api/v1/sandbox/fund',
      status: 201,
      request: { body: { publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' } },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/sandbox/fund',
      status: 400,
      request: { body: { publicKey: 'not-a-stellar-key' } },
    },
  },
  {
    module: 'sdkgen',
    success: {
      method: 'POST',
      path: '/api/v1/sdkgen/generate',
      status: 200,
      request: { body: { spec: 'fluxa', language: 'typescript' } },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/sdkgen/generate',
      status: 400,
      request: { body: { spec: 'unknown', language: 'cobol' } },
    },
  },
  {
    module: 'shared',
    success: {
      method: 'GET',
      path: '/api/v1/shared/composer/{token}',
      status: 200,
      request: { path: { token: 'valid-token' } },
    },
    validationError: {
      method: 'GET',
      path: '/api/v1/shared/composer/{token}',
      status: 404,
      request: { path: { token: 'invalid-token' } },
    },
  },
  {
    module: 'sep10',
    success: {
      method: 'POST',
      path: '/api/v1/sep10/fetch-challenge',
      status: 200,
      request: { body: { anchorDomain: 'testanchor.stellar.org' } },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/sep10/fetch-challenge',
      status: 400,
      request: { body: { anchorDomain: '' } },
    },
  },
  {
    module: 'sep24',
    success: {
      method: 'POST',
      path: '/api/v1/sep24/debugger/sessions',
      status: 201,
      request: {
        body: { anchorDomain: 'testanchor.stellar.org', assetCode: 'USDC', operation: 'deposit' },
      },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/sep24/debugger/sessions',
      status: 400,
      request: { body: { anchorDomain: '', assetCode: '', operation: 'invalid' } },
    },
  },
  {
    module: 'sequence-planner',
    success: {
      method: 'POST',
      path: '/api/v1/sequence-planner/plan',
      status: 200,
      request: { body: {} },
    },
    validationError: {
      method: 'GET',
      path: '/api/v1/sequence-planner/account-sequence',
      status: 400,
      request: { query: { account: 'not-a-stellar-key' } },
    },
  },
  {
    module: 'simulator',
    success: {
      method: 'POST',
      path: '/api/v1/simulator/estimate',
      status: 200,
      request: { body: {} },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/simulator/estimate',
      status: 400,
      request: { body: { sourceAsset: 'not-an-asset' } },
    },
  },
  {
    module: 'soroban-rpc',
    success: {
      method: 'POST',
      path: '/api/v1/soroban-rpc/execute',
      status: 200,
      request: { body: { method: 'getLatestLedger', params: {} } },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/soroban-rpc/execute',
      status: 400,
      request: { body: { method: 'sendTransaction' } },
    },
  },
  {
    module: 'soroban-storage',
    success: {
      method: 'POST',
      path: '/api/v1/soroban-storage/query',
      status: 200,
      request: { body: { contractId: 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE' } },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/soroban-storage/query',
      status: 400,
      request: { body: { contractId: 'not-a-contract' } },
    },
  },
  {
    module: 'stellar-toml',
    success: {
      method: 'POST',
      path: '/api/v1/stellar-toml/parse',
      status: 200,
      request: { body: { toml: 'NETWORK_PASSPHRASE="Test SDF Network ; September 2015"' } },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/stellar-toml/parse',
      status: 400,
      request: { body: { toml: '' } },
    },
  },
  {
    module: 'transaction',
    success: {
      method: 'POST',
      path: '/api/v1/transaction/graph',
      status: 200,
      request: { body: { root: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' } },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/transaction/graph',
      status: 400,
      request: { body: { root: 'not-a-stellar-key' } },
    },
  },
  {
    module: 'transactions',
    success: {
      method: 'GET',
      path: '/api/v1/transactions/{hash}',
      status: 200,
      request: { path: { hash: '0'.repeat(64) } },
    },
    validationError: {
      method: 'GET',
      path: '/api/v1/transactions/replay/history',
      status: 400,
      request: { query: { limit: 'not-a-number' } },
    },
  },
  {
    module: 'vault',
    success: {
      method: 'POST',
      path: '/api/v1/vault/keys',
      status: 201,
      request: { body: { name: 'ci', provider: 'fluxa', key: 'test-key' } },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/vault/keys',
      status: 400,
      request: { body: { name: '', provider: 'unknown', key: '' } },
    },
  },
  {
    module: 'wallet',
    success: {
      method: 'POST',
      path: '/api/v1/wallet/fund',
      status: 200,
      request: { body: { publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' } },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/wallet/fund',
      status: 400,
      request: { body: { publicKey: 'not-a-stellar-key' } },
    },
  },
  {
    module: 'webhooks',
    success: {
      method: 'POST',
      path: '/api/v1/webhooks/send',
      status: 201,
      request: { body: { endpointUrl: 'https://example.com/hook', eventType: 'campaign.funded' } },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/webhooks/send',
      status: 400,
      request: { body: { endpointUrl: 'not-a-url', eventType: '' } },
    },
  },
  {
    module: 'workspaces',
    success: {
      method: 'POST',
      path: '/api/v1/workspaces/composer',
      status: 201,
      request: { body: { name: 'CI workspace' } },
    },
    validationError: {
      method: 'POST',
      path: '/api/v1/workspaces/composer',
      status: 400,
      request: { body: { name: '' } },
    },
  },
];
