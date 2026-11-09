# Troubleshooting

| Result | Next useful check |
| --- | --- |
| `MV3_CHROMIUM_UNAVAILABLE` | Install the binary for the pinned Playwright version; use the same `PLAYWRIGHT_BROWSERS_PATH` during installation and execution |
| Chromium launch failure | Read terminal errors; verify supported OS and system libraries with the official Playwright installer. "Did not start within …ms" means the bounded launch timed out; raise `launchTimeoutMs` only for a genuinely slow machine |
| Worker discovery timeout | Check manifest worker path and build output, extension permissions/errors, and browser policy; use bundled Chromium |
| `MV3_INIT_EXISTS` | Keep your existing files; initialize another directory or manually adopt the starter pattern |
| Init symlink/path rejection | Use a project directory whose generated-file parents are ordinary directories |
| Test command INCONCLUSIVE | Inspect counts for zero passes, skipped/unrun cases or flaky attempts, and check whether both fresh report files exist |
| Nonzero runner exit | Read the terminal output. The CLI preserves assertion failures, configuration errors and interruptions rather than reporting PASS |
| Missing lifecycle evidence | Inspect the test's explicitly attached phase/CDP evidence; experimental stop/restart may be unsupported |
| Toolbar popup differs from the test | Helpers open the extension document, not the toolbar focus/close lifecycle |
| Debug/headed cannot launch | Use a desktop-enabled supported machine; these modes are not a substitute for headless CI acceptance |

The restricted onboarding cloud instance used for development cannot download
from `cdn.playwright.dev` or access `api.github.com`. GitHub CI can run the pinned
browser. Git HTTPS authentication and API access are separate; do not infer that
another token is needed from an outbound domain denial. Never paste tokens into chat.

Reports do not carry raw error payloads by default. Inspect terminal output locally
and share only the minimum redacted reproduction. Test source/config and extension
code run as trusted code with your user's privileges; report sanitization is not a sandbox.
