#!/usr/bin/env node
// Run `pnpm build` first. This local CLI is intentionally not published.
import { main } from '../dist/cli/index.js';
process.exitCode = await main(process.argv.slice(2));
