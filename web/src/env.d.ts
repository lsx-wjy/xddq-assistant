/// <reference types="vite/client" />

declare module '@activity-registry' {
  import type { ActivityRegistryEntry } from '@/features/activities/types'
  const registry: ActivityRegistryEntry[]
  export default registry
}

declare module '@protocol-version' {
  const version: {
    version: string
    buildID: string
    protocolCount: number
    msgInfoAssetCount: number
    activityGroupCount: number
  }
  export default version
}
