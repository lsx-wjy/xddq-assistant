import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { iterateProtocolIndex } from './lib/protocol-index.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const commandPath = path.join(projectRoot, 'src/game/config/grpc/json/cmdList.json');
const responsePath = path.join(projectRoot, 'src/game/config/grpc/json/resvCmdList.json');

function readIndex(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('protocol index iterator supports legacy arrays without materializing entries', () => {
    const mapping = { cmMethod: 'CityMsg.TestReq' };
    let highestIndexRead = -1;
    const legacyIndex = new Proxy([], {
        get(target, property, receiver) {
            if (property === 'length') return 2_015_402;
            if (typeof property === 'string' && /^\d+$/.test(property)) {
                highestIndexRead = Math.max(highestIndexRead, Number(property));
                return property === '1' ? mapping : null;
            }
            return Reflect.get(target, property, receiver);
        },
        ownKeys() {
            throw new Error('legacy array keys must not be materialized');
        },
    });
    const iterator = iterateProtocolIndex(legacyIndex);

    assert.deepEqual(iterator.next(), { value: ['1', mapping], done: false });
    assert.equal(highestIndexRead, 1, 'iterator must stop scanning when the consumer stops');
});

test('protocol index iterator supports compact objects', () => {
    const inherited = { 2: { cmMethod: 'CityMsg.InheritedReq' } };
    const compactIndex = Object.assign(Object.create(inherited), {
        1: { cmMethod: 'CityMsg.TestReq' },
    });

    assert.deepEqual([...iterateProtocolIndex(compactIndex)], [
        ['1', { cmMethod: 'CityMsg.TestReq' }],
    ]);
});

test('protocol index iterator rejects malformed roots, keys, and mappings', () => {
    assert.throws(() => [...iterateProtocolIndex(null)], /array or object/);
    assert.throws(() => [...iterateProtocolIndex(42)], /array or object/);
    assert.throws(() => [...iterateProtocolIndex({ invalid: {} })], /numeric protocol ID/);
    assert.throws(() => [...iterateProtocolIndex({ 1: null })], /mapping for protocol 1 must be an object/);
    assert.throws(() => [...iterateProtocolIndex([null, 42])], /mapping for protocol 1 must be an object/);
});

test('generated protocol indexes use compact objects instead of sparse arrays', () => {
    const commandIndex = readIndex(commandPath);
    const responseIndex = readIndex(responsePath);

    assert.equal(Array.isArray(commandIndex), false, 'cmdList.json must be an object');
    assert.equal(Array.isArray(responseIndex), false, 'resvCmdList.json must be an object');
    assert.ok(fs.statSync(commandPath).size < 2 * 1024 * 1024, 'cmdList.json must stay below 2 MiB');
    assert.ok(fs.statSync(responsePath).size < 2 * 1024 * 1024, 'resvCmdList.json must stay below 2 MiB');
});

test('protocol sync builds compact indexes without running its CLI entry point', () => {
    const fixture = `
        import { buildMessageIndexes } from './scripts/sync-apk-protocols.mjs';
        const indexes = buildMessageIndexes({
            Login: [{ key: 'S_TEST', comment: 'test', cmMethod: 'TestReq', smMethod: 'TestResp' }],
        }, [['S_TEST', 20001]]);
        console.log(JSON.stringify({
            commandIsArray: Array.isArray(indexes.cmdList),
            responseIsArray: Array.isArray(indexes.resvCmdList),
            command: indexes.cmdList[20001],
            response: indexes.resvCmdList[1],
        }));
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', fixture], {
        cwd: projectRoot,
        encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout.trim());
    assert.equal(output.commandIsArray, false);
    assert.equal(output.responseIsArray, false);
    assert.equal(output.command.cmMethod, 'CityMsg.TestReq');
    assert.equal(output.response.smMethod, 'CityMsg.TestResp');
});

