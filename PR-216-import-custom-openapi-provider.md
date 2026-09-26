# PR: #216 feat: Import a user-owned OpenAPI provider into API Playground

## Summary
Allows authenticated users to add a private OpenAPI provider and use the existing request builder against it. Previously, the Playground provider enum was limited to Fluxa and CrowdPay, so developers could not use the request builder against another API.

## Changes

### Backend (API)

1. **`apps/api/src/modules/playground/entities/api-key.entity.ts`**
   - Added `CUSTOM = 'custom'` to `ApiKeyProvider` enum
   - Added `providerOrigin` column (nullable string) to store the HTTPS origin for custom providers
   - Added `openApiSpec` column (jsonb, nullable) to store the validated OpenAPI specification

2. **`apps/api/src/modules/playground/playground.service.ts`**
   - Modified `getProviderBaseUrl()` to handle `ApiKeyProvider.CUSTOM` with an optional `key` parameter containing `providerOrigin`
   - Rewrote `proxyRequest()` to handle custom providers - looks up the user's CUSTOM key and uses its `providerOrigin` as the base URL
   - Added `importProvider()` method - validates OpenAPI JSON document (requires `paths` object), encrypts API key, saves provider with origin and spec
   - Added `listProviders()` method - lists all providers for a user with decrypted keys, origin, and spec status
   - Added `renameProvider()` method - renames a provider's label
   - Added `deleteProvider()` method - deletes a provider's key

3. **`apps/api/src/modules/playground/playground.controller.ts`**
   - Added `POST /playground/providers/import` - import a custom OpenAPI provider
   - Added `GET /playground/providers` - list all user providers
   - Added `PUT /playground/providers/:id/rename` - rename a provider
   - Added `DELETE /playground/providers/:id` - delete a provider

4. **`apps/api/src/modules/playground/dto/import-provider.dto.ts`** (new file)
   - `ImportProviderDto`: name, openApiJson, origin (HTTPS server origin), apiKey
   - `RenameProviderDto`: new name/label

### Frontend (Web)

5. **`apps/web/src/lib/api.ts`**
   - Updated `PlaygroundProvider` type from `"fluxa" | "crowdpay"` to `"fluxa" | "crowdpay" | "custom"`
   - This automatically updates `PlaygroundApiKey`, `PlaygroundProxyRequest`, `savePlaygroundApiKey()`, `listPlaygroundApiKeys()`, and `fetchPlaygroundSpec()` to support custom providers

## Acceptance Criteria

- ✅ Users can create, rename, and delete private custom providers and associate encrypted API keys with them
- ✅ Invalid or non-OpenAPI documents are rejected before persistence (validates `paths` object exists)
- ✅ Proxy paths remain relative and every initial request and redirect is restricted to the provider's exact validated origin (via existing `assertRelativePath` and `assertSafeDestination` in `ssrf-guard.ts`)
- ✅ Endpoint browsing, request building, history, and response diffing work for custom providers (inherited from existing infrastructure)
- ✅ Cross-user provider/key access is restricted (ForbiddenException thrown for other users' keys)
- ✅ SSRF/redirect cases are protected by existing SSRF guard logic

## Testing
- Existing `playground.service.spec.ts` SSRF protection tests continue to pass (Fluxa/CrowdPay providers)
- New provider operations tested manually via API requests
- SSRF guard tests verify relative path validation and origin restriction

## Merge Notes
- Clean automatic merge into main branch
- No conflicts with existing code
- All existing functionality preserved
- New `CUSTOM` enum value is backward-compatible (existing Fluxa/CrowdPay providers unchanged)