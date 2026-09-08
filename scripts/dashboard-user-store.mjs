import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const CREATE_USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS dashboard_users (
    id TEXT PRIMARY KEY,
    note TEXT NOT NULL,
    account TEXT NOT NULL,
    password TEXT NOT NULL,
    server_name TEXT NOT NULL,
    server_id INTEGER NOT NULL,
    auto_reconnect INTEGER NOT NULL DEFAULT 0,
    selected_activities TEXT NOT NULL DEFAULT '[]',
    automation_settings TEXT NOT NULL DEFAULT '{}',
    persist_snapshots INTEGER NOT NULL DEFAULT 0,
    allow_combat INTEGER NOT NULL DEFAULT 0,
    allow_purchase INTEGER NOT NULL DEFAULT 0,
    client_id TEXT NOT NULL DEFAULT '',
    device_id TEXT NOT NULL DEFAULT '',
    login_error_code INTEGER,
    forbidden_end_time INTEGER,
    retry_blocked_until INTEGER,
    last_login_error TEXT NOT NULL DEFAULT '',
    last_login_error_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (account, server_id)
  )
`

const INSERT_USER = `
  INSERT INTO dashboard_users (
    id, note, account, password, server_name, server_id, auto_reconnect,
    selected_activities, automation_settings, persist_snapshots, allow_combat, allow_purchase,
    client_id, device_id, login_error_code, forbidden_end_time,
    retry_blocked_until, last_login_error, last_login_error_at,
    created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
`

const OPTIONAL_COLUMNS = [
  ['automation_settings', "TEXT NOT NULL DEFAULT '{}'"],
  ['client_id', "TEXT NOT NULL DEFAULT ''"],
  ['device_id', "TEXT NOT NULL DEFAULT ''"],
  ['login_error_code', 'INTEGER'],
  ['forbidden_end_time', 'INTEGER'],
  ['retry_blocked_until', 'INTEGER'],
  ['last_login_error', "TEXT NOT NULL DEFAULT ''"],
  ['last_login_error_at', 'TEXT'],
]

function parseSelectedActivities(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed.filter(name => typeof name === 'string') : []
  } catch {
    return []
  }
}

function parseAutomationSettings(value) {
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function toUser(row) {
  return {
    id: row.id,
    note: row.note,
    account: row.account,
    password: row.password,
    serverName: row.server_name,
    serverId: Number(row.server_id),
    autoReconnect: Boolean(row.auto_reconnect),
    selectedActivities: parseSelectedActivities(row.selected_activities),
    automationSettings: parseAutomationSettings(row.automation_settings),
    persistSnapshots: Boolean(row.persist_snapshots),
    allowCombat: Boolean(row.allow_combat),
    allowPurchase: Boolean(row.allow_purchase),
    clientId: row.client_id || '',
    deviceId: row.device_id || '',
    loginErrorCode: row.login_error_code === null ? null : Number(row.login_error_code),
    forbiddenEndTime: row.forbidden_end_time === null ? null : Number(row.forbidden_end_time),
    retryBlockedUntil: row.retry_blocked_until === null ? null : Number(row.retry_blocked_until),
    lastLoginError: row.last_login_error || '',
    lastLoginErrorAt: row.last_login_error_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function valuesFor(user) {
  return [
    user.id,
    user.note,
    user.account,
    user.password,
    user.serverName,
    user.serverId,
    user.autoReconnect ? 1 : 0,
    JSON.stringify(user.selectedActivities ?? []),
    JSON.stringify(user.automationSettings ?? {}),
    user.persistSnapshots ? 1 : 0,
    user.allowCombat ? 1 : 0,
    user.allowPurchase ? 1 : 0,
    user.clientId || '',
    user.deviceId || '',
    user.loginErrorCode ?? null,
    user.forbiddenEndTime ?? null,
    user.retryBlockedUntil ?? null,
    user.lastLoginError || '',
    user.lastLoginErrorAt || null,
    user.createdAt,
    user.updatedAt,
  ]
}

export function createDashboardUserStore({ databaseFile, legacyJsonFile }) {
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true })
  const database = new DatabaseSync(databaseFile)
  database.exec('PRAGMA journal_mode = WAL')
  database.exec('PRAGMA synchronous = NORMAL')
  database.exec('PRAGMA busy_timeout = 5000')
  database.exec(CREATE_USERS_TABLE)

  const existingColumns = new Set(
    database.prepare('PRAGMA table_info(dashboard_users)').all().map(column => column.name),
  )
  for (const [columnName, definition] of OPTIONAL_COLUMNS) {
    if (!existingColumns.has(columnName)) {
      database.exec(`ALTER TABLE dashboard_users ADD COLUMN ${columnName} ${definition}`)
    }
  }

  const selectUsers = database.prepare('SELECT * FROM dashboard_users ORDER BY created_at ASC')
  const insertUser = database.prepare(INSERT_USER)
  const updateLoginStateStatement = database.prepare(`
    UPDATE dashboard_users SET
      login_error_code = ?,
      forbidden_end_time = ?,
      retry_blocked_until = ?,
      last_login_error = ?,
      last_login_error_at = ?
    WHERE id = ?
  `)

  function loadUsers() {
    return selectUsers.all().map(toUser)
  }

  function saveUsers(users) {
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec('DELETE FROM dashboard_users')
      for (const user of users) insertUser.run(...valuesFor(user))
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }

  function updateLoginState(userId, loginState) {
    updateLoginStateStatement.run(
      loginState.loginErrorCode ?? null,
      loginState.forbiddenEndTime ?? null,
      loginState.retryBlockedUntil ?? null,
      loginState.lastLoginError || '',
      loginState.lastLoginErrorAt || null,
      userId,
    )
  }

  function migrateLegacyJson() {
    if (loadUsers().length || !legacyJsonFile || !fs.existsSync(legacyJsonFile)) return 0

    try {
      const parsed = JSON.parse(fs.readFileSync(legacyJsonFile, 'utf8'))
      if (!Array.isArray(parsed) || !parsed.length) return 0
      saveUsers(parsed)
      const migratedFile = `${legacyJsonFile}.migrated-${Date.now()}`
      fs.renameSync(legacyJsonFile, migratedFile)
      return parsed.length
    } catch (error) {
      console.warn(`[Dashboard] 旧用户文件迁移失败，已保留原文件：${error.message}`)
      return 0
    }
  }

  migrateLegacyJson()

  return {
    loadUsers,
    saveUsers,
    updateLoginState,
    close() {
      database.close()
    },
  }
}
