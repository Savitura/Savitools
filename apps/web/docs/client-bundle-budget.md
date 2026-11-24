# Client bundle size budget

The CI build runs `scripts/check-client-bundle-budget.mjs` after `next build`.
It reads Next.js route manifests, totals emitted JavaScript assets by route,
and reports assets referenced by multiple routes as shared client JavaScript.
Sizes are raw emitted bytes, not compressed transfer sizes.

The check warns above 500 KiB for shared JavaScript or 750 KiB for a route.
It fails above 1 MiB shared or 1.5 MiB for any route. The optional first
argument to the script selects a different Next.js build directory; CI uses
`apps/web/.next`.
