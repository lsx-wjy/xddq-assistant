import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import AuthService from '../src/services/authService.js'
import Protocol from '../src/game/net/Protocol.js'
import activityRegistry from '../src/game/config/grpc/json/activityRegistry.json' with { type: 'json' }
import automationTasks from '../src/game/config/automationTasks.json' with { type: 'json' }
import {
  canUseProtocolRunner,
  createSessionRegistry,
  scopeUsersForPrincipal,
  userIsAccessible,
  verifyAdminPassword,
} from './dashboard-auth.mjs'
import { mergeProfileSnapshot } from './dashboard-profile.mjs'
import { createDashboardUserStore } from './dashboard-user-store.mjs'

const SERVER_OPTIONS_PATH = '/api/server-options'
const SESSION_PATH = '/api/session'
const SESSION_LOGIN_PATH = '/api/session/login'
const SESSION_LOGOUT_PATH = '/api/session/logout'
const MANAGED_USER_LOGIN_PATH = '/api/users/login'
const USERS_PATH = '/api/users'
const SESSION_COOKIE_NAME = 'xddq_session'
const ADMIN_ACCOUNT = 'admin'
const ADMIN_PASSWORD_HASH = process.env.DASHBOARD_ADMIN_PASSWORD_HASH
  || 'scrypt$4e765f5620f12d4fe1dcb4db05ac5896$9c7ea5964af8a7f3701cf10a798568ae7fbd3f36a3c12c6cf78c76c5ff3627817c9645a5d0d7dbc2e15494f88fdabe128abd99b981fb62fe610746fa5b69faf7'
const MAX_BODY_BYTES = 256 * 1024
const DEFAULT_505_COOLDOWN_MS = 30 * 60 * 1000
const RECONNECT_DELAYS_MS = [30_000, 120_000, 300_000, 900_000, 1_800_000]
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const legacyUsersFile = path.join(projectRoot, 'data', 'dashboard-users.json')
const usersDatabaseFile = path.join(projectRoot, 'data', 'dashboard.sqlite')
const allowedActivities = new Set(activityRegistry.map(entry => entry.name))
const automationTaskIds = new Set(automationTasks.map(task => task.id))
const automationTasksById = new Map(automationTasks.map(task => [task.id, task]))
const protocolsByKey = new Map()
for (const group of activityRegistry) {
  for (const protocol of group.protocols) protocolsByKey.set(protocol.key, { group, protocol })
}
const activityGroupsByName = new Map(activityRegistry.map(group => [group.name, group]))
for (const group of activityRegistry) {
  if (group.protocols.some(protocol => protocol.requestMethod)) automationTaskIds.add(`activity.${group.name}`)
}
const processStates = new Map()
const dashboardSessions = createSessionRegistry()
let userStore

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(payload))
}

function readCookie(request, name) {
  const cookieHeader = String(request.headers.cookie || '')
  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=')
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim())
    } catch {
      return ''
    }
  }
  return ''
}

function setSessionCookie(response, token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1_000))
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`,
  )
}

function clearSessionCookie(response) {
  response.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`)
}

function principalFor(request) {
  return dashboardSessions.resolve(readCookie(request, SESSION_COOKIE_NAME))
}

function requirePrincipal(request) {
  const principal = principalFor(request)
  if (!principal) throw new HttpError(401, '请先登录')
  return principal
}

function requireAdmin(principal) {
  if (principal?.role !== 'admin') throw new HttpError(403, '仅管理员可以执行此操作')
}

function requireUserAccess(principal, userId) {
  if (!userIsAccessible(principal, userId)) throw new HttpError(403, '无权访问其他用户')
}

function isAllowedDashboardOrigin(origin) {
  if (!origin) return true

  try {
    const url = new URL(origin)
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]') return true
    const allowedOrigins = (process.env.DASHBOARD_ALLOWED_ORIGINS || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .map(value => {
        try {
          return new URL(value).origin
        } catch {
          return ''
        }
      })
    return allowedOrigins.includes(url.origin)
  } catch {
    return false
  }
}

async function readJsonBody(request) {
  let size = 0
  const chunks = []

  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, '请求内容过大')
    chunks.push(chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function maskAccount(account) {
  if (account.length <= 4) return `${account.slice(0, 1)}***`
  return `${account.slice(0, 3)}***${account.slice(-4)}`
}

function selectedActivitiesFrom(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(name => typeof name === 'string' && allowedActivities.has(name)))]
}

function normalizeAutomationSettings(value, fallback = {}) {
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
  const inputTasks = candidate?.tasks && typeof candidate.tasks === 'object' && !Array.isArray(candidate.tasks)
    ? candidate.tasks
    : {}
  const legacyChallenge = inputTasks['challenge.secret-realms']
  const sourceTasks = { ...inputTasks }
  if (legacyChallenge && typeof legacyChallenge === 'object' && !Array.isArray(legacyChallenge)) {
    for (const taskId of ['challenge.adventure', 'challenge.demon-tower', 'challenge.true-fire']) {
      if (!sourceTasks[taskId]) sourceTasks[taskId] = legacyChallenge
    }
  }
  const tasks = {}
  for (const [taskId, taskState] of Object.entries(sourceTasks)) {
    if (!automationTaskIds.has(taskId) || !taskState || typeof taskState !== 'object' || Array.isArray(taskState)) continue
    const values = taskState.values && typeof taskState.values === 'object' && !Array.isArray(taskState.values)
      ? taskState.values
      : {}
    tasks[taskId] = {
      enabled: taskState.enabled === true,
      values: Object.fromEntries(Object.entries(values)
        .filter(([, item]) => typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item)))
        .slice(0, 24)),
    }
  }
  return { tasks }
}

function normalizeUser(body, existing = null, sharedIdentity = null) {
  const note = cleanText(body.note, 64)
  const account = cleanText(body.account, 128)
  const password = typeof body.password === 'string' ? body.password.slice(0, 256) : ''
  const serverName = cleanText(body.serverName, 64)
  const serverId = Number(body.serverId)

  if (!note || !account || !serverName || !Number.isInteger(serverId) || serverId <= 0) {
    throw new HttpError(400, '请完整填写用户备注、账号和有效区服')
  }
  if (!existing && !password) throw new HttpError(400, '新增用户必须填写登录密码')

  const now = new Date().toISOString()
  const accountChanged = Boolean(existing && existing.account !== account)
  const roleChanged = Boolean(existing && (accountChanged || existing.serverId !== serverId))
  const clientId = accountChanged
    ? sharedIdentity?.clientId || randomUUID()
    : existing?.clientId || sharedIdentity?.clientId || randomUUID()
  const deviceId = accountChanged
    ? sharedIdentity?.deviceId || `Android-${clientId}`
    : existing?.deviceId || sharedIdentity?.deviceId || `Android-${clientId}`
  return {
    id: existing?.id ?? randomUUID(),
    note,
    account,
    password: password || existing?.password || '',
    serverName,
    serverId,
    autoReconnect: body.autoReconnect === true,
    selectedActivities: selectedActivitiesFrom(body.selectedActivities),
    automationSettings: normalizeAutomationSettings(body.automationSettings, existing?.automationSettings),
    persistSnapshots: body.persistSnapshots === true,
    allowCombat: body.allowCombat === true,
    allowPurchase: body.allowPurchase === true,
    clientId,
    deviceId,
    loginErrorCode: roleChanged ? null : existing?.loginErrorCode ?? null,
    forbiddenEndTime: roleChanged ? null : existing?.forbiddenEndTime ?? null,
    retryBlockedUntil: roleChanged ? null : existing?.retryBlockedUntil ?? null,
    lastLoginError: roleChanged ? '' : existing?.lastLoginError || '',
    lastLoginErrorAt: roleChanged ? null : existing?.lastLoginErrorAt || null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

function getUserStore() {
  if (!userStore) {
    userStore = createDashboardUserStore({
      databaseFile: usersDatabaseFile,
      legacyJsonFile: legacyUsersFile,
    })
  }
  return userStore
}

function loadUsers() {
  const users = getUserStore().loadUsers()
  const identitiesByAccount = new Map()
  let changed = false
  const normalizedUsers = users.map(user => {
    const knownIdentity = identitiesByAccount.get(user.account)
    const clientId = user.clientId || knownIdentity?.clientId || randomUUID()
    const deviceId = user.deviceId || knownIdentity?.deviceId || `Android-${clientId}`
    identitiesByAccount.set(user.account, { clientId, deviceId })
    if (user.clientId && user.deviceId) return user
    changed = true
    return { ...user, clientId, deviceId }
  })
  if (changed) getUserStore().saveUsers(normalizedUsers)
  return normalizedUsers
}

function saveUsers(users) {
  getUserStore().saveUsers(users)
}

function defaultProcessState() {
  return {
    child: null,
    stopping: false,
    pendingStartUser: null,
    connectionState: 'stopped',
    desiredConnected: false,
    everConnected: false,
    lastOnlineAt: null,
    lastError: '',
    restartTimer: null,
    restartAttempt: 0,
    loginErrorCode: null,
    forbiddenEndTime: null,
    retryBlockedUntil: null,
    activityObservations: {},
    profile: {},
    pendingProtocolRequest: null,
    automationRun: {
      status: 'idle', startedAt: null, finishedAt: null, completed: 0, skipped: 0, failed: 0, logs: [],
    },
  }
}

function stateFor(userId) {
  if (!processStates.has(userId)) processStates.set(userId, defaultProcessState())
  return processStates.get(userId)
}

function safeUser(user) {
  const state = stateFor(user.id)
  const selectedActivities = selectedActivitiesFrom(user.selectedActivities)
  const loginErrorCode = state.loginErrorCode ?? user.loginErrorCode ?? null
  const forbiddenEndTime = state.forbiddenEndTime ?? user.forbiddenEndTime ?? null
  const retryBlockedUntil = state.retryBlockedUntil ?? user.retryBlockedUntil ?? null
  const connectionBlocked = Number(retryBlockedUntil) > Date.now()
  const lastError = state.lastError || user.lastLoginError || ''
  const connectionState = state.connectionState === 'stopped' && lastError ? 'error' : state.connectionState
  return {
    id: user.id,
    note: user.note,
    account: user.account,
    accountMasked: maskAccount(user.account),
    hasPassword: Boolean(user.password),
    serverName: user.serverName,
    serverId: user.serverId,
    connectionState,
    desiredConnected: state.desiredConnected,
    lastOnlineAt: state.lastOnlineAt,
    lastError,
    loginErrorCode,
    forbiddenEndTime: forbiddenEndTime ? new Date(Number(forbiddenEndTime)).toISOString() : null,
    retryBlockedUntil: retryBlockedUntil ? new Date(Number(retryBlockedUntil)).toISOString() : null,
    connectionBlocked,
    autoReconnect: user.autoReconnect,
    selectedActivities,
    automationSettings: normalizeAutomationSettings(user.automationSettings),
    taskCount: selectedActivities.length,
    persistSnapshots: user.persistSnapshots,
    allowCombat: user.allowCombat,
    allowPurchase: user.allowPurchase,
    activityObservations: state.activityObservations,
    profile: state.profile,
    automationRun: {
      ...state.automationRun,
      logs: state.automationRun.logs.slice(-120),
    },
    updatedAt: user.updatedAt,
  }
}

function appendAutomationLog(state, level, message) {
  state.automationRun.logs.push({ at: new Date().toISOString(), level, message: cleanText(message, 240) })
  if (state.automationRun.logs.length > 500) state.automationRun.logs.splice(0, state.automationRun.logs.length - 500)
}

function selectedAutomationGroups(user) {
  // 协议玩法只在玩法中心由用户逐项运行，自动任务页不再批量发送协议请求。
  return []
}

function selectedManagedAutomationTasks(user) {
  const tasks = normalizeAutomationSettings(user.automationSettings).tasks
  return Object.entries(tasks)
    .filter(([taskId, taskState]) => !taskId.startsWith('activity.') && taskState.enabled === true)
    .map(([taskId]) => automationTasksById.get(taskId))
    .filter(task => task?.status === 'ready')
    .filter(task => task.requires.every(requirement =>
      requirement === 'combat' ? user.allowCombat : user.allowPurchase,
    ))
}

export function buildInternalRequestIds(automation, user) {
  const enabled = taskId => automation.tasks[taskId]?.enabled === true
  const ids = new Set()
  const add = (taskId, names, allowed = true) => {
    if (!allowed || !enabled(taskId)) return
    for (const name of names) {
      const id = Protocol[name]
      if (Number.isInteger(id)) ids.add(id)
    }
  }
  const addForAny = (taskIds, names, allowed = true) => {
    if (!allowed || !taskIds.some(enabled)) return
    for (const name of names) {
      const id = Protocol[name]
      if (Number.isInteger(id)) ids.add(id)
    }
  }

  addForAny(['basic.chop-tree', 'basic.tree-speedup'], [
    'S_ATTRIBUTE_DREAM_MSG', 'S_ATTRIBUTE_GET_UNDEAL_EQUIPMENT_MSG',
    'S_ATTRIBUTE_GET_SEPARATION_DATAA_MSG_LIST_REQ', 'S_ATTRIBUTE_SWITCH_SEPARATION_REQ',
    'S_ATTRIBUTE_EQUIPMENT_DEAL_MSG', 'S_ATTRIBUTE_DREAM_LV_UP_SPEED_UP',
  ])
  add('basic.destiny-travel', ['S_DESTINY_TRAVEL'])
  addForAny(['basic.vip-month', 'basic.vip-year'], ['S_PRIVILEGE_CARD_RECEIVE_REWARD'])
  add('basic.mail-rewards', ['S_MAIL_GET_ALL_REWARD'])
  add('basic.use-talent-reishi', ['S_TALENT_READ_BOOK'])
  addForAny(['basic.daily-task', 'basic.free-activity-gifts'], [
    'S_ACTIVITY_GET_DATA', 'S_ACTIVITY_GET_CONDITION_REWARD', 'S_ACTIVITY_BUY_MALL_GOODS',
  ])
  add('basic.fortune-share', ['S_ACTIVITY_SHARE', 'S_ACTIVITY_BBS', 'S_ACTIVITY_GAME_CIRCLE'])
  addForAny([
    'basic.claim-all-ads', 'basic.ad-frog', 'cave.ad-spirit', 'cave.ad-magic',
    'cave.ad-magic-treasure', 'cave.ad-pupil', 'cave.ad-gather-energy',
  ], [
    'S_AD_REWARD_GET_REWARD', 'S_SPIRIT_DRAW', 'S_MAGIC_DERIVATION',
    'S_MAGIC_TREASURE_DRAW_REQ', 'S_PUPIL_ENTER', 'S_PUPIL_GET_AD_REWARD',
    'S_GATHER_ENERGY_ENTER_NEW', 'S_GATHER_ENERGY_GET_AD_AWARD',
  ])
  add('cave.palace', ['S_PALACE_ENTER_OUTER', 'S_PALACE_WORSHIP', 'S_PALACE_SEND_GIFT_GET_REWARD'])
  add('basic.assistant-palace-jade', ['S_ASSISTANT_PALACE_AUTO_REWARD'])
  addForAny(['cave.pupil-training', 'cave.pupil-management'], [
    'S_PUPIL_ENTER', 'S_PUPIL_TRAIN', 'S_PUPIL_RECRUIT', 'S_PUPIL_GRADUATE',
  ])
  addForAny(['union.ad-reward', 'union.daily-task-reward', 'union.bargain', 'union.demon-hunt', 'shop.union-purchases'], [
    'S_UNION_ENTER',
  ])
  add('union.daily-task-reward', ['S_UNION_DAILYTASK', 'S_UNION_GETDAILYTASK'])
  add('union.bargain', ['S_CUT_PRICE_BARGAIN'])
  add('union.ad-reward', ['S_WATCH_AD_TASK', 'S_TASK_GET_REWARD'])
  add('union.demon-hunt', [
    'S_UNION_BOSS_ARRAYING', 'S_UNION_BOSS_BATTLE', 'S_UNION_BOSS_RECEIVE_REWARD',
  ], user.allowCombat)
  addForAny(['shop.union-purchases', 'shop.hero-rank-peach'], ['S_MALL_BUY_GOODS'], user.allowPurchase)
  add('challenge.adventure', ['S_STAGE_CHALLENGE'], user.allowCombat)
  add('challenge.demon-tower', [
    'S_TOWER_VIEW_SAVE_SELECT', 'S_TOWER_QUICK_CHANLLENGE', 'S_TOWER_SELECT_BUFF', 'S_TOWER_CHALLENGE',
  ], user.allowCombat)
  add('challenge.true-fire', ['S_SECRETTOWER_FIGHT'], user.allowCombat)
  add('challenge.hero-rank', ['S_HERORANK_GET_FIGHT_LIST', 'S_HERORANK_FIGHT'], user.allowCombat)
  add('challenge.wild-boss', ['S_WILDBOSS_REPEAT'], user.allowCombat)
  add('challenge.duel', ['S_RANK_BATTLE_GET_BATTLE_LIST', 'S_RANK_BATTLE_CHALLENGE'], user.allowCombat)
  addForAny(['homeland.resource-collection', 'homeland.ad-refresh', 'homeland.redeploy-at-22'], [
    'S_HOMELAND_EXPLORE', 'S_HOMELAND_MANAGE', 'S_HOMELAND_ENTER',
    'S_HOMELAND_DISPATCH_WORKER', 'S_HOMELAND_EXPLORE_REFRESH', 'S_HOMELAND_REFRESH_RESOURCE',
  ])
  return [...ids]
}

function applyAutomationConfigToRunningProcess(user) {
  const state = stateFor(user.id)
  if (state.connectionState !== 'running' || !state.child?.connected) {
    throw new HttpError(409, '请先手动连接账号，并等待角色数据同步完成')
  }
  return new Promise((resolve, reject) => {
    state.child.send({ type: 'automation-config', config: buildRuntimeAccount(user) }, error => {
      if (error) reject(new HttpError(502, `无法将任务配置发送至游戏进程：${error.message}`))
      else resolve()
    })
  })
}

async function runAutomationQueue(user) {
  const state = stateFor(user.id)
  const run = state.automationRun
  const groups = selectedAutomationGroups(user)
  const managedTasks = selectedManagedAutomationTasks(user)
  run.status = 'running'
  run.startedAt = new Date().toISOString()
  run.finishedAt = null
  run.completed = 0
  run.skipped = 0
  run.failed = 0
  run.logs = []
  appendAutomationLog(state, 'info', `开始启用 ${managedTasks.length} 个已选择的脚本功能。`)

  try {
    await applyAutomationConfigToRunningProcess(user)
    for (const task of managedTasks) {
      run.completed += 1
      appendAutomationLog(state, 'success', `${task.name}：已启动，等待对应游戏数据后按规则执行`)
    }
    for (const group of groups) {
      appendAutomationLog(state, 'info', `进入玩法：${group.name}`)
      for (const protocol of group.protocols) {
        if (!protocol.requestMethod) {
          run.skipped += 1
          appendAutomationLog(state, 'skip', `${protocol.comment || protocol.key}：仅接收，跳过`)
          continue
        }
        if (protocol.risk === 'combat' && !user.allowCombat) {
          run.skipped += 1
          appendAutomationLog(state, 'skip', `${protocol.comment || protocol.key}：未授权战斗，跳过`)
          continue
        }
        if ((protocol.risk === 'purchase' || protocol.risk === 'transaction') && !user.allowPurchase) {
          run.skipped += 1
          appendAutomationLog(state, 'skip', `${protocol.comment || protocol.key}：未授权购买/交易，跳过`)
          continue
        }
        try {
          await requestProtocol(user, protocol.key, { mode: 'auto' })
          run.completed += 1
          appendAutomationLog(state, 'success', `${protocol.comment || protocol.key}：请求完成`)
        } catch (error) {
          run.failed += 1
          appendAutomationLog(state, 'error', `${protocol.comment || protocol.key}：${error instanceof Error ? error.message : '请求失败'}`)
        }
      }
    }
    run.status = run.failed ? 'failed' : managedTasks.length ? 'active' : 'completed'
    if (run.status === 'active') {
      appendAutomationLog(state, 'success', `配置已应用：${managedTasks.length} 项自动任务持续运行中；关闭任务、账号断开或满足各任务停止条件时才会停止。`)
    } else {
      appendAutomationLog(state, run.status === 'completed' ? 'success' : 'error', `启动完成：已处理 ${run.completed}，跳过 ${run.skipped}，失败 ${run.failed}。`)
    }
  } catch (error) {
    run.failed += 1
    run.status = 'failed'
    appendAutomationLog(state, 'error', `自动任务未能启动：${error instanceof Error ? error.message : '配置发送失败'}`)
  } finally {
    run.finishedAt = run.status === 'active' ? null : new Date().toISOString()
  }
}

export function buildRuntimeAccount(user) {
  const selectedActivities = selectedActivitiesFrom(user.selectedActivities)
  const storedAutomation = normalizeAutomationSettings(user.automationSettings)
  const automation = {
    tasks: Object.fromEntries(Object.entries(storedAutomation.tasks).map(([taskId, taskState]) => {
      const taskDefinition = automationTasksById.get(taskId)
      const allowed = taskDefinition?.requires?.every(requirement =>
        requirement === 'combat' ? user.allowCombat : user.allowPurchase,
      ) ?? true
      return [taskId, { ...taskState, enabled: taskState.enabled && allowed }]
    })),
  }
  const task = taskId => automation.tasks[taskId] || { enabled: false, values: {} }
  const chopTree = task('basic.chop-tree')
  const adventure = task('challenge.adventure')
  const demonTower = task('challenge.demon-tower')
  const trueFire = task('challenge.true-fire')
  const heroRank = task('challenge.hero-rank')
  const homeland = task('homeland.resource-collection')
  const homelandAdRefresh = task('homeland.ad-refresh')
  const homelandRedeploy = task('homeland.redeploy-at-22')
  const numberValue = (source, key, fallback, min, max) => {
    const value = Number(source.values[key])
    return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback
  }
  const booleanValue = (source, key, fallback) => source.values[key] === true
    ? true
    : source.values[key] === false
      ? false
      : fallback
  const resourceRule = (itemId, level, description, isCheck) => ({
    ItemId: itemId,
    minItemLv: level,
    isCheck,
    description,
  })
  const adventureEnabled = user.allowCombat && adventure.enabled
  const demonTowerEnabled = user.allowCombat && demonTower.enabled
  const trueFireEnabled = user.allowCombat && trueFire.enabled
  const homelandEnabled = homeland.enabled || homelandAdRefresh.enabled || homelandRedeploy.enabled
  const hasTask = (...taskIds) => taskIds.some(taskId => task(taskId).enabled)
  const advertisingEnabled = hasTask(
    'basic.claim-all-ads', 'basic.ad-frog', 'cave.ad-spirit', 'cave.ad-magic',
    'cave.ad-magic-treasure', 'cave.ad-pupil', 'cave.ad-gather-energy', 'union.ad-reward',
  )
  const automationGroups = [
    ...(hasTask('basic.chop-tree', 'basic.tree-speedup') ? ['Attribute', 'Bag'] : []),
    ...(hasTask('basic.daily-task', 'basic.free-activity-gifts', 'basic.fortune-share') ? ['ActivityBase'] : []),
    ...(hasTask('basic.destiny-travel') ? ['Destiny'] : []),
    ...(hasTask('basic.vip-month', 'basic.vip-year') ? ['PrivilegeCard'] : []),
    ...(hasTask('basic.mail-rewards') ? ['Mail'] : []),
    ...(hasTask('basic.use-talent-reishi') ? ['Talent'] : []),
    ...(advertisingEnabled ? ['AdReward', 'Spirit', 'Magic', 'MagicTreasure', 'Pupil', 'GatherEnergy', 'Task', 'Union'] : []),
    ...(adventureEnabled ? ['Stage'] : []),
    ...(demonTowerEnabled ? ['Tower'] : []),
    ...(trueFireEnabled ? ['SecretTower'] : []),
    ...(heroRank.enabled && user.allowCombat ? ['HeroRank'] : []),
    ...(homelandEnabled ? ['Homeland'] : []),
    ...(task('challenge.wild-boss').enabled && user.allowCombat ? ['WildBoss'] : []),
    ...(task('challenge.duel').enabled && user.allowCombat ? ['RankBattle'] : []),
    ...(task('cave.palace').enabled ? ['Palace'] : []),
    ...(task('basic.assistant-palace-jade').enabled ? ['Assistant'] : []),
    ...(hasTask('cave.pupil-training', 'cave.pupil-management') ? ['Pupil'] : []),
    ...(hasTask('union.demon-hunt', 'union.bargain', 'union.daily-task-reward', 'shop.union-purchases') ? ['Union'] : []),
    ...(task('union.demon-hunt').enabled && user.allowCombat ? ['UnionBoss'] : []),
    ...(task('union.bargain').enabled ? ['CutPrice'] : []),
    ...(hasTask('shop.union-purchases', 'shop.hero-rank-peach') && user.allowPurchase ? ['Mall'] : []),
  ]
  const runtimeGroups = [...new Set([...selectedActivities, ...automationGroups])]

  return {
    username: user.account,
    password: user.password,
    serverId: user.serverId,
    switch: {
      homeland: homelandEnabled,
      homelandCollection: homeland.enabled,
      homelandAdRefresh: homelandAdRefresh.enabled,
      homelandRedeployAt22: homelandRedeploy.enabled,
      chopTree: chopTree.enabled,
      talent: false,
      herorank: user.allowCombat && heroRank.enabled,
      chapterChallenge: adventureEnabled ? numberValue(adventure, 'rounds', 50, 1, 500) : 0,
      chapterShowResult: adventure.values.showResult === true,
      towerChallenge: demonTowerEnabled ? numberValue(demonTower, 'rounds', 50, 1, 500) : 0,
      towerShowResult: demonTower.values.showResult === true,
      secretTowerChallenge: trueFireEnabled ? numberValue(trueFire, 'rounds', 50, 1, 500) : 0,
      secretTowerShowResult: trueFire.values.showResult === true,
      showResult: booleanValue(chopTree, 'showResult', true),
    },
    rules: [
      resourceRule(100004, numberValue(homeland, 'peachLevel', 3, 1, 5), '仙桃', homeland.enabled),
      resourceRule(100025, numberValue(homeland, 'waterLevel', 5, 1, 5), '净瓶水', homeland.enabled),
      resourceRule(100000, numberValue(homeland, 'jadeLevel', 5, 1, 5), '仙玉', homeland.enabled),
      resourceRule(100003, 5, '灵石', false),
      resourceRule(100029, 5, '琉璃珠', false),
      resourceRule(100044, 5, '天衍令', false),
      resourceRule(100047, 5, '昆仑铁', false),
    ],
    chopTree: {
      stop: {
        num: numberValue(chopTree, 'peachLimit', 10000, 0, 999999999),
        level: numberValue(chopTree, 'levelLimit', 375, 1, 9999),
      },
      showResult: booleanValue(chopTree, 'showResult', true),
      equipment: {
        quality: numberValue(chopTree, 'quality', 11, 1, 34),
        keepHigherPower: booleanValue(chopTree, 'keepHigherPower', true),
        conditionMode: numberValue(chopTree, 'conditionMode', 1, 0, 1),
        attributeGroups: [
          {
            enabled: booleanValue(chopTree, 'attributeGroupOneEnabled', false),
            attack: numberValue(chopTree, 'attributeGroupOneAttack', 0, 0, 10),
            resistance: numberValue(chopTree, 'attributeGroupOneResistance', 0, 0, 16),
          },
          {
            enabled: booleanValue(chopTree, 'attributeGroupTwoEnabled', false),
            attack: numberValue(chopTree, 'attributeGroupTwoAttack', 0, 0, 10),
            resistance: numberValue(chopTree, 'attributeGroupTwoResistance', 0, 0, 16),
          },
        ],
        matchedAction: numberValue(chopTree, 'matchedAction', 1, 1, 2),
        autoEquipTarget: numberValue(chopTree, 'autoEquipTarget', 0, 0, 2),
      },
      autoCost: {
        enabled: booleanValue(chopTree, 'autoCostMultiplierEnabled', false),
        multiplier: numberValue(chopTree, 'autoCostMultiplier', 1, 1, 6),
      },
    },
    activities: {
      enabled: true,
      logDiscovery: false,
      persistSnapshots: user.persistSnapshots,
      selectedGroups: runtimeGroups,
      autoClaim: false,
      autoFreeShop: false,
      allowCombat: user.allowCombat,
      allowPurchase: user.allowPurchase,
      internalRequestIds: buildInternalRequestIds(automation, user),
    },
    automation,
    autoReconnect: user.autoReconnect,
    deviceIdentity: {
      clientId: user.clientId,
      deviceId: user.deviceId,
    },
  }
}

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
}

function clearLoginFailure(user, state) {
  state.loginErrorCode = null
  state.forbiddenEndTime = null
  state.retryBlockedUntil = null
  user.loginErrorCode = null
  user.forbiddenEndTime = null
  user.retryBlockedUntil = null
  user.lastLoginError = ''
  user.lastLoginErrorAt = null
  getUserStore().updateLoginState(user.id, {
    loginErrorCode: null,
    forbiddenEndTime: null,
    retryBlockedUntil: null,
    lastLoginError: '',
    lastLoginErrorAt: null,
  })
}

function inspectProcessLine(user, state, line) {
  const cleanLine = stripAnsi(line)
  if (cleanLine.includes('[WebSocket] 角色数据同步完成')) {
    state.connectionState = 'running'
    state.everConnected = true
    state.lastOnlineAt = new Date().toISOString()
    state.lastError = ''
    state.restartAttempt = 0
    clearLoginFailure(user, state)
    if (selectedManagedAutomationTasks(user).length && state.child?.connected) {
      state.child.send({ type: 'automation-config', config: buildRuntimeAccount(user) }, error => {
        if (error) state.lastError = `无法应用自动任务配置：${error.message}`
      })
    }
    return
  }
  if (cleanLine.includes('[WebSocket] 开始重连') || cleanLine.includes('[WebSocket] 已断开')) {
    state.connectionState = 'reconnecting'
    return
  }
  if (/账号或密码错误|登录失败|游戏登录失败|连接错误/.test(cleanLine)) {
    state.lastError = cleanLine.replace(/^.*?\s{2,}/, '').slice(0, 180)
  }

  const scriptLogMarkers = [
    '[属性管理]', '[青蛙管理]', '[仙友管理]', '[精怪管理]', '[神通管理]',
    '[法宝管理]', '[宗门管理]', '[聚灵阵管理]', '[福地管理]', '[章节管理]',
    '[镇妖塔管理]', '[真火秘境管理]', '[妖王管理]', '[背包管理]',
    '[仙树管理]', '[玩家管理]', '[活动管理]', '[妖盟管理]', '[仙宫管理]',
    '[自定义管理]', '[定时任务]', '[群英榜]', '[装备]', '[砍树]',
  ]
  if (
    state.automationRun.startedAt
    && ['running', 'active', 'completed', 'failed'].includes(state.automationRun.status)
    && scriptLogMarkers.some(marker => cleanLine.includes(marker))
  ) {
    appendAutomationLog(state, /\berror\b|失败|异常/i.test(cleanLine) ? 'error' : 'info', cleanLine)
  }
}

function observeProcessStream(stream, user, state) {
  let buffer = ''
  stream?.on('data', chunk => {
    buffer += chunk.toString('utf8')
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    for (const line of lines) inspectProcessLine(user, state, line)
  })
}

function captureActivityObservation(state, message) {
  const groupName = cleanText(message?.group, 128)
  const protocolKey = cleanText(message?.protocol, 160)
  const method = cleanText(message?.method, 200)
  const msgId = Number(message?.msgId)
  const receivedAt = cleanText(message?.receivedAt, 64) || new Date().toISOString()
  if (!groupName || !protocolKey || !Number.isInteger(msgId)) return

  const currentGroup = state.activityObservations[groupName] || { lastSeenAt: receivedAt, protocols: {} }
  state.activityObservations = {
    ...state.activityObservations,
    [groupName]: {
      lastSeenAt: receivedAt,
      protocols: {
        ...currentGroup.protocols,
        [protocolKey]: { protocol: protocolKey, msgId, method, receivedAt },
      },
    },
  }
}

function settlePendingProtocol(state, message) {
  const pending = state.pendingProtocolRequest
  if (!pending || pending.requestId !== message?.requestId) return
  clearTimeout(pending.timer)
  state.pendingProtocolRequest = null
  pending.resolve({
    ok: message.ok === true,
    protocolKey: pending.protocolKey,
    response: message.response ?? null,
    message: cleanText(message.message, 240),
    error: cleanText(message.error, 500),
  })
}

function rejectPendingProtocol(state, error) {
  const pending = state.pendingProtocolRequest
  if (!pending) return
  clearTimeout(pending.timer)
  state.pendingProtocolRequest = null
  pending.reject(error)
}

function handleRuntimeError(user, state, runtimeError) {
  const code = runtimeError?.code !== null
    && runtimeError?.code !== undefined
    && Number.isFinite(Number(runtimeError.code))
    ? Number(runtimeError.code)
    : null
  const forbiddenEndTime = Number(runtimeError?.forbiddenEndTime) || null
  const isLoginRestriction = code === 505
  const retryBlockedUntil = isLoginRestriction
    ? Math.max(forbiddenEndTime || 0, Date.now() + DEFAULT_505_COOLDOWN_MS)
    : null
  const message = cleanText(runtimeError?.message, 300) || '游戏进程启动失败'
  const errorAt = new Date().toISOString()

  state.lastError = message
  state.loginErrorCode = code
  state.forbiddenEndTime = forbiddenEndTime
  state.retryBlockedUntil = retryBlockedUntil
  state.connectionState = 'error'
  if (runtimeError?.retryable === false || isLoginRestriction) state.desiredConnected = false

  user.loginErrorCode = code
  user.forbiddenEndTime = forbiddenEndTime
  user.retryBlockedUntil = retryBlockedUntil
  user.lastLoginError = message
  user.lastLoginErrorAt = errorAt
  getUserStore().updateLoginState(user.id, {
    loginErrorCode: code,
    forbiddenEndTime,
    retryBlockedUntil,
    lastLoginError: message,
    lastLoginErrorAt: errorAt,
  })
}

function scheduleReconnect(user, state) {
  if (!state.desiredConnected || !user.autoReconnect || !state.everConnected || state.loginErrorCode === 505) return
  const delay = RECONNECT_DELAYS_MS[Math.min(state.restartAttempt, RECONNECT_DELAYS_MS.length - 1)]
  state.restartAttempt += 1
  state.connectionState = 'reconnecting'
  state.restartTimer = setTimeout(() => {
    state.restartTimer = null
    if (state.desiredConnected) startUserProcess(user)
  }, delay)
}

function startUserProcess(user) {
  const state = stateFor(user.id)
  if (state.child) {
    if (state.stopping) {
      state.desiredConnected = true
      state.connectionState = 'connecting'
      state.pendingStartUser = user
    }
    return safeUser(user)
  }

  const blockedUntil = Number(user.retryBlockedUntil)
  if (blockedUntil > Date.now()) {
    const formatted = new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(blockedUntil))
    throw new HttpError(423, `该角色刚刚返回 505，为避免重复触发限制，已暂停连接至 ${formatted}`)
  }

  if (state.restartTimer) {
    clearTimeout(state.restartTimer)
    state.restartTimer = null
  }

  state.loginErrorCode = null
  state.forbiddenEndTime = null
  state.retryBlockedUntil = null

  const encodedConfig = Buffer.from(JSON.stringify(buildRuntimeAccount(user)), 'utf8').toString('base64')
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: projectRoot,
    env: { ...process.env, XDDQ_RUNTIME_ACCOUNT: encodedConfig },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  })

  state.child = child
  state.stopping = false
  state.pendingStartUser = null
  state.desiredConnected = true
  state.connectionState = 'connecting'
  state.lastError = ''
  observeProcessStream(child.stdout, user, state)
  observeProcessStream(child.stderr, user, state)
  child.on('message', message => {
    if (message?.type === 'runtime-error') handleRuntimeError(user, state, message)
    else if (message?.type === 'activity-observation') captureActivityObservation(state, message)
    else if (message?.type === 'profile-update') state.profile = mergeProfileSnapshot(state.profile, message.profile)
    else if (message?.type === 'protocol-request-result') settlePendingProtocol(state, message)
    else if (message?.type === 'scheduled-restart') {
      appendAutomationLog(state, 'info', '定时任务：正在按已选设置重启游戏连接。')
      state.pendingStartUser = user
      state.stopping = true
      child.kill()
    }
  })

  child.on('error', error => {
    state.lastError = error.message
    state.connectionState = 'error'
  })
  child.on('exit', () => {
    if (state.child !== child) return
    state.child = null
    rejectPendingProtocol(state, new HttpError(409, '游戏连接已断开，未收到该功能的响应'))
    state.stopping = false
    if (state.pendingStartUser && state.desiredConnected) {
      const pendingUser = state.pendingStartUser
      state.pendingStartUser = null
      startUserProcess(pendingUser)
      return
    }
    if (!state.desiredConnected && state.loginErrorCode) {
      state.connectionState = 'error'
      return
    }
    if (!state.desiredConnected) {
      state.connectionState = 'stopped'
      return
    }
    if (state.lastError) state.connectionState = 'error'
    else if (!state.everConnected) {
      state.connectionState = 'error'
      state.lastError = '游戏进程未能建立连接'
    }
    scheduleReconnect(user, state)
    if (!state.restartTimer) {
      state.desiredConnected = false
      if (!state.lastError) state.connectionState = 'stopped'
    }
  })

  return safeUser(user)
}

function stopUserProcess(userId) {
  const state = stateFor(userId)
  state.desiredConnected = false
  state.pendingStartUser = null
  if (state.restartTimer) clearTimeout(state.restartTimer)
  state.restartTimer = null
  if (state.child) {
    state.stopping = true
    state.child.kill()
  } else {
    state.stopping = false
  }
  state.connectionState = 'stopped'
  state.lastError = ''
  state.restartAttempt = 0
  state.loginErrorCode = null
  state.forbiddenEndTime = null
  state.retryBlockedUntil = null
  rejectPendingProtocol(state, new HttpError(409, '连接已停止，功能请求已取消'))
}

function requestProtocol(user, protocolKey, options) {
    const state = stateFor(user.id)
    const registryEntry = protocolsByKey.get(protocolKey)
  if (!registryEntry) throw new HttpError(404, '功能协议不存在')
  if (!registryEntry.protocol.requestMethod) {
    throw new HttpError(400, '该功能由服务器主动下发，只能接收，不能手动运行')
  }
  const mode = options?.mode === 'advanced' ? 'advanced' : 'auto'
  const payload = options?.payload ?? {}
  if (mode === 'advanced' && (!payload || typeof payload !== 'object' || Array.isArray(payload))) {
    throw new HttpError(400, '请求参数必须是 JSON 对象')
  }
  if (state.connectionState !== 'running' || !state.child?.connected) {
    throw new HttpError(409, '请先连接账号，并等待角色数据同步完成')
  }
  if (state.pendingProtocolRequest) {
    throw new HttpError(409, `上一条功能 ${state.pendingProtocolRequest.protocolKey} 仍在等待响应`)
  }

  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (state.pendingProtocolRequest?.requestId !== requestId) return
      state.pendingProtocolRequest = null
      reject(new HttpError(504, '请求已发送，但 15 秒内未收到响应'))
    }, 15_000)

    state.pendingProtocolRequest = { requestId, protocolKey, timer, resolve, reject }
    try {
      state.child.send({
        type: 'protocol-request',
        requestId,
        protocolKey,
        msgId: registryEntry.protocol.id,
        mode,
        payload,
      }, error => {
        if (!error || state.pendingProtocolRequest?.requestId !== requestId) return
        rejectPendingProtocol(state, new HttpError(502, `无法向游戏进程发送请求：${error.message}`))
      })
    } catch (error) {
      rejectPendingProtocol(
        state,
        new HttpError(502, error instanceof Error ? error.message : '无法向游戏进程发送请求'),
      )
    }
  })
}

function stopAllUserProcesses() {
  for (const userId of processStates.keys()) stopUserProcess(userId)
}

export function shutdownDashboard() {
  stopAllUserProcesses()
  dashboardSessions.clear()
  userStore?.close()
  userStore = undefined
}

async function listPlatformServers(accountValue, passwordValue) {
  const account = cleanText(accountValue, 128)
  const password = typeof passwordValue === 'string' ? passwordValue : ''
  if (!account || !password) {
    throw new HttpError(400, '请先填写平台账号和登录密码')
  }

  try {
    const { servers } = await new AuthService().List(account, password)
    return servers
      .map(server => ({
        serverId: Number(server.serverId),
        serverName: String(server.serverName || `区服 ${server.serverId}`),
      }))
      .filter(server => Number.isInteger(server.serverId) && server.serverId > 0)
  } catch (error) {
    throw new HttpError(401, error instanceof Error ? error.message : '账号或密码验证失败')
  }
}

async function loginPlatformUser(body) {
  const account = cleanText(body.account, 128)
  const password = typeof body.password === 'string' ? body.password.slice(0, 256) : ''
  const serverId = Number(body.serverId)
  if (!account || !password || !Number.isInteger(serverId) || serverId <= 0) {
    throw new HttpError(400, '请填写账号、密码并选择角色区服')
  }
  if (account.toLocaleLowerCase() === ADMIN_ACCOUNT) {
    throw new HttpError(400, '该账号名称为管理入口保留')
  }

  const servers = await listPlatformServers(account, password)
  const selectedServer = servers.find(server => server.serverId === serverId)
  if (!selectedServer) throw new HttpError(400, '所选角色区服不属于当前账号')

  const users = loadUsers()
  const index = users.findIndex(user => user.account === account && user.serverId === serverId)
  const existing = index >= 0 ? users[index] : null
  const now = new Date().toISOString()
  const user = existing
    ? { ...existing, password, serverName: selectedServer.serverName, updatedAt: now }
    : normalizeUser({
        note: selectedServer.serverName,
        account,
        password,
        serverName: selectedServer.serverName,
        serverId,
        autoReconnect: false,
        selectedActivities: [],
        persistSnapshots: false,
        allowCombat: false,
        allowPurchase: false,
      }, null, users.find(item => item.account === account))

  const nextUsers = [...users]
  if (index >= 0) nextUsers[index] = user
  else nextUsers.push(user)
  saveUsers(nextUsers)
  return user
}

function sessionPayload(principal) {
  if (!principal) return { authenticated: false, role: null, userId: null, displayName: '' }
  if (principal.role === 'admin') {
    return { authenticated: true, role: 'admin', userId: null, displayName: '超级管理员' }
  }
  const user = loadUsers().find(item => item.id === principal.userId)
  if (!user) return { authenticated: false, role: null, userId: null, displayName: '' }
  return {
    authenticated: true,
    role: 'user',
    userId: user.id,
    displayName: user.note,
    user: safeUser(user),
  }
}

async function handleSession(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    sendJson(response, 405, { error: '仅支持 GET 请求' })
    return
  }
  sendJson(response, 200, sessionPayload(principalFor(request)))
}

async function handleSessionLogin(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendJson(response, 405, { error: '仅支持 POST 请求' })
    return
  }
  const body = await readJsonBody(request)
  const account = cleanText(body.account, 128)
  const password = typeof body.password === 'string' ? body.password : ''
  let principal
  let user = null

  if (account.toLocaleLowerCase() === ADMIN_ACCOUNT) {
    if (!verifyAdminPassword(password, ADMIN_PASSWORD_HASH)) throw new HttpError(401, '管理员账号或密码错误')
    principal = { role: 'admin', userId: null }
  } else {
    user = await loginPlatformUser(body)
    principal = { role: 'user', userId: user.id }
  }

  const session = dashboardSessions.create(principal)
  setSessionCookie(response, session.token, session.expiresAt)
  sendJson(response, 200, { ...sessionPayload(principal), user: user ? safeUser(user) : undefined })
}

async function handleSessionLogout(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendJson(response, 405, { error: '仅支持 POST 请求' })
    return
  }
  dashboardSessions.revoke(readCookie(request, SESSION_COOKIE_NAME))
  clearSessionCookie(response)
  sendJson(response, 200, { authenticated: false })
}

async function handleManagedUserLogin(request, response, principal) {
  requireAdmin(principal)
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendJson(response, 405, { error: '仅支持 POST 请求' })
    return
  }
  const user = await loginPlatformUser(await readJsonBody(request))
  sendJson(response, 200, { user: safeUser(user) })
}

async function handleServerOptions(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendJson(response, 405, { error: '仅支持 POST 请求' })
    return
  }
  const body = await readJsonBody(request)
  sendJson(response, 200, { servers: await listPlatformServers(body.account, body.password) })
}

async function handleUsersCollection(request, response, principal) {
  const users = await loadUsers()
  if (request.method === 'GET') {
    sendJson(response, 200, { users: scopeUsersForPrincipal(users, principal).map(safeUser) })
    return
  }
  response.setHeader('Allow', 'GET')
  sendJson(response, 405, { error: '用户只能通过登录验证加入' })
}

async function handleUserItem(request, response, userId, action, principal) {
  requireUserAccess(principal, userId)
  const users = await loadUsers()
  const index = users.findIndex(user => user.id === userId)
  if (index < 0) {
    sendJson(response, 404, { error: '用户不存在' })
    return
  }
  const user = users[index]

  if (action === 'connect' || action === 'disconnect') {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST')
      sendJson(response, 405, { error: '仅支持 POST 请求' })
      return
    }
    if (action === 'connect') startUserProcess(user)
    else stopUserProcess(user.id)
    sendJson(response, 200, { user: safeUser(user) })
    return
  }

  if (request.method !== 'PUT') {
    response.setHeader('Allow', 'PUT')
    sendJson(response, 405, { error: '仅支持 PUT 请求' })
    return
  }

  const body = await readJsonBody(request)
  const nextAccount = cleanText(body.account, 128)
  const sharedIdentity = users.find((item, itemIndex) => itemIndex !== index && item.account === nextAccount)
  const updatedUser = normalizeUser(body, user, sharedIdentity)
  if (users.some((item, itemIndex) => itemIndex !== index && item.account === updatedUser.account && item.serverId === updatedUser.serverId)) {
    sendJson(response, 409, { error: '该账号和区服已经添加' })
    return
  }
  const roleChanged = user.account !== updatedUser.account || user.serverId !== updatedUser.serverId
  stopUserProcess(user.id)
  if (roleChanged) stateFor(user.id).activityObservations = {}
  if (roleChanged) stateFor(user.id).profile = {}
  const nextUsers = [...users]
  nextUsers[index] = updatedUser
  await saveUsers(nextUsers)
  sendJson(response, 200, { user: safeUser(updatedUser) })
}

async function handleProtocolRequest(request, response, userId, protocolKey) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendJson(response, 405, { error: '仅支持 POST 请求' })
    return
  }

  const user = (await loadUsers()).find(item => item.id === userId)
  if (!user) {
    sendJson(response, 404, { error: '用户不存在' })
    return
  }
  const body = await readJsonBody(request)
  const result = await requestProtocol(user, protocolKey, {
    mode: body.mode,
    payload: body.payload,
  })
  sendJson(response, result.ok ? 200 : 422, result)
}

async function handleAutomationSettings(request, response, userId) {
  if (request.method !== 'PUT') {
    response.setHeader('Allow', 'PUT')
    sendJson(response, 405, { error: '仅支持 PUT 请求' })
    return
  }
  const users = await loadUsers()
  const index = users.findIndex(user => user.id === userId)
  if (index < 0) {
    sendJson(response, 404, { error: '用户不存在' })
    return
  }
  const body = await readJsonBody(request)
  const user = { ...users[index], automationSettings: normalizeAutomationSettings(body.automationSettings), updatedAt: new Date().toISOString() }
  const nextUsers = [...users]
  nextUsers[index] = user
  saveUsers(nextUsers)
  sendJson(response, 200, { user: safeUser(user) })
}

async function handleAutomationRun(request, response, userId) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendJson(response, 405, { error: '仅支持 POST 请求' })
    return
  }
  const user = (await loadUsers()).find(item => item.id === userId)
  if (!user) throw new HttpError(404, '用户不存在')
  const state = stateFor(user.id)
  if (state.connectionState !== 'running' || !state.child?.connected) {
    throw new HttpError(409, '请先手动连接账号，并等待角色数据同步完成')
  }
  if (state.automationRun.status === 'running') throw new HttpError(409, '已有自动任务队列正在运行')
  const groups = selectedAutomationGroups(user)
  const managedTasks = selectedManagedAutomationTasks(user)
  if (!groups.length && !managedTasks.length) throw new HttpError(400, '请先勾选至少一个可运行任务')
  state.automationRun.status = 'running'
  void runAutomationQueue(user)
  sendJson(response, 202, { user: safeUser(user) })
}

export async function handleDashboardApi(request, response, pathname) {
  if (!isAllowedDashboardOrigin(request.headers.origin)) {
    sendJson(response, 403, { error: '页面访问来源不在允许名单中' })
    return
  }
  if (pathname === SESSION_PATH) {
    await handleSession(request, response)
    return
  }
  if (pathname === SESSION_LOGIN_PATH) {
    await handleSessionLogin(request, response)
    return
  }
  if (pathname === SESSION_LOGOUT_PATH) {
    await handleSessionLogout(request, response)
    return
  }
  if (pathname === SERVER_OPTIONS_PATH) {
    await handleServerOptions(request, response)
    return
  }
  const principal = requirePrincipal(request)
  if (pathname === MANAGED_USER_LOGIN_PATH) {
    await handleManagedUserLogin(request, response, principal)
    return
  }
  if (pathname === USERS_PATH) {
    await handleUsersCollection(request, response, principal)
    return
  }

  const automationSettingsMatch = pathname.match(/^\/api\/users\/([^/]+)\/automation-settings$/)
  if (automationSettingsMatch) {
    const userId = decodeURIComponent(automationSettingsMatch[1])
    requireUserAccess(principal, userId)
    await handleAutomationSettings(request, response, userId)
    return
  }

  const automationRunMatch = pathname.match(/^\/api\/users\/([^/]+)\/automation\/run$/)
  if (automationRunMatch) {
    const userId = decodeURIComponent(automationRunMatch[1])
    requireUserAccess(principal, userId)
    await handleAutomationRun(request, response, userId)
    return
  }

  const protocolMatch = pathname.match(/^\/api\/users\/([^/]+)\/protocols\/([^/]+)\/run$/)
  if (protocolMatch) {
    if (!canUseProtocolRunner(principal)) throw new HttpError(403, '玩法中心仅向管理员开放')
    const userId = decodeURIComponent(protocolMatch[1])
    requireUserAccess(principal, userId)
    await handleProtocolRequest(
      request,
      response,
      userId,
      decodeURIComponent(protocolMatch[2]),
    )
    return
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)(?:\/(connect|disconnect))?$/)
  if (userMatch) {
    await handleUserItem(request, response, decodeURIComponent(userMatch[1]), userMatch[2], principal)
    return
  }
  sendJson(response, 404, { error: '接口不存在' })
}

function registerDashboardApi(server) {
  server.middlewares.use((request, response, next) => {
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname
    if (!pathname.startsWith('/api/')) {
      next()
      return
    }

    void handleDashboardApi(request, response, pathname).catch(error => {
      if (!response.writableEnded) {
        const message = error instanceof SyntaxError ? '请求内容不是有效 JSON' : error.message
        const statusCode = error instanceof SyntaxError ? 400 : error instanceof HttpError ? error.statusCode : 500
        sendJson(response, statusCode, { error: message || '本机服务处理失败' })
      }
    })
  })
  server.httpServer?.once('close', shutdownDashboard)
}

export function dashboardApiPlugin() {
  return {
    name: 'xddq-dashboard-local-api',
    configureServer(server) {
      registerDashboardApi(server)
    },
    configurePreviewServer(server) {
      registerDashboardApi(server)
    },
  }
}
