# Changelog

All notable changes to SaviTools are documented in this file.

## [Unreleased]

### Security

- **Workspace export sanitization** (#524): Prevent exported and shared workspaces
  from containing secrets (Stellar secret seeds, private credentials, bearer/JWT tokens)
  or signed transactions and signature payloads.

### Fixed

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
