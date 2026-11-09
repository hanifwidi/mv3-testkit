# Support and release boundaries

| Component | Scope |
| --- | --- |
| Node | 24.x; package engine pin |
| Package manager | pnpm 11.25.0 for development; installed-tarball consumer also tested with npm |
| Playwright | Exact peer 1.65.0 and its bundled Chromium |
| CI platform | Ubuntu 24.04 headless |
| Modules | ESM with TypeScript declarations |
| Build input | One trusted unpacked Manifest V3 extension with a background service worker |
| Lifecycle | Experimental CDP forced stop and observed same-version restart; explicit boot identity |
| Storage | Explicit-key local/session reads in the same extension/profile |
| Popup | Document rendering, not toolbar UX |
| Reports | Offline whitelisted HTML/JSON; raw terminal output is not sanitized |

macOS, Windows, branded Chrome/Edge, other Playwright versions, headed inspector
behavior, natural idle, browser updates and independent production projects are
not verified here. A local tarball is not a public beta or release approval.

The package stays `private: true` with `UNLICENSED` metadata. Public license choice,
package-name/scope ownership, maintainer review, external dogfooding and the full
release gate remain prerequisites for publication. No command in this phase
publishes or merges a PR.


`private: true` prevents npm publication; it is not a confidentiality control.
GitHub source and CI artifacts follow the repository's access settings.
