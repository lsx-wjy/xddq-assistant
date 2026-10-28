import assert from 'node:assert/strict'
import test from 'node:test'

import { mergeProfileSnapshot } from './dashboard-profile.mjs'

test('profile updates merge nested sections without erasing earlier data', () => {
  const initial = mergeProfileSnapshot({}, {
    identity: { nickname: '青云客', roleId: '123', ignored: 'drop-me' },
    progress: { realmsId: 42, fightValue: 987654 },
  }, 1_000)
  const merged = mergeProfileSnapshot(initial, {
    homeland: { energy: 88, freeWorkers: 2, totalWorkers: 5 },
    progress: { fightValue: 1_234_567 },
    resources: { fairyJade: 8_888, dailyClaimedJade: 240, dailyClaimedJadeDate: '2026-10-28' },
  }, 2_000)

  assert.deepEqual(merged.identity, { nickname: '青云客', roleId: '123' })
  assert.deepEqual(merged.progress, { realmsId: 42, fightValue: 1_234_567 })
  assert.deepEqual(merged.homeland, { energy: 88, freeWorkers: 2, totalWorkers: 5 })
  assert.deepEqual(merged.resources, {
    fairyJade: 8_888,
    dailyClaimedJade: 240,
    dailyClaimedJadeDate: '2026-10-28',
  })
  assert.equal(merged.syncedAt, new Date(2_000).toISOString())
})

test('profile updates reject unknown sections and non-finite numeric values', () => {
  const profile = mergeProfileSnapshot({}, {
    rawProtocol: { secret: true },
    tree: { level: Number.NaN, peaches: 16 },
  }, 3_000)

  assert.equal('rawProtocol' in profile, false)
  assert.deepEqual(profile.tree, { peaches: 16 })
})
