# Reproduction and troubleshooting

Use the existing checkout. Cloud tasks already have isolated workspaces; do not
create another worktree for this workflow unless explicitly requested.

## Standard environment

Use Node 24 and the `packageManager` pin (pnpm 11.25.0). All dependencies and the
Playwright browser revision are locked. On Ubuntu 24.04:

```sh
cd /path/to/mv3-testkit
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm typecheck
pnpm test:unit
pnpm test:e2e
pnpm test:repeat
```

Required acceptance: eight unit tests and all three browser checks pass; five
repetitions must execute all fifteen browser tests without retries. These are
required checks, not recorded successes until actually run. CI is configured for
this workflow but its result must be checked on GitHub after a PR is created.

The negative project deliberately fails. Verify both exit status and evidence:

```sh
set +e
POC_OUTPUT_DIR=artifacts/negative pnpm test:negative > negative-control.log 2>&1
result=$?
set -e
cat negative-control.log
test "$result" -eq 1
node scripts/check-negative.mjs artifacts/negative
```

Never interpret a browser launch error as successful bug detection. Use a fresh
negative output directory produced by the command immediately before the checker.
No tests are skipped, annotated as expected failures, or retried to get a pass.

## Restricted cloud machine used for this report

The user's home directory is read-only inside the agent sandbox. Use writable
cache locations without changing `HOME` or disabling verification:

```sh
export PNPM_HOME=/workspace/.cache/pnpm
export XDG_DATA_HOME=/workspace/.cache/share
export XDG_CACHE_HOME=/workspace/.cache/cache
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright
cd /workspace/mv3-testkit
pnpm install --frozen-lockfile --store-dir /workspace/.cache/pnpm/store
pnpm browser:install
pnpm test
```

All browser commands must inherit the same `PLAYWRIGHT_BROWSERS_PATH` used for
installation. If system libraries are missing, install official distro dependencies
with the managed package installer, then retry the affected launch; do not bypass
package signatures or TLS verification.

Current external prerequisites:

- Permit `cdn.playwright.dev` for the pinned Chromium download. The installer may
  report further official redirect hosts; permit only hosts actually required.
- Permit `api.github.com` for GitHub API operations and PR creation. Git HTTPS
  read access works through the supplied platform proxy and is separate from API
  access. A CLI authentication-status warning does not establish a missing token.
- The environment draft-read API currently returns `INVALID_ARGUMENT` / "The
  current environment draft could not be verified." No unknown allowlist was replaced.

After the network settings change, retry browser installation, then all required
checks. Do not use `/usr/bin/chromium` as a substitute for the bundled-browser gate:
this cloud image has managed `ExtensionInstallBlocklist: ["*"]` and rejected the
fixtures. Do not modify platform browser policies. No extra secret is needed for
the tests. PR API authorization must be tested through the existing GitHub binding
after the network denial is resolved; no token value should be supplied in chat.

Optional manual investigation: `HEADED=1 pnpm test:e2e` on a desktop-enabled host.
This has not been verified here and is not a replacement for the headless gate.
