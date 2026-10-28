const schema = {
  identity: { nickname: 'text', playerId: 'id', roleId: 'id', serverId: 'number' },
  progress: { realmsId: 'number', fightValue: 'number' },
  tree: { level: 'number', peaches: 'number', freeSpeedUpRemaining: 'number' },
  resources: { fairyJade: 'number', dailyClaimedJade: 'number', dailyClaimedJadeDate: 'text', dailyClaimedJadeSource: 'text' },
  union: { id: 'id', name: 'text', memberCount: 'number', position: 'number' },
  homeland: { energy: 'number', freeWorkers: 'number', totalWorkers: 'number' },
  benefits: {
    monthCardActive: 'boolean',
    yearCardActive: 'boolean',
    palaceWorshipAvailable: 'boolean',
    palaceMiracle: 'boolean',
  },
}

function normalizeValue(value, type) {
  if (type === 'text') return typeof value === 'string' ? value.trim().slice(0, 96) : undefined
  if (type === 'id') {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return undefined
    return String(value).slice(0, 64)
  }
  if (type === 'number') {
    const number = Number(value)
    return Number.isFinite(number) ? number : undefined
  }
  if (type === 'boolean') return typeof value === 'boolean' ? value : undefined
  return undefined
}

export function mergeProfileSnapshot(current = {}, patch = {}, now = Date.now()) {
  const next = { ...current }
  for (const [sectionName, fields] of Object.entries(schema)) {
    const sectionPatch = patch?.[sectionName]
    if (!sectionPatch || typeof sectionPatch !== 'object' || Array.isArray(sectionPatch)) continue
    const section = { ...(current?.[sectionName] || {}) }
    for (const [fieldName, fieldType] of Object.entries(fields)) {
      const value = normalizeValue(sectionPatch[fieldName], fieldType)
      if (value !== undefined) section[fieldName] = value
    }
    if (Object.keys(section).length) next[sectionName] = section
  }
  next.syncedAt = new Date(now).toISOString()
  return next
}
