# First-party counter example

A small extension maintained in this repository, used to exercise the installed
local tarball. It is not an independently adopted or production extension.
The popup document increments a persistent counter; its test verifies the UI,
worker restart, storage, and re-rendering. It explicitly supplies a boot identity.

After building the kit, from the repository root:

```sh
node bin/mv3tk.mjs test --config examples/vanilla-mv3/playwright.mv3.config.mjs
```

This opens an extension document, not the toolbar popup. No public site, account,
network permission or production data is used. Natural idle remains untested.
