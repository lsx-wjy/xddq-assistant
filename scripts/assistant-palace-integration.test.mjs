import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import automationTasks from '../src/game/config/automationTasks.json' with { type: 'json' }
import Protocol from '../src/game/net/Protocol.js'
import MsgRecvMgr from '../src/game/common/MsgRecvMgr.js'
import * as dashboardApi from './dashboard-api.mjs'

const TASK_ID = 'basic.assistant-palace-jade'

test('自动任务目录提供22点仙官赐福仙玉领取', () => {
  const task = automationTasks.find(item => item.id === TASK_ID)
  assert.ok(task)
  assert.equal(task.category, 'benefit')
  assert.equal(task.status, 'ready')
  assert.deepEqual(task.requires, [])
})

test('仙官赐福任务放行奖励协议并启用 Assistant 运行时组', () => {
  assert.equal(typeof dashboardApi.buildInternalRequestIds, 'function')
  assert.equal(typeof dashboardApi.buildRuntimeAccount, 'function')

  const user = {
    account: 'test',
    password: 'secret',
    serverId: 1,
    allowCombat: false,
    allowPurchase: false,
    selectedActivities: [],
    automationSettings: { tasks: { [TASK_ID]: { enabled: true, values: {} } } },
  }
  const runtime = dashboardApi.buildRuntimeAccount(user)

  assert.ok(runtime.activities.internalRequestIds.includes(Protocol.S_ASSISTANT_PALACE_AUTO_REWARD))
  assert.ok(runtime.activities.selectedGroups.includes('Assistant'))
})

test('消息接收器处理仙官赐福状态同步和领取响应', () => {
  assert.equal(typeof MsgRecvMgr.AssistantPalaceAutoInfoSync, 'function')
  assert.equal(typeof MsgRecvMgr.AssistantPalaceAutoRewardResp, 'function')
})

test('角色资料页显示当日领取仙玉数量', async () => {
  const [component, types] = await Promise.all([
    readFile(new URL('../web/src/features/profile/RoleProfilePage.vue', import.meta.url), 'utf8'),
    readFile(new URL('../web/src/features/users/types.ts', import.meta.url), 'utf8'),
  ])
  assert.match(component, /当日领玉/)
  assert.match(component, /dailyClaimedJade/)
  assert.match(types, /dailyClaimedJade\?: number/)
  assert.match(types, /dailyClaimedJadeDate\?: string/)
})
