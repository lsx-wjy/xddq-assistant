export type ProtocolRisk = 'observe' | 'combat' | 'purchase' | 'transaction' | string
export type RiskLevel = 'low' | 'medium' | 'high'
export type OpenState = 'observed' | 'closed' | 'unknown'
export type GameplayCategory =
  | 'daily'
  | 'growth'
  | 'challenge'
  | 'competition'
  | 'union'
  | 'seasonal'
  | 'welfare'
  | 'social'
  | 'minigame'
  | 'commerce'
  | 'system'
  | 'other'

export interface GameplayCategoryOption {
  id: GameplayCategory
  label: string
  description: string
}

export interface ActivityProtocol {
  key: string
  id: number
  responseId: number
  comment: string
  requestMethod: string
  responseMethod: string
  risk: ProtocolRisk
}

export interface ActivityRegistryEntry {
  name: string
  sources: readonly string[]
  remote: boolean
  enabled: boolean
  protocols: readonly ActivityProtocol[]
}

export interface ActivityItem extends ActivityRegistryEntry {
  displayName: string
  category: GameplayCategory
  categoryLabel: string
  openState: OpenState
  riskLevel: RiskLevel
  strategy: string
  recentMessage: string
  iconIndex: number
  requestableCount: number
  pushOnlyCount: number
  observedProtocolCount: number
}

export interface ProtocolRunResult {
  ok: boolean
  protocolKey: string
  response: unknown
  message?: string
  error?: string
  parameterSource?: 'script' | 'runtime' | 'snapshot' | 'protocol-default' | 'advanced'
  parameterMessage?: string
  resolvedPayload?: unknown
}

export interface ProtocolRunOptions {
  mode: 'auto' | 'advanced'
  payloadText?: string
}

export interface ProtocolRunState {
  status: 'idle' | 'running' | 'success' | 'error'
  result: ProtocolRunResult | null
  error: string
}
