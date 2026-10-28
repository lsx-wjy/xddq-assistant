import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('protocol upgrade audit accepts a compact-object baseline', () => {
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xddq-protocol-audit-'));
    try {
        const result = spawnSync(process.execPath, [
            'scripts/audit-protocol-upgrade.mjs',
            '--baseline', 'src/game/config/grpc',
            '--output', outputDirectory,
        ], {
            cwd: projectRoot,
            encoding: 'utf8',
            timeout: 120_000,
        });
        assert.equal(result.status, 0, result.error?.stack || result.stderr || result.stdout);
        assert.equal(fs.existsSync(path.join(outputDirectory, 'audit.json')), true);
    } finally {
        fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
});
