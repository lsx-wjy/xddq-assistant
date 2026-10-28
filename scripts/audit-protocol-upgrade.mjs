import fs from 'node:fs/promises';
import path from 'node:path';
import protobuf from 'protobufjs';
import ts from 'typescript';
import { ProtobufMgr } from '../src/game/net/ProtobufMgr.js';
import Protocol from '../src/game/net/Protocol.js';
import { iterateProtocolIndex } from './lib/protocol-index.mjs';

const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
    const option = process.argv[i];
    if (!['--baseline', '--output'].includes(option) || !process.argv[i + 1]) {
        throw new Error('Usage: node scripts/audit-protocol-upgrade.mjs [--baseline <old-grpc-directory>] [--output <report-directory>]');
    }
    options[option] = process.argv[i + 1];
}
const oldRoot = path.resolve(options['--baseline'] || 'backups/full-protocol-3.9.00.10492/grpc');
const newRoot = path.resolve('src/game/config/grpc');
const newVersion = JSON.parse(await fs.readFile(path.join(newRoot, 'version.json'), 'utf8'));
const output = path.resolve(options['--output'] || `backups/compatibility-${newVersion.version}.${newVersion.buildID}`);
try {
    await fs.access(path.join(oldRoot, 'version.json'));
} catch {
    throw new Error(`Baseline not found: ${oldRoot}. Supply --baseline pointing to the previous checkout's src/game/config/grpc directory.`);
}
await fs.mkdir(output, { recursive: true });
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const oldCommands = await readJson(path.join(oldRoot, 'json/cmdList.json'));

async function schemas(directory) {
    const messages = new Map(), enums = new Map();
    for (const file of await fs.readdir(directory)) {
        const root = await protobuf.load(path.join(directory, file));
        root.resolveAll();
        function walk(node) {
            // Imported common definitions appear in many roots; compare each qualified type once.
            if (node instanceof protobuf.Type) messages.set(`schema:${node.fullName}`, node);
            if (node instanceof protobuf.Enum) enums.set(`schema:${node.fullName}`, node.values);
            for (const child of Object.values(node.nested || {})) walk(child);
        }
        walk(root);
    }
    return { messages, enums };
}
const old = await schemas(path.join(oldRoot, 'protobuf'));
const current = await schemas(path.join(newRoot, 'protobuf'));
const fields = type => Object.values(type.fields).map(f => ({
    id: f.id, name: f.name, type: f.resolvedType?.fullName || f.type,
    required: f.required, repeated: f.repeated, map: f.map, keyType: f.keyType || null,
    oneof: f.partOf?.name || null, default: String(f.defaultValue),
}));
const changes = [];
for (const [key, type] of current.messages) {
    const prior = old.messages.get(key);
    if (!prior) { changes.push({ key, kind: 'message-added' }); continue; }
    const before = fields(prior), after = fields(type);
    for (const field of after) {
        const previous = before.find(f => f.id === field.id);
        if (!previous) changes.push({ key, kind: field.required ? 'required-field-added' : 'field-added', after: field });
        else if (JSON.stringify(previous) !== JSON.stringify(field)) changes.push({ key, kind: 'field-changed', before: previous, after: field });
    }
    for (const field of before) if (!after.some(f => f.id === field.id)) changes.push({ key, kind: 'field-removed', before: field });
}
for (const key of old.messages.keys()) if (!current.messages.has(key)) changes.push({ key, kind: 'message-removed' });
const enumChanges = [];
for (const [key, values] of old.enums) {
    const after = current.enums.get(key);
    if (JSON.stringify(values) !== JSON.stringify(after)) enumChanges.push({ key, before: values, after });
}

function sample(type, depth = 0, seen = new Set()) {
    const value = {};
    const next = new Set([...seen, type.fullName]);
    for (const f of Object.values(type.fields)) {
        if (depth >= 4 && !f.required) continue;
        let item;
        if (f.resolvedType instanceof protobuf.Type) {
            if (depth >= 32 || next.has(f.resolvedType.fullName)) {
                if (f.required) throw new Error(`recursive required field ${f.fullName}`);
                continue;
            }
            item = sample(f.resolvedType, depth + 1, next);
        } else if (f.resolvedType instanceof protobuf.Enum) item = Object.values(f.resolvedType.values)[0];
        else if (f.type === 'string') item = 'compatibility';
        else if (f.type === 'bytes') item = Uint8Array.from([1, 2, 3]);
        else if (f.type === 'bool') item = true;
        else if (/64$/.test(f.type)) item = protobuf.util.Long.fromString('123456789');
        else item = 1;
        if (f.partOf && f.partOf.oneof.some(name => Object.hasOwn(value, name))) continue;
        value[f.name] = f.map ? { [f.keyType === 'string' ? 'example' : '1']: item } : f.repeated ? [item] : item;
    }
    return value;
}
let roundTrips = 0, crossDecodes = 0;
const codecFailures = [], crossFailures = [];
for (const [key, type] of current.messages) {
    try {
        const value = sample(type);
        const error = type.verify(value);
        if (error) throw new Error(error);
        const bytes = type.encode(value).finish();
        const decoded = type.decode(bytes);
        if (!Buffer.from(type.encode(decoded).finish()).equals(Buffer.from(bytes))) throw new Error('round-trip mismatch');
        roundTrips++;
    } catch (error) { codecFailures.push({ key, error: error.message }); }
    const prior = old.messages.get(key);
    if (prior) {
        try {
            type.decode(prior.encode(sample(prior)).finish());
            prior.decode(type.encode(sample(type)).finish());
            crossDecodes++;
        } catch (error) { crossFailures.push({ key, error: error.message }); }
    }
}

await ProtobufMgr.inst.initialize();
const pm = ProtobufMgr.inst;
const missingRequests = [], missingResponses = [];
for (const [id, cmd] of iterateProtocolIndex(pm.cmdList)) if (cmd.cmMethod && !pm.getMsg(Number(id), true)) missingRequests.push({ id, method: cmd.cmMethod });
for (const [id, cmd] of iterateProtocolIndex(pm.resvCmdList)) if (cmd.smMethod && !pm.getMsg(Number(id), false)) missingResponses.push({ id, method: cmd.smMethod });
const allMappingChanges = [];
for (const [id, before] of iterateProtocolIndex(oldCommands)) {
    if (!before?.cmMethod) continue;
    const after = pm.cmdList[id];
    if (!after || ['cmMethod', 'smMethod', 'smMsgId'].some(k => before[k] !== after[k])) allMappingChanges.push({ id, before, after });
}

const changedMethods = new Set(changes.filter(c => !['message-added', 'field-added'].includes(c.kind)).map(c => c.key.split(':')[1].slice(1)));
const allChangedMethods = new Set(changes.map(c => c.key.split(':')[1].slice(1)));
const affectedSources = [], payloadIssues = [], mappingChanges = [], protocolReferences = new Set();
const scriptPayloadChecks = [];
function literal(node) {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) return -literal(node.operand);
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(p => {
        if (!ts.isPropertyAssignment(p) || ts.isComputedPropertyName(p.name)) throw new Error('dynamic payload');
        return [p.name.text, literal(p.initializer)];
    }));
    throw new Error('dynamic payload');
}
const files = [];
async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory() && !file.includes(`${path.sep}config`)) await walk(file);
        else if (entry.isFile() && file.endsWith('.js') && !file.endsWith('Protocol.js')) files.push(file);
    }
}
await walk('src');
const referencedCalls = [];
for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const refs = new Set([...text.matchAll(/Protocol\.(\w+)/g)].map(m => m[1]));
    for (const name of refs) protocolReferences.add(name);
    function visit(node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'SCRIPT_PAYLOADS') {
            for (const entry of node.initializer.arguments[0].elements) {
                const [name, payload] = literal(entry);
                const type = pm.getMsg(Protocol[name], true);
                scriptPayloadChecks.push({ name, request: type?.fullName, error: type ? type.verify(payload) : 'No request body schema; current runtime blocks this request' });
            }
        }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'sendPbMsg') {
            const first = node.arguments[0]?.getText(source);
            const name = first?.match(/^Protocol\.(\w+)$/)?.[1];
            if (name) {
                const id = Protocol[name], cmd = pm.cmdList[id], type = pm.getMsg(id, true);
                const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                referencedCalls.push({ file, line, name, id, request: cmd?.cmMethod, response: cmd?.smMethod });
                if (!type) payloadIssues.push({ file, line, name, issue: 'missing request type', preExisting: !oldCommands[id]?.cmMethod });
                const arg = node.arguments[1];
                if (type && arg && ts.isObjectLiteralExpression(arg)) {
                    const names = arg.properties.filter(p => p.name && !ts.isComputedPropertyName(p.name)).map(p => p.name.text);
                    for (const field of names) if (!type.fields[field]) payloadIssues.push({ file, line, name, issue: `unknown payload field: ${field}` });
                    if (!arg.properties.some(ts.isSpreadAssignment)) for (const f of Object.values(type.fields)) if (f.required && !names.includes(f.name)) payloadIssues.push({ file, line, name, issue: `missing required payload field: ${f.name}` });
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    for (const name of refs) {
        const id = Protocol[name], cmd = pm.cmdList[id], previous = oldCommands[id];
        if (!cmd) continue;
        const qualify = method => pm.qualifyMethod(method);
        if ([cmd.cmMethod, cmd.smMethod].some(m => allChangedMethods.has(qualify(m)))) affectedSources.push({ file, name, request: cmd.cmMethod, response: cmd.smMethod, potentiallyBreaking: [cmd.cmMethod, cmd.smMethod].some(m => changedMethods.has(qualify(m))) });
        if (previous && ['cmMethod', 'smMethod', 'smMsgId'].some(k => previous[k] !== cmd[k])) mappingChanges.push({ file, name, before: previous, after: cmd });
    }
}
const counts = list => list.reduce((acc, c) => (acc[c.kind] = (acc[c.kind] || 0) + 1, acc), {});
const report = {
    generatedAt: new Date().toISOString(), from: await readJson(path.join(oldRoot, 'version.json')), to: await readJson(path.join(newRoot, 'version.json')),
    summary: { oldMessageDefinitions: old.messages.size, newMessageDefinitions: current.messages.size, changes: counts(changes), enumChanges: enumChanges.length, roundTrips, codecFailures: codecFailures.length, crossDecodes, crossFailures: crossFailures.length, missingRequests: missingRequests.length, missingResponses: missingResponses.length, inspectedSourceFiles: files.length, directSendCalls: referencedCalls.length, payloadIssues: payloadIssues.length, affectedReferences: affectedSources.length, mappingChanges: mappingChanges.length, scriptPayloadChecks: scriptPayloadChecks.length, scriptPayloadIssues: scriptPayloadChecks.filter(c => c.error).length },
    changes, enumChanges, codecFailures, crossFailures, missingRequests, missingResponses, payloadIssues, affectedSources, mappingChanges, allMappingChanges, referencedCalls, scriptPayloadChecks,
    limits: ['Synthetic codec checks do not validate server acceptance or semantic compatibility.', 'Static payload checks only cover direct Protocol.X calls with literal objects; variables, spreads and dynamic requests require manual review.', 'Gameplay actions have not been sent by this audit.'],
};
await fs.writeFile(path.join(output, 'audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary, null, 2));
if (codecFailures.length || crossFailures.length) process.exitCode = 1;
