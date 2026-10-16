/**
 * Frontend automated test runner.
 * Runs Vitest if installed in node_modules, otherwise runs the Node automated test suite.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, '..');

const vitestBin = path.join(FRONTEND_ROOT, 'node_modules', '.bin', 'vitest');
if (fs.existsSync(vitestBin)) {
  const res = spawnSync(vitestBin, ['run'], { stdio: 'inherit', cwd: FRONTEND_ROOT });
  process.exit(res.status ?? 0);
}

const testFile = path.join(FRONTEND_ROOT, 'tests', 'frontend.test.mjs');
const res = spawnSync(process.execPath, [testFile], { stdio: 'inherit', cwd: FRONTEND_ROOT });
process.exit(res.status ?? 0);
