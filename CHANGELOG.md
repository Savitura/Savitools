# Changelog

All notable changes to SaviTools are documented in this file.

## [Unreleased]

### Fixed

- **Webhook payload truncation** (#127): truncating a webhook payload no longer
  cuts binary or UTF-8 data at an arbitrary offset. Text is cut between
  characters, base64 and hex values are cut on whole encoded units so the
  retained prefix still decodes, and a JSON payload is shortened into a
  document that still parses. Shortened values carry a `[TRUNCATED]` marker,
  and a `WebhookHistoryEntry` records `payloadTruncated` / `responseBodyEncoding`
  so a truncated event is never stored silently. A truncated response body that
  is not text is stored as base64 instead of being mangled into replacement
  characters. Payloads and bodies within the limit are unchanged.
- **Client-side wallet signing** (#422, #420): `POST /wallet/payment` now accepts
  a client-built, client-signed transaction envelope (`signedXdr`) instead of the
  source secret. The secret key never crosses the network. `StellarTestnetService`
  gained `submitSignedTransaction`, which rejects malformed XDR and unsigned
  envelopes before submitting to Horizon. Server-side `submitPayment` is retained
  only for the sandbox module.
- **SEP-24 timeline redaction** (#412): Stellar secret seeds (`S…`) are now
  redacted value-level, matching the existing JWT redaction.
- **Legacy `src/` debugger library** (#421): the standalone root `src/` SEP-10 /
  SEP-24 debugger library and its out-of-CI `tests/` were removed; the behaviour
  lives in the NestJS `apps/api` modules and is covered by their test suites.
- **Spanish translations** (#429): added the missing keys (StrKey lab, Soroban
  auth-entry inspector) and a locale-completeness guard that fails when any locale
  is missing keys from `en.json`.
