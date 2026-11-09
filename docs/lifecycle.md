# Phase 0 lifecycle experiment

The attached MV3 TestKit Blueprint v1.0 is design input. This implementation covers
the technical POC only. Market research, competitor quickstarts, developer
interviews, a production API, general manifest validation, a CLI, and release work
are not claimed complete. No `AGENTS.md` existed in the checkout or its workspace
ancestors when implementation began; the user's engineering rules govern this work.

## Experiment

1. Read the trusted fixture manifest. Create a fresh temporary persistent profile.
2. Launch the pinned Playwright Chromium with exactly one unpacked test extension.
   Remove Playwright's `--disable-extensions` default, preserving other defaults.
3. Discover its worker from `chrome-extension://<dynamic-id>/background.js`.
   The initial Playwright worker event is discovery only, never restart evidence.
4. Open the explicit `probe.html` extension document. Attach CDP to this **page**,
   not the worker execution context. Enable `ServiceWorker` and match its exact URL.
5. Verify counter zero, then send one increment and await the acknowledged value
   one. The healthy fixture acknowledges only after `storage.local.set` completes.
6. Request `ServiceWorker.stopWorker` using the observed version ID. Require its
   `workerVersionUpdated` status to become `stopped`. A successful method return
   alone is insufficient. No heartbeat, worker evaluation, or fixed sleep is used.
7. Send `read` from the extension document. Require a running event for that version,
   a valid reply, and a changed boot identity. Chromium may retain the Playwright
   `Worker` object across restarts; a second Playwright event is not required.
8. Compare counter before/after and record the verdict. Close the context and remove
   the owned temporary profile even on error. No daily-use browser profile is opened.

| Evidence | Verdict |
| --- | --- |
| Stop + running + new boot + preserved counter | PASS |
| Stop + running + new boot + changed counter | FAIL |
| Missing/unsupported transition, unchanged boot, invalid reply, or setup error | INCONCLUSIVE |

`FAIL` here means a demonstrated state-preservation regression. Unsupported CDP
and environmental errors remain `INCONCLUSIVE`; Playwright acceptance tests fail
on that outcome. A failure to obtain a response after stop is inconclusive for
this narrowly scoped state-loss probe, not evidence that the counter was lost.

Each fixture explicitly opts into a random `bootId` created at worker script
evaluation. The harness does not inject scripts, add permissions, or modify an
extension. It records only fixture counters/boot IDs, a single allowlisted storage
key, the test/run IDs, browser version/source, timestamps, and matched worker events.
This is not a general-purpose redaction/reporting system for arbitrary extensions.

## Fixtures and messaging

`healthy-counter` persists the value using `chrome.storage.local`.
`volatile-state-bug` implements the same message contract with a global variable.
The latter must return zero after a genuine worker reboot. Both start at zero in
an isolated profile; no `onInstalled` initialization can mask a persistence defect.
They are serial test fixtures, not a concurrent counter implementation.

A third real-browser check serves a page at `127.0.0.1` on an ephemeral port.
The healthy fixture's content script sends a message in its default isolated world
and writes the response to a DOM attribute. The host test asserts that attribute
and verifies no extension runtime ID is accessible in the website main world.
No public fixture site or external service is required during browser tests.

## Limits and unsupported assumptions

- **CDP is experimental.** This driver must be verified against the pinned binary
  before claiming reliability. It assumes stop/start retains the service-worker
  version ID; an update/new registration is outside this experiment.
- Forced termination is not a simulation of every natural-idle condition. Natural
  idle, browser shutdown/reopen, update/install, alarms, and late listeners are
  untested. No observed-idle fallback has been implemented or claimed.
- The Playwright transport still observes worker targets. This experiment does
  not prove that debugger observation leaves natural idle timing unchanged.
- `probe.html` is an extension document, not a browser toolbar popup. Its messaging
  capability does not prove toolbar-open/close semantics.
- The launcher only supports these trusted fixtures with `background.js` and a
  single loaded extension. It is not the general Phase 1 manifest/discovery engine.
- Linux headless is the intended gate. Windows, macOS, headed mode, other Chromium
  versions, branded browsers, and arbitrary extension builds are unverified.
- Each command has bounded readiness waits; absent transitions never become a
  passing test. The outer runner timeout is a final guard, not a readiness signal.
- `POC_CHROMIUM_PATH` is an explicit exploratory override, recorded in evidence.
  It cannot satisfy the bundled-browser negative-control checker. The evidence
  checkers also require the exact Chromium version pinned by the installed
  Playwright, so a `PLAYWRIGHT_BROWSERS_PATH` holding another build cannot either.

The added diagnostic value over a basic launcher is the evidence gate, changed-boot
check, explicit inconclusive state, and controlled healthy/broken comparison. This
is a design rationale, not a completed competitive advantage study.

References: [Playwright extension testing](https://playwright.dev/docs/chrome-extensions),
[Chrome worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle),
[CDP ServiceWorker](https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker/).
