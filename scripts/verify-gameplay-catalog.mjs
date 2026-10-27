import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

const registry = JSON.parse(await fs.readFile('src/game/config/grpc/json/activityRegistry.json', 'utf8'));
const catalog = JSON.parse(await fs.readFile('web/src/features/activities/apkGameplayCatalog.json', 'utf8'));
const version = JSON.parse(await fs.readFile('src/game/config/grpc/version.json', 'utf8'));
const source = (await fs.readFile('web/src/features/activities/activityTaxonomy.ts', 'utf8'))
    .replace("import apkGameplayCatalog from './apkGameplayCatalog.json'", `const apkGameplayCatalog = ${JSON.stringify(catalog)}`);
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { categoryFor, displayNameFor, searchAliasesFor, gameplayCategories } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
assert.equal(catalog.version, `${version.version}.${version.buildID}`);
assert.deepEqual(Object.keys(catalog.entries).sort(), registry.map(entry => entry.name).sort());
const categories = new Set(gameplayCategories.map(item => item.id));
for (const group of registry) {
    const entry = catalog.entries[group.name];
    assert.ok(categories.has(categoryFor(group.name)), `Invalid category: ${group.name}`);
    assert.notEqual(categoryFor(group.name), 'other', `Unclassified group: ${group.name}`);
    assert.ok(displayNameFor(group.name).trim(), `Empty name: ${group.name}`);
    if (entry.nameSource === 'apk-system-name') {
        assert.ok(Number.isInteger(entry.systemId));
        assert.ok(entry.languageKey && entry.systemKey);
    }
}
assert.equal(displayNameFor('Tyloo'), '神墟禁地');
assert.equal(displayNameFor('Tower'), '镇妖塔');
assert.equal(displayNameFor('SecretTower'), '六道秘境');
assert.equal(displayNameFor('AskWay'), '问道盛会');
assert.equal(displayNameFor('RankBattle'), '斗法');
assert.equal(categoryFor('Fishing'), 'growth');
assert.equal(categoryFor('StoneCommon'), 'system');
assert.equal(categoryFor('WorldBid'), 'commerce');
assert.ok(searchAliasesFor('Tyloo').includes('妖盟秘境探索'));
assert.ok(searchAliasesFor('Fishing').includes('灵池垂钓'));
assert.ok(searchAliasesFor('BubbleDragon').includes('灵果寻仙'));
assert.equal(categoryFor('FutureUnknownGroup'), 'other');
assert.equal(displayNameFor('FutureUnknownGroup'), 'Future Unknown Group');
console.log(`玩法目录验证通过：${registry.length} 个分组有明确名称和分类，版本、关键名称及旧名称检索别名一致。`);
