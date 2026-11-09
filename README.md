# MV3 TestKit — Phase 0 technical proof of concept

Real-browser research into Manifest V3 service-worker state loss. This is a private,
unreleased TypeScript experiment, not the Phase 1 toolkit or a published package.

**Current result: INCONCLUSIVE / NO-GO for Phase 1.** Unit checks pass, but the
cloud environment blocks the bundled-browser download. System Chromium also
blocks unpacked extensions by policy. See the [actual verification report](docs/verification.md).

Requires Node 24, pnpm 11.25.0, and a Playwright-supported OS. Start in this checkout:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm test
pnpm test:repeat
```

The default suite expects the persistent fixture to produce `PASS` and the broken
fixture to produce `FAIL`. Both detector tests must pass. Every lifecycle verdict
requires an observed CDP stop, running state after a real message, and a new boot
identity. Missing evidence produces `INCONCLUSIVE` and fails the acceptance test.

Run the separate negative control to see an ordinary persistence assertion fail:

```sh
POC_OUTPUT_DIR=artifacts/negative pnpm test:negative
# Expected exit 1 ONLY when the JSON proves the state-loss bug:
node scripts/check-negative.mjs artifacts/negative
```

The second command rejects infrastructure failures; a nonzero runner exit by itself
does not demonstrate detection. Playwright clears the selected output directory
on each run. Preserve reports before reusing that directory. JSON timelines are
attached to tests and written to `<output-directory>/<test>/evidence.json`; HTML
is generated in `playwright-report/`. All reports stay local.

See [lifecycle design and limits](docs/lifecycle.md) and [reproduction/troubleshooting](docs/reproduction.md).
No CLI, public API, npm publishing, natural-idle guarantee, or full MVP is included.
