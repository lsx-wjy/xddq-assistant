export type ConnectionState = 'connecting' | 'running' | 'stopped' | 'reconnecting' | 'error'

export interface ProtocolObservation {
  protocol: string
  msgId: number
  method: string
  receivedAt: string
}

export interface ActivityObservation {
  lastSeenAt: string
  protocols: Record<string, ProtocolObservation>
}

export interface AutomationRunLog {
  at: string
  level: 'info' | 'success' | 'error' | 'skip'
  message: string
}

export interface AutomationRunState {
  status: 'idle' | 'running' | 'active' | 'completed' | 'failed'
  startedAt: string | null
  finishedAt: string | null
  completed: number
  skipped: number
  failed: number
  logs: readonly AutomationRunLog[]
}

export interface UserProfileSnapshot {
  identity?: {
    nickname?: string
    playerId?: string
    roleId?: string
    serverId?: number
  }
  progress?: {
    realmsId?: number
    fightValue?: number
  }
  tree?: {
    level?: number
    peaches?: number
    freeSpeedUpRemaining?: number
  }
  resources?: {
    fairyJade?: number
    dailyClaimedJade?: number
    dailyClaimedJadeDate?: string
  }
  union?: {
    id?: string
    name?: string
    memberCount?: number
    position?: number
  }
  homeland?: {
    energy?: number
    freeWorkers?: number
    totalWorkers?: number
  }
  benefits?: {
    monthCardActive?: boolean
    yearCardActive?: boolean
    palaceWorshipAvailable?: boolean
    palaceMiracle?: boolean
  }
  syncedAt?: string
}

export interface UserRecord {
  id: string
  note: string
  account: string
  accountMasked: string
  hasPassword: boolean
  serverName: string
  serverId: number
  connectionState: ConnectionState
  desiredConnected: boolean
  taskCount: number
  selectedActivities: readonly string[]
  automationSettings: {
    tasks: Record<string, {
      enabled: boolean
      values: Record<string, number | boolean>
    }>
  }
  lastOnlineAt: string | null
  lastError: string
  loginErrorCode: number | null
  forbiddenEndTime: string | null
  retryBlockedUntil: string | null
  connectionBlocked: boolean
  autoReconnect: boolean
  persistSnapshots: boolean
  allowCombat: boolean
  allowPurchase: boolean
  activityObservations: Record<string, ActivityObservation>
  automationRun: AutomationRunState
  profile: UserProfileSnapshot
  updatedAt: string
}

export interface UserDraft {
  note: string
  account: string
  password: string
  serverName: string
  serverId: number
  autoReconnect: boolean
  selectedActivities: string[]
  persistSnapshots: boolean
  allowCombat: boolean
  allowPurchase: boolean
}

export interface UserLoginDraft {
  account: string
  password: string
  serverId: number
}

export interface ServerOption {
  serverId: number
  serverName: string
}
