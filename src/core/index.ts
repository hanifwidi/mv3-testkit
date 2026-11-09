export { inspectExtension, MV3PreflightError, type MV3Manifest } from './manifest.js';
export { launchExtension, type LaunchOptions, type LoadedExtension } from './loader.js';
export { forceWorkerRestart, LifecycleUnverifiedError } from './lifecycle.js';
export { lifecycleVerdict, type Diagnostic, type DiagnosticVerdict, type LifecycleEvidence } from './diagnostics.js';
export { createMV3Test } from './fixtures.js';
export { resolveConfig, loadConfig, MV3ConfigError } from './config.js';
export { doctor, type DoctorReport } from './doctor.js';
export { diagnoseError, MV3RuntimeError } from './errors.js';
