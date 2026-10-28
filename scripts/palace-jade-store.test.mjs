import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createDashboardUserStore } from './dashboard-user-store.mjs'
import PalaceMgr from '../src/game/mgr/PalaceMgr.js'

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xddq-palace-stats-'))
  const databaseFile = path.join(directory, 'stats.sqlite')
  let store = createDashboardUserStore({ databaseFile })
  t.after(() => {
    store.close()
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${databaseFile}${suffix}`, { force: true })
    fs.rmdirSync(directory)
  })
  return {
    get store() { return store },
    restart() {
      store.close()
      store = createDashboardUserStore({ databaseFile })
    },
  }
}

const day = '2026-10-28'
const resources = amount => ({ dailyClaimedJade: amount, dailyClaimedJadeDate: day, dailyClaimedJadeSource: 'palace' })

test('服务重启后恢复仙宫当日总数，新角色进程从恢复值继续累计', t => {
  const db = fixture(t)
  const createManager = () => new PalaceMgr({
    now: () => new Date('2026-10-28T12:00:00Z'),
    initialDailyJade: db.store.loadPalaceDailyJade('role-account', 1, day),
    report: patch => db.store.savePalaceDailyJade('role-account', 1, patch),
    log: () => {},
  })
  createManager().recordReward({ ret: 0, reward: '100000=120' })
  db.restart()
  assert.deepEqual(db.store.loadPalaceDailyJade('role-account', 1, day), resources(120))
  createManager().recordReward({ ret: 0, reward: '100000=30' })
  db.restart()
  assert.equal(db.store.loadPalaceDailyJade('role-account', 1, day).dailyClaimedJade, 150)
})

test('数据库按账号、区服和日期隔离，重复/过期快照不重复加玉或降低总数', t => {
  const db = fixture(t)
  db.store.savePalaceDailyJade('Account-A', 1, resources(120))
  db.store.savePalaceDailyJade('account-a', 1, resources(120))
  db.store.savePalaceDailyJade('account-a', 1, resources(90))
  db.store.savePalaceDailyJade('account-a', 2, resources(30))
  db.store.savePalaceDailyJade('account-b', 1, resources(60))
  assert.equal(db.store.loadPalaceDailyJade('account-a', 1, day).dailyClaimedJade, 120)
  assert.equal(db.store.loadPalaceDailyJade('account-a', 2, day).dailyClaimedJade, 30)
  assert.equal(db.store.loadPalaceDailyJade('account-b', 1, day).dailyClaimedJade, 60)
  assert.equal(db.store.loadPalaceDailyJade('account-a', 1, '2026-10-29').dailyClaimedJade, 0)
  db.store.saveUsers([]) // Saving accounts must not clear independent daily counters.
  db.restart()
  assert.equal(db.store.loadPalaceDailyJade('account-a', 1, day).dailyClaimedJade, 120)
})

test('不持久化旧聚宝盆统计和无效数值', t => {
  const db = fixture(t)
  for (const patch of [
    { ...resources(999), dailyClaimedJadeSource: undefined },
    { ...resources(999), dailyClaimedJadeDate: 'invalid' },
    resources(-1), resources(0.5), resources(Infinity),
  ]) db.store.savePalaceDailyJade('account', 1, patch)
  assert.deepEqual(db.store.loadPalaceDailyJade('account', 1, day), resources(0))
})
