import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
    if (!['--apk-root', '--client-script', '--report'].includes(process.argv[i]) || !process.argv[i + 1]) {
        throw new Error('Usage: node scripts/sync-gameplay-catalog.mjs --apk-root <extracted-apk> --client-script <decrypted-script> [--report <directory>]');
    }
    options[process.argv[i]] = process.argv[i + 1];
}
if (!options['--apk-root'] || !options['--client-script']) throw new Error('--apk-root and --client-script are required');
const apk = path.resolve(options['--apk-root']);
const assets = path.join(apk, 'assets/assets');
const readJson = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const manifest = await readJson(path.join(assets, 'project.manifest'));
const version = `${manifest.version}.${manifest.buildID}`;
const protocolVersion = await readJson(path.join(project, 'src/game/config/grpc/version.json'));
if (version !== `${protocolVersion.version}.${protocolVersion.buildID}`) throw new Error('APK and protocol versions differ; synchronize protocol resources first');
const config = await readJson(path.join(assets, 'resources/config.json'));
const source = await fs.readFile(path.resolve(options['--client-script']), 'utf8');
const taxonomyPath = path.join(project, 'web/src/features/activities/activityTaxonomy.ts');
const taxonomy = await fs.readFile(taxonomyPath, 'utf8');
const registry = await readJson(path.join(project, 'src/game/config/grpc/json/activityRegistry.json'));
const catalogPath = path.join(project, 'web/src/features/activities/apkGameplayCatalog.json');
const previous = await readJson(catalogPath).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
});

// Protocol groups are not always named like their client system enum. Keep these
// associations explicit; do not infer an activity ID from a message number.
const systemAliases = {
    ADGiftActivity: 'AD_GIFT', CastSwordActivity: 'CASTSWORD', Destiny: 'FRIENDS',
    DoubleDemonsActivity: 'DOUBLE_DEMONS', DouroActivity: 'DOURO', FairyRabbitActivity: 'FAIRY_RABBIT',
    FanrenActivity: 'FAN_REN', FirstRechargeActivity: 'FIRSTCHARGE', FundsActivity: 'FUND',
    Gift: 'SEND_GIFT', GodIsland: 'IMMORTAL_ISLAND', GoodFortuneActivity: 'GOOD_FORTUNE',
    GreatLuckyActivity: 'HAO_LUCKYDRAW_ACTIVITY', InviteFriends: 'SHARE_FRIEND',
    KuaiShou: 'KUAI_SHOU_DAILY', LiveShowActivity: 'LIVE_SHOW', LuckyDrawActivity: 'LUCKYDRAW_ACTIVITY',
    LuckyRogue: 'LUCK_ROGUE', Mall: 'SHOP', MeiTuanDaily: 'MEITUAN_DAILY',
    MeiTuanSubscribe: 'MEITUAN_SUBSCRIBE', MiniGames: 'MINI_GAME',
    OptionalGiftActivity: 'OPTIONAL_ACTIVITY', PetDreamLandActivityProto: 'PETDREAMLAND',
    PetKernelWake: 'PET_GOD_KERNEL', PlayerChara: 'CHARA', PupilRankActivity: 'PUPIL_RANK',
    PupilRogueBattle: 'PUPIL_ROGUE', RankBattle: 'SCORERANK', RegressionActivity: 'REGRESSION',
    RemoteZombie: 'ZOMBIE', SeaWar: 'CELESTIAL_SEA_WAR', SevenDaysSignInActivity: 'SIGNIN',
    SignInFundActivity: 'SIGN_FUND', SpiritTrialActivity: 'SPIRIT_TRIAL', Stage: 'CHAPTER',
    TextTower: 'TEXT_DEFENSE', WildZoneActivityProto: 'MAN_HUANG',
};
// Recharge is a transport/service group, not the single "元宝商城" entry.
const serviceGroups = new Set(['Recharge']);
const newGroupCategories = {
    BubbleDragon: 'minigame', CardCollect: 'seasonal', Fishing: 'growth',
    LawStone: 'growth', PeakDuel: 'competition', PetsFight: 'competition',
    StoneCommon: 'system', SwitchDraw: 'seasonal', TextTower: 'minigame',
    TopFeastTime: 'social', TreasureStone: 'growth', WorldBid: 'commerce',
};
const supplementalNames = { StoneCommon: '宝石公共数据' };
const supplementalAliases = {
    BubbleDragon: ['灵果寻仙', '泡泡龙'], Fishing: ['灵池垂钓'],
    TopFeastTime: ['问鼎道台'], TextTower: ['文字塔防', '文字塔防联动'],
};

function expandUuid(value) {
    if (value.length !== 22) return value;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = value.slice(0, 2);
    for (let i = 2; i < value.length; i += 2) {
        const left = alphabet.indexOf(value[i]), right = alphabet.indexOf(value[i + 1]);
        if (left < 0 || right < 0) throw new Error('Invalid Cocos UUID');
        result += (left >> 2).toString(16) + (((left & 3) << 2) | (right >> 4)).toString(16) + (right & 15).toString(16);
    }
    return [result.slice(0, 8), result.slice(8, 12), result.slice(12, 16), result.slice(16, 20), result.slice(20)].join('-');
}
async function table(assetName, tableName) {
    const entry = Object.entries(config.paths).find(([, value]) => value[0] === assetName);
    if (!entry) throw new Error(`Missing ${assetName}`);
    const uuid = expandUuid(config.uuids[Number(entry[0])]);
    const raw = await readJson(path.join(assets, 'resources/import', uuid.slice(0, 2), `${uuid}.json`));
    let text = raw?.[5]?.[0]?.[2];
    if (typeof text !== 'string') throw new Error(`Invalid Cocos TextAsset ${assetName}`);
    if (!/^[\s]*[\[{]/.test(text)) {
        const bytes = Buffer.from(text, 'utf8');
        for (let i = 0; i < bytes.length; i++) bytes[i] ^= 1;
        text = bytes.toString('utf8').replace(/^03254/, '');
    }
    const rows = JSON.parse(text)[tableName];
    if (!Array.isArray(rows) || !Array.isArray(rows[1])) throw new Error(`Invalid table ${tableName}`);
    const header = rows[1];
    return rows.slice(2).map(row => Object.fromEntries(header.map((name, i) => [name, row[i]])));
}
const language = new Map((await table('cn/zh_cn/json/LanguageWordDB', 'LanguageWordDB')).map(row => [row.id, row.zh_cn]));
const systems = new Map((await table('cn/json/SystemInfoDB', 'SystemInfoDB')).map(row => [row.id, row]));
const enumEnd = source.indexOf('systemOpenId ||');
const enumStart = source.lastIndexOf('(function(t) {', enumEnd);
if (enumEnd < 0 || enumStart < 0) throw new Error('Missing systemOpenId enum');
const enumValues = [...source.slice(enumStart, enumEnd).matchAll(/t\[t\.([\w$]+) = (\d+)\] =/g)].map(m => [m[1], Number(m[2])]);
const normalize = text => text.replace(/_/g, '').toUpperCase();
const enumByName = new Map(enumValues.map(([key, id]) => [normalize(key), { key, id }]));
const fallbackMatch = taxonomy.match(/(?:export )?const (?:fallbackDisplayNames|displayNames):[^=]+?= (\{[\s\S]*?\n\})/);
const categoryMatch = taxonomy.match(/const namesByCategory:[^=]+?= (\{[\s\S]*?\n\})/);
if (!fallbackMatch || !categoryMatch) throw new Error('Cannot read explicit taxonomy definitions');
// Only evaluate the repository's own static object literals, never client code.
const fallbackNames = new Function(`return (${fallbackMatch[1]});`)();
const categories = new Function(`return (${categoryMatch[1]});`)();
const categoryByName = new Map(Object.entries(categories).flatMap(([category, names]) => names.map(name => [name, category])));
const oldCategory = name => previous?.entries[name]?.category || (name.startsWith('Union') ? 'union' : categoryByName.get(name) || 'other');
const oldName = name => previous?.entries[name]?.displayName || fallbackNames[name] || name.replace(/([a-z])([A-Z])/g, '$1 $2');
const entries = {};
const changes = [];
for (const group of registry) {
    const name = group.name;
    const system = serviceGroups.has(name) ? null : enumByName.get(normalize(systemAliases[name] || name));
    const row = system && systems.get(system.id);
    const clientName = row && language.get(row.name)?.trim();
    const displayName = clientName || supplementalNames[name] || fallbackNames[name];
    if (!displayName) throw new Error(`No explicit display name for ${name}`);
    const category = newGroupCategories[name] || (name.startsWith('Union') ? 'union' : categoryByName.get(name));
    if (!category || category === 'other') throw new Error(`No explicit category for ${name}`);
    const variants = row ? [...language].filter(([key]) => key.startsWith(`${row.name}_`)).map(([, label]) => label) : [];
    entries[name] = {
        displayName, category,
        aliases: [...new Set([oldName(name), ...(previous?.entries[name]?.aliases || []), ...(supplementalAliases[name] || []), ...variants])].filter(label => label && label !== displayName),
        nameSource: clientName ? 'apk-system-name' : 'project-description',
        ...(clientName ? { systemId: system.id, systemKey: system.key, languageKey: row.name } : {}),
    };
    if (displayName !== oldName(name) || category !== oldCategory(name)) changes.push({
        group: name, beforeName: oldName(name), afterName: displayName,
        beforeCategory: oldCategory(name), afterCategory: category,
        systemId: entries[name].systemId, nameSource: entries[name].nameSource,
        protocols: group.protocols.length,
    });
}
const catalog = { version, source: 'APK GlobalEnumConfig.systemOpenId + SystemInfoDB + LanguageWordDB; categories are project-defined', entries };
const count = get => registry.reduce((result, group) => {
    const category = get(group.name); result[category] = (result[category] || 0) + 1; return result;
}, {});
const report = {
    version, baseline: 'Local gameplay-center names and categories before this synchronization',
    groupCount: registry.length, protocolConstants: protocolVersion.protocolCount,
    protocolMappingChanges: 0,
    sourceNames: Object.values(entries).filter(entry => entry.nameSource === 'apk-system-name').length,
    projectDescriptions: Object.values(entries).filter(entry => entry.nameSource === 'project-description').length,
    renamed: changes.filter(change => change.beforeName !== change.afterName).length,
    recategorized: changes.filter(change => change.beforeCategory !== change.afterCategory).length,
    beforeCategories: count(oldCategory), afterCategories: count(name => entries[name].category), changes,
    notes: ['Only names/categories/search aliases are changed; protocol payloads, IDs and permissions are unchanged.', 'These are APK default names; live activity themes and availability still require server data.', 'StoneCommon is shared data, not a standalone playable activity.'],
};
const reportDir = path.resolve(options['--report'] || path.join(project, 'backups', `gameplay-catalog-${version}`));
await fs.mkdir(reportDir, { recursive: true });
await fs.writeFile(path.join(reportDir, 'catalog-before.json'), JSON.stringify(previous || { entries: Object.fromEntries(registry.map(g => [g.name, { displayName: oldName(g.name), category: oldCategory(g.name) }])) }, null, 2) + '\n');
await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
await fs.writeFile(path.join(reportDir, 'differences.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, changes: `${changes.length} entries; see ${path.join(reportDir, 'differences.json')}` }, null, 2));
