import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import protobuf from 'protobufjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const currentModule = path.join(projectRoot, 'src/game/net/ProtobufMgr.js');
const hash = value => createHash('sha256').update(value).digest('hex');

function sample(type, depth = 0, ancestors = new Set()) {
    const value = {};
    const next = new Set([...ancestors, type.fullName]);
    for (const field of type.fieldsArray) {
        if (depth >= 4 && !field.required) continue;
        if (field.partOf?.oneof.some(name => Object.hasOwn(value, name))) continue;
        let item;
        if (field.resolvedType instanceof protobuf.Type) {
            if (depth >= 32 || next.has(field.resolvedType.fullName)) {
                assert.ok(!field.required, `recursive required field: ${field.fullName}`);
                continue;
            }
            item = sample(field.resolvedType, depth + 1, next);
        } else if (field.resolvedType instanceof protobuf.Enum) {
            item = Object.values(field.resolvedType.values)[0];
        } else if (field.type === 'string') item = 'loader-compatibility';
        else if (field.type === 'bytes') item = Uint8Array.from([1, 2, 3]);
        else if (field.type === 'bool') item = true;
        else if (/64$/.test(field.type)) item = protobuf.util.Long.fromString('9007199254740993');
        else item = 1;
        value[field.name] = field.map
            ? { [field.keyType === 'string' ? 'example' : field.keyType === 'bool' ? 'true' : '1']: item }
            : field.repeated ? [item] : item;
    }
    return value;
}

async function snapshot(modulePath, singleRoot) {
    const { ProtobufMgr } = await import(pathToFileURL(modulePath).href);
    const manager = new ProtobufMgr();
    manager.basePath = path.join(projectRoot, 'src/game/config/grpc/json');
    manager.protoPath = path.join(projectRoot, 'src/game/config/grpc/protobuf');
    if (singleRoot) {
        const basePath = manager.basePath;
        manager.basePath = path.join(basePath, '__missing_loader_test__');
        await assert.rejects(manager.initialize(), { code: 'ENOENT' });
        assert.equal(manager.initialized, false);
        assert.equal(manager.initializationPromise, null);
        manager.basePath = basePath;
    }
    const started = performance.now();
    if (singleRoot) {
        const loadedRoots = new Set();
        const originalLoad = protobuf.Root.prototype.load;
        protobuf.Root.prototype.load = function (...args) {
            loadedRoots.add(this);
            return originalLoad.apply(this, args);
        };
        try {
            await Promise.all(Array.from({ length: 4 }, () => manager.initialize()));
            assert.equal(loadedRoots.size, 1, 'Concurrent initialization must load schemas once');
        } finally {
            protobuf.Root.prototype.load = originalLoad;
        }
    } else await manager.initialize();
    const seconds = (performance.now() - started) / 1000;
    const roots = new Set(Object.values(manager.messages).map(type => type.root));
    if (singleRoot) assert.equal(roots.size, 1, 'All mapped messages must share one schema root');
    const firstType = Object.values(manager.messages)[0];
    await manager.initialize();
    assert.equal(Object.values(manager.messages)[0], firstType, 'Repeated initialization must preserve types');
    global.gc?.();
    const memory = process.memoryUsage();

    // Include referenced nested types and enum definitions, not only top-level command schemas.
    const definitions = {};
    function visit(type) {
        if (Object.hasOwn(definitions, type.fullName)) return;
        definitions[type.fullName] = hash(JSON.stringify(type.toJSON()));
        for (const field of type.fieldsArray || []) if (field.resolvedType) visit(field.resolvedType);
    }
    const messages = {};
    for (const [name, type] of Object.entries(manager.messages).sort(([a], [b]) => a.localeCompare(b))) {
        visit(type);
        const value = sample(type);
        assert.equal(type.verify(value), null, name);
        const encoded = type.encode(value).finish();
        const decoded = type.decode(encoded);
        assert.deepEqual(type.encode(decoded).finish(), encoded, name);
        messages[name] = {
            type: type.fullName,
            encoded: hash(encoded),
            decoded: hash(JSON.stringify(type.toObject(decoded, { longs: String, bytes: String }))),
        };
    }
    function mappings(commands, request) {
        return Object.fromEntries(Object.entries(commands).filter(([, command]) => command).map(([id, command]) => {
            const candidates = manager.getMsgCandidates(Number(id), request);
            const methods = candidates.map(({ method, type }) => [method, type.fullName]);
            for (const { method, type } of candidates) {
                assert.equal(manager.getMsg(Number(id), request, method), type, `Preferred method: ${id}/${method}`);
            }
            return [id, { command, methods }];
        }));
    }
    global.gc?.();
    const afterCodecs = process.memoryUsage();
    return {
        stats: {
            roots: roots.size, messages: Object.keys(messages).length,
            definitions: Object.keys(definitions).length,
            rssMiB: +(memory.rss / 1048576).toFixed(1), heapMiB: +(memory.heapUsed / 1048576).toFixed(1),
            loadSeconds: +seconds.toFixed(2), codecRssMiB: +(afterCodecs.rss / 1048576).toFixed(1),
        },
        behavior: {
            definitions, messages,
            requests: mappings(manager.cmdList, true), responses: mappings(manager.resvCmdList, false),
            missingMessageTypes: [...manager.missingMessageTypes].sort(),
            missingByteDecoders: [...manager.missingByteDecoders].sort(),
        },
    };
}

const args = process.argv.slice(2);
if (args[0] === '--snapshot') {
    const result = await snapshot(path.resolve(args[1]), args[3] === 'shared');
    await fs.writeFile(args[2], JSON.stringify(result));
    console.log(JSON.stringify(result.stats));
} else {
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
        if (!['--baseline', '--output'].includes(args[i]) || !args[i + 1]) {
            throw new Error('Usage: node scripts/verify-protobuf-loader.mjs [--baseline <old-ProtobufMgr.js> --output <report-directory>]');
        }
        options[args[i]] = path.resolve(args[i + 1]);
    }
    if (options['--baseline']) {
        assert.ok(options['--output'], '--output is required with --baseline');
        await fs.mkdir(options['--output'], { recursive: true });
        const results = {};
        // Separate sequential processes keep the baseline heap from affecting the optimized measurement.
        for (const [label, modulePath] of [['baseline', options['--baseline']], ['shared', currentModule]]) {
            const output = path.join(options['--output'], `${label}.json`);
            const child = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), '--snapshot', modulePath, output, label], {
                cwd: projectRoot, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 120000,
            });
            assert.equal(child.status, 0, child.error?.message || child.stderr || child.stdout);
            results[label] = JSON.parse(await fs.readFile(output, 'utf8'));
            console.log(`${label}: ${child.stdout.trim()}`);
        }
        const before = results.baseline.behavior;
        const after = results.shared.behavior;
        const changed = Object.keys(before).filter(key => key !== 'missingMessageTypes' && !isDeepStrictEqual(before[key], after[key]));
        assert.equal(changed.join(', '), '', 'Protocol behavior changed in the listed sections');
        // A shared root can resolve stale cross-file diagnostic entries. They are safe only
        // when the baseline already exposed that exact type and all command mappings match.
        const resolvedDiagnostics = before.missingMessageTypes.filter(entry => !after.missingMessageTypes.includes(entry));
        const addedDiagnostics = after.missingMessageTypes.filter(entry => !before.missingMessageTypes.includes(entry));
        assert.equal(addedDiagnostics.length, 0, 'New missing message definitions');
        for (const entry of resolvedDiagnostics) {
            const method = entry.slice(entry.indexOf(':') + 1);
            const qualified = method.startsWith('com.yq.msg.') ? method : `com.yq.msg.${method.includes('.') ? method : `CityMsg.${method}`}`;
            assert.ok(Object.hasOwn(before.messages, qualified), `Unexpected newly resolved type: ${entry}`);
        }
        const report = {
            generatedAt: new Date().toISOString(), nodeVersion: process.version,
            baseline: results.baseline.stats, shared: results.shared.stats,
            behaviorIdentical: true, networkUsed: false,
            resolvedDiagnostics,
            note: 'Offline protocol initialization and synthetic codecs only; excludes live role state and dashboard.',
        };
        await fs.writeFile(path.join(options['--output'], 'comparison.json'), `${JSON.stringify(report, null, 2)}\n`);
        console.log(`✓ ${report.shared.messages} mapped message codecs and all request/response mappings match the baseline.`);
    } else {
        const result = await snapshot(currentModule, true);
        console.log(`✓ Shared loader: ${JSON.stringify(result.stats)}; failure retry and concurrent initialization passed (offline).`);
    }
}
