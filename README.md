# MV3 TestKit — experimental TypeScript core

Real-browser research into Manifest V3 service-worker state loss. This is a private,
unreleased TypeScript toolkit. The Phase 0 proof is retained alongside the
[Phase 1 engine and local doctor command](docs/phase-1.md).

**Phase 0 technical result: PASS on Ubuntu 24.04 CI.**
The fivefold browser suite and evidence-checked negative control succeeded in
[GitHub Actions](https://github.com/hanifwidi/mv3-testkit/actions/runs/42575203864).
Local cloud browser runs remain INCONCLUSIVE due to network/browser policies.
See the [verification report and evidence limits](docs/verification.md).
Phase 1 has a [separate verification report](docs/phase-1-verification.md).

Requires Node 24, pnpm 11.25.0, and a Playwright-supported OS. Start in this checkout:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm test
pnpm test:repeat
pnpm doctor --extension test-extensions/healthy-counter
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
The local `doctor` CLI and source API are experimental. CLI `init`/`test`, npm
publishing, natural-idle guarantees, and the full MVP remain outside this phase.
