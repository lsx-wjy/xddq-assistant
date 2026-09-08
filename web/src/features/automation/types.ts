export type AutomationCategory = 'basic' | 'benefit' | 'advertising' | 'challenge' | 'union' | 'homeland' | 'cave' | 'event' | 'shop' | 'schedule'
export type AutomationStatus = 'ready' | 'partial' | 'protocol' | 'planned'
export type AutomationRequirement = 'combat' | 'purchase'
export type AutomationSettingSource = 'apk' | 'script' | 'none'

export interface AutomationField {
  key: string
  label: string
  type: 'number' | 'toggle' | 'select'
  min?: number
  max?: number
  default: number | boolean
  help?: string
  options?: readonly { label: string, value: number }[]
  /** Field provenance. Omitted fields inherit the task-level setting source. */
  source?: Exclude<AutomationSettingSource, 'none'>
}

export interface AutomationTask {
  id: string
  category: AutomationCategory
  name: string
  description: string
  status: AutomationStatus
  manager: string
  requires: readonly AutomationRequirement[]
  fields: readonly AutomationField[]
  /** Indicates whether configurable values originate in the game client or in this assistant. */
  settingsSource?: AutomationSettingSource
  /** A concise explanation shown before the task's settings. */
  settingsNote?: string
  hidden?: boolean
  groupName?: string
  requestableCount?: number
}

export interface AutomationTaskState {
  enabled: boolean
  values: Record<string, number | boolean>
}

export interface AutomationSettings {
  tasks: Record<string, AutomationTaskState>
}

export const automationCategoryMeta: Record<AutomationCategory, { label: string, description: string }> = {
  basic: { label: '日常任务', description: '砍树、仙树减时、邮件、仙友游历与常驻任务' },
  benefit: { label: '福利礼包', description: '月卡、终身卡、免费礼包、活动奖励与运势福利' },
  advertising: { label: '广告奖励', description: '可单选某项广告奖励，也可一键领取全部可领奖励' },
  schedule: { label: '定时任务', description: '按指定时间执行的已启用脚本任务' },
  challenge: { label: '挑战玩法', description: '推图、秘境、榜单与对战' },
  union: { label: '妖盟玩法', description: '妖盟讨伐、砍价与每日领奖' },
  homeland: { label: '福地玩法', description: '采集、偷取、刷新与定时重派' },
  cave: { label: '仙友与宗门', description: '仙宫朝拜、弟子培养与宗门管理' },
  event: { label: '限时活动', description: '已验证可运行的限时活动任务' },
  shop: { label: '商店购买', description: '需要单独授权购买的商店任务' },
}

export function taskStateFor(task: AutomationTask, settings: AutomationSettings | undefined): AutomationTaskState {
  const saved = settings?.tasks?.[task.id]
  const defaults = Object.fromEntries(task.fields.map(field => [field.key, field.default])) as Record<string, number | boolean>
  return {
    enabled: saved?.enabled === true,
    values: { ...defaults, ...(saved?.values ?? {}) },
  }
}
