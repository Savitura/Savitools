# Dependency Review Enforcement

## Overview

SaviTools enforces automated dependency review on all pull requests targeting the `main` branch. This security control ensures that no pull request introduces dependencies with known security vulnerabilities or non-compliant licenses into the codebase.

The enforcement runs as a GitHub Actions workflow in [`.github/workflows/dependency-review.yml`](../.github/workflows/dependency-review.yml) using the official GitHub [`actions/dependency-review-action@v4`](https://github.com/actions/dependency-review-action) and is configured via [`.github/dependency-review-config.yml`](../.github/dependency-review-config.yml).

---

## Policies and Enforcement Gates

### 1. Vulnerability Threshold

- **Gate**: `fail-on-severity: moderate`
- **Behavior**: Any pull request that introduces or updates a dependency with an advisory rating of **Moderate**, **High**, or **Critical** severity will fail the check and block merging.
- **Scope**: Scans both `runtime` and `development` dependencies (`fail-on-scopes: [runtime, development]`).

### 2. License Compliance

SaviTools is licensed under the permissive **MIT License**. To prevent license incompatibility and accidental legal contamination, dependencies with viral copyleft or network-copyleft licenses are strictly denied:

- **Denied Licenses**:
  - `AGPL-1.0-only` / `AGPL-1.0-or-later`
  - `AGPL-3.0-only` / `AGPL-3.0-or-later`
  - `GPL-1.0-only` / `GPL-1.0-or-later`
  - `GPL-2.0-only` / `GPL-2.0-or-later`
  - `GPL-3.0-only` / `GPL-3.0-or-later`
  - `LGPL-2.0-only` / `LGPL-2.0-or-later`
  - `LGPL-2.1-only` / `LGPL-2.1-or-later`
  - `LGPL-3.0-only` / `LGPL-3.0-or-later`
- **Permitted Licenses**: Permissive licenses such as `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, and `ISC`.

### 3. Least Privilege Permissions

The review workflow executes under minimal permissions:

```yaml
permissions:
  contents: read
```

---

## Local Verification

Contributors can validate the dependency review configuration and workspace manifests locally prior to pushing or opening a pull request:

```bash
# Validate dependency review configuration and manifests
npm run review:deps

# Run npm dependency audit
npm audit
```

To run the automated dependency review unit tests:

```bash
npm test -w apps/web -- --runInBand dependency-review
```

---

## Triage & Remediation

When a pull request triggers a dependency review failure:

1. **Locate the Failure**:
   - Open the pull request on GitHub and inspect the **Checks** tab.
   - Click on **Dependency Review Enforcement** to view the detailed table of vulnerable or unlicensed packages.
2. **Remediate Vulnerabilities**:
   - Upgrade the affected dependency to a patched version:
     ```bash
     npm install <package>@<secure-version>
     ```
   - If the vulnerability exists in a transitive dependency, inspect the dependency tree (`npm ls <package>`) and apply an `overrides` block in the root `package.json` if upstream maintainers have not yet bumped their dependency.
3. **Remediate License Violations**:
   - Replace any package carrying a copyleft license (GPL/AGPL) with an alternative distributed under MIT, Apache-2.0, or BSD.
4. **Re-run Local Verification**:
   - Run `npm run review:deps` and ensure all tests pass before updating the PR branch.

---

## Related Documents

- [Security Policy](../SECURITY.md)
- [Architecture Map](architecture-map.md)
