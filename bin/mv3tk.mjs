#!/usr/bin/env node
// Source checkouts need `pnpm build`; local tarballs already contain dist/.
import { main } from '../dist/cli/index.js';
process.exitCode = await main(process.argv.slice(2));
