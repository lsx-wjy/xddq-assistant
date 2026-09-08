import Protocol from '../src/game/net/Protocol.js';
import { ProtobufMgr } from '../src/game/net/ProtobufMgr.js';

const importantProtocols = [
    'S_ELIXIR_ENTER_HOME',
    'S_PHARMACY_ENTER',
    'S_PLANES_TRIAL_ENTER',
    'S_UNION_TREASURE_ENTER',
    'S_REBORN_TRIAL_ENTER_ACTIVITY_REQ',
    'S_CHAOS_LAW_ENTER',
    'S_WAR_SEASON_ENTER_ACTIVITY',
    'S_LUCKY_ROGUE_STAGE_ENTER',
];

function sampleScalar(field, depth) {
    if (field.map) return {};
    if (field.repeated) return [];
    if (field.resolvedType?.values) {
        return Object.values(field.resolvedType.values)[0] ?? 0;
    }
    if (field.resolvedType?.fields) {
        return depth >= 8 ? {} : createRequiredSample(field.resolvedType, depth + 1);
    }
    if (field.type === 'string') return '';
    if (field.type === 'bytes') return new Uint8Array();
    if (field.type === 'bool') return false;
    return 0;
}

function createRequiredSample(type, depth = 0) {
    const sample = {};
    for (const field of Object.values(type.fields)) {
        if (field.required) sample[field.name] = sampleScalar(field, depth);
    }
    return sample;
}

await ProtobufMgr.inst.initialize();

const missingRequests = [];
for (let id = 0; id < ProtobufMgr.inst.cmdList.length; id += 1) {
    const command = ProtobufMgr.inst.cmdList[id];
    if (command?.cmMethod && ProtobufMgr.inst.getMsgCandidates(id, true).length === 0) {
        missingRequests.push(`${id}:${command.cmMethod}`);
    }
}

const missingResponses = [];
for (let id = 0; id < ProtobufMgr.inst.resvCmdList.length; id += 1) {
    const command = ProtobufMgr.inst.resvCmdList[id];
    if (command?.smMethod && ProtobufMgr.inst.getMsgCandidates(id, false).length === 0) {
        missingResponses.push(`${id}:${command.smMethod}`);
    }
}

for (const name of importantProtocols) {
    const id = Protocol[name];
    const command = ProtobufMgr.inst.cmdList[id];
    const requestType = ProtobufMgr.inst.getMsg(id, true);
    const responseType = ProtobufMgr.inst.getMsg(command?.smMsgId, false, command?.smMethod);
    if (!command || !requestType || !responseType) {
        throw new Error(`${name}(${id}) 请求或响应映射不完整`);
    }

    const sample = createRequiredSample(requestType);
    const validationError = requestType.verify(sample);
    if (validationError) throw new Error(`${name} 测试消息无效: ${validationError}`);
    const encoded = requestType.encode(sample).finish();
    requestType.decode(encoded);
    console.log(`✓ ${name} ${id} -> ${command.smMsgId} ${command.smMethod}`);
}

console.log(
    `协议验证通过：${Object.keys(ProtobufMgr.inst.messages).length} 个消息类型，` +
    `${ProtobufMgr.inst.activityRegistry.length} 个协议分组。`,
);
if (missingRequests.length || missingResponses.length) {
    console.warn(
        `官方 APK 中有 ${missingRequests.length} 个请求、${missingResponses.length} 个响应只有映射但没有 proto 定义；` +
        '已保留用于识别，运行时会阻止发送。',
    );
}
