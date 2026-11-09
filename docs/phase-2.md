# Phase 2 — Observed lifecycle and regression fixtures

This unreleased work extends Phase 1 on `feat/phase-2-lifecycle-fixtures`.
Its review base is `feat/phase-1-core-engine` while PR #2 remains unmerged.
No Phase 3 CLI initialization, publishing, natural-idle implementation or automatic
PR merge is included. See [actual verification](phase-2-verification.md).

## Observed restart

`forceWorkerRestart` retains its explicit `trigger` and `getBootIdentity` callbacks.
The extension must opt into a boot identity; the kit never injects one or changes
permissions. The experimental page-bound CDP driver records:

```text
UNDISCOVERED → STARTING → RUNNING → STOP_REQUESTED
→ STOPPED_OBSERVED → EVENT_TRIGGERED → RUNNING_AGAIN
```

Failures append `INCONCLUSIVE`, preserve partial phases/events in
`LifecycleUnverifiedError.evidence`, and remove the observer listener. A successful
restart followed by CDP detach failure also becomes inconclusive. Concurrent
operation/detach failures retain both causes. `diagnoseError` exposes partial
evidence, including through an aggregate cleanup error.

Each phase records a timestamp and CDP event cursor. The verdict requires an
initial running event, a matching stopped event **after the stop request**, and a
matching running event **after the trigger**. Version IDs must agree; a changed
boot identity is also required. Missing phases, stale events, failed observation,
or unsupported worker replacement never become PASS or a claimed regression.

Evidence includes a random run ID, start time, driver, extension ID and worker URL.
The page-bound wrapper adds the actual browser version. Supply `testId` from the
runner to correlate it with a test. The shape has evolved since Phase 1; callers
should obtain it from the driver rather than constructing boolean-only evidence.
The JSON consistency checks are not authentication of arbitrary supplied reports.

```ts
const evidence = await forceWorkerRestart({
  page, workerURL: extension.workerURL, testId: testInfo.testId,
  trigger: async () => { await sendReadMessage(); },
  getBootIdentity: async () => (await sendReadMessage()).bootId,
});
const diagnostic = lifecycleVerdict(evidence, counterAfter === counterBefore);
```

`lifecycleVerdict` reports `STATE_PRESERVED` / `STATE_LOST`.
`messageRecoveryVerdict` reports `MESSAGE_RECOVERED` / `MESSAGE_NOT_RECOVERED`.
Both return `LIFECYCLE_UNVERIFIED` / INCONCLUSIVE when lifecycle evidence is absent.
An assertion failure is never converted to a passing runner result.

## Playwright extension helpers

The existing per-test `createMV3Test` fixture exposes these helpers on `extension`:

```ts
const popup = await extension.openPopupDocument();
const options = await extension.openOptionsDocument();
const state = await extension.readStorage(options, ['counter']);
const session = await extension.readStorage(options, ['counter'], 'session');
```

- `newExtensionPage(path)` remains available for explicit extension-local documents.
- Popup/options helpers use the inspected manifest; absent entries produce
  `MV3_PAGE_ENTRY_NOT_FOUND`. Options UI takes priority over legacy `options_page`.
- These open **documents**, not the browser toolbar popup or its focus/closing UX.
- Storage reads require declared `storage` permission, explicit nonempty key names,
  a page from the same extension **and browser profile**, and local/session area.
  The document identity is checked again in the evaluated context to reject a
  racing navigation. Reads time out after 10 seconds and retain their error cause.
- The helper does not write data, dump whole storage, attach values to reports or
  keep the worker alive via worker evaluation. Caller-requested reads return raw
  values; callers must avoid logging secrets. Examples attach only fixture-owned
  counters/boot IDs. The kit does not promise universal payload redaction.
- Session storage is tested across a worker restart in one browser context, not
  across closing/reopening the browser.

## Fixtures and acceptance

| Fixture | Expected evidence |
| --- | --- |
| Existing healthy counter | Preserved state after observed stop/restart (existing Phase 0/1 gates) |
| Existing volatile-state bug | State loss after observed restart (existing Phase 0/1 gates) |
| `invalid-manifest` | MV2 rejected by preflight before browser/profile allocation |
| `popup-options` | Actual document rendering and allowlisted local/session storage survive a proven restart |
| `late-listener-bug` | Controlled absent runtime listener after proven cold start produces FAIL; opening the gate restores messaging |

The late-listener fixture deliberately installs `runtime.onMessage` only after
an explicit storage gate opens. A synchronous storage listener remains available
to wake the cold worker, and fixture-owned storage records its boot identity.
The test verifies messaging works in the first boot, closes the gate without
unregistering that already-active listener, then stops and reactivates the worker
with a storage event. Only after proving a new boot does it assert messaging
failure. Reopening the gate and receiving a reply from that same new boot is the
positive control against an infrastructure failure.

This proves a controlled registration gap, **not** a reproduction of every
asynchronous-listener scheduling race or a claim that a runtime message alone
wakes a worker with no registered runtime listener. No fixed sleep or hidden retry
is used. If the lifecycle cannot be proven, the acceptance test fails as
INCONCLUSIVE instead of claiming the intended messaging regression was detected.

## Reproduce

Use the existing checkout; cloud tasks already run in isolated workspaces. Do not
create an extra worktree unless explicitly requested. With pinned Node/pnpm and
Playwright Chromium installed:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:phase2
pnpm exec playwright test --project=phase2 --repeat-each=5
```

The `phase2` project selects three acceptance cases: two browser scenarios and one
preflight control. Five repetitions configure fifteen cases, not fifteen successful
browser launches. Phase 0 and Phase 1 workflows also run on this branch to exercise
the healthy/broken drivers and prior functionality. There are no retries or skips.
`lifecycle-evidence.json` and Playwright attachments retain partial or successful
observations; storage values are attached only by explicit fixture code. Artifacts
are uploaded even on failure. A run must complete before its success is claimed.

Limitations remain: experimental CDP, pinned Linux Chromium, same-version worker
restart only, opt-in boot identity, trusted extension builds, and no natural-idle
fallback. No extra Chrome permission is inserted into user extensions.
