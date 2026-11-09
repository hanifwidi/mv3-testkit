# Phase 3 security review

This is a bounded engineering review, not a penetration test, third-party audit
or guarantee that arbitrary extension/test code is safe.

Reviewed boundaries:

- CLI arguments are parsed as data and passed via a subprocess argument array;
  no shell interpolation. Executable Playwright configs and extension code remain
  explicitly trusted inputs.
- Init preflights JSON and entry files, checks its full write plan, rejects
  existing targets/internal directory symlinks, and uses exclusive file creation.
  Rollback removes only unchanged files it created. This is not a filesystem
  transaction against an adversarial concurrent writer.
- Test runs use fresh report directories. JSON/HTML files cannot overwrite a
  prior report. The parent checks matching run identity and both files before
  accepting a runner's zero exit.
- Report output uses a field allowlist, omits raw payloads by default, redacts
  common secret labels/URLs and escapes HTML. A sensitive assignment removes the
  rest of that metadata line, including Bearer/Basic credentials, cookie lists
  and multiword values; over-redaction is intentional. Heuristic redaction is not a promise
  that user-chosen names contain no secrets. Raw terminal/Playwright artifacts
  require a separate human review before sharing.
- Existing isolated browser profiles, extension-local document checks, explicit
  storage keys and no permission/identity injection are retained.
- CI actions remain pinned and jobs retain read-only GitHub permissions. There
  are no publish credentials, telemetry endpoints or remote report uploads in kit code.
- The tarball has a file allowlist and is independently installed in a clean
  consumer. Source tests, `.env`, credentials, caches and repo diagnostic history
  are outside the package allowlist.

Dependency review found `GHSA-g3hv-75wg-m249` in dev-only lint dependencies using
minimatch 10.2.6. The pnpm workspace settings pin patched minimatch 11.0.1; root
Node 24 meets its engine requirement. This intentionally crosses an upstream
major dependency boundary, so lint/build/tests must validate compatibility.
Remove this tooling-only override when upstream lint packages require a patched
release themselves. It is not shipped as a consumer dependency override.

Actual audit, lint, package and browser verification outcomes are recorded in
the phase verification report. An audit's clean snapshot is not proof of absence
of unknown vulnerabilities. License and npm ownership are unresolved public-release
prerequisites; this phase remains a private local alpha.
