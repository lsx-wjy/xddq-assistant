import { computed, readonly, shallowRef } from 'vue'
import activityRegistry from '@activity-registry'
import protocolVersion from '@protocol-version'
import type { ActivityItem, ActivityRegistryEntry, RiskLevel } from './types'
import {
  categoryFor,
  categoryLabelFor,
  displayNameFor,
  gameplayCategories,
} from './activityTaxonomy'

const featuredNames = ['Elixir', 'Pharmacy', 'PlanesTrial', 'ChaosLaw', 'WarSeason', 'LuckyRogue']

const categoryOrder = new Map(gameplayCategories.map((category, index) => [category.id, index]))

function riskLevelFor(entry: ActivityRegistryEntry): RiskLevel {
  const risks = new Set(entry.protocols.map(protocol => protocol.risk))
  if (risks.has('purchase') || risks.has('transaction')) return 'high'
  if (risks.has('combat')) return 'medium'
  return 'low'
}

function strategyFor(entry: ActivityRegistryEntry) {
  const requestable = entry.protocols.filter(protocol => Boolean(protocol.requestMethod)).length
  const pushOnly = entry.protocols.length - requestable
  if (requestable === 0) return `${pushOnly} 项仅接收`
  if (pushOnly === 0) return `${requestable} 项可逐条运行`
  return `${requestable} 可运行 · ${pushOnly} 仅接收`
}

function iconFor(name: string) {
  const featuredIndex = featuredNames.indexOf(name)
  if (featuredIndex >= 0) return featuredIndex
  return [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6
}

function toActivity(entry: ActivityRegistryEntry): ActivityItem {
  const riskLevel = riskLevelFor(entry)
  const category = categoryFor(entry.name)
  const requestableCount = entry.protocols.filter(protocol => Boolean(protocol.requestMethod)).length
  return {
    ...entry,
    displayName: displayNameFor(entry.name),
    category,
    categoryLabel: categoryLabelFor(category),
    openState: 'unknown',
    riskLevel,
    strategy: strategyFor(entry),
    recentMessage: '尚未收到',
    iconIndex: iconFor(entry.name),
    requestableCount,
    pushOnlyCount: entry.protocols.length - requestableCount,
    observedProtocolCount: 0,
  }
}

export function useActivities() {
  const activities = shallowRef<ActivityItem[]>(
    (activityRegistry as ActivityRegistryEntry[])
      .map(toActivity)
      .sort((a, b) => {
        const categoryDifference = (categoryOrder.get(a.category) ?? 99) - (categoryOrder.get(b.category) ?? 99)
        if (categoryDifference !== 0) return categoryDifference
        const aFeatured = featuredNames.indexOf(a.name)
        const bFeatured = featuredNames.indexOf(b.name)
        if (aFeatured >= 0 || bFeatured >= 0) {
          if (aFeatured < 0) return 1
          if (bFeatured < 0) return -1
          return aFeatured - bFeatured
        }
        return a.displayName.localeCompare(b.displayName, 'zh-CN')
      }),
  )

  const summary = computed(() => ({
    apk: `${protocolVersion.version}.${protocolVersion.buildID}`,
    activityGroups: activities.value.length,
    protocols: protocolVersion.protocolCount,
    messageMaps: protocolVersion.msgInfoAssetCount,
  }))

  return {
    activities: readonly(activities),
    categories: gameplayCategories,
    summary,
  }
}
