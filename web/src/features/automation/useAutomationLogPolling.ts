import { onUnmounted, watch, type ComputedRef, type Ref } from 'vue'

interface UseAutomationLogPollingOptions {
  selectedUserId: Readonly<Ref<string>>
  isActive: Readonly<ComputedRef<boolean>>
  refresh: () => Promise<void>
  intervalMs?: number
}

/**
 * Keeps the log panel current only while a selected user's automation is active.
 * The user list remains the single source of truth; this composable only owns
 * the timer and makes sure overlapping refreshes are not started.
 */
export function useAutomationLogPolling({
  selectedUserId,
  isActive,
  refresh,
  intervalMs = 1_000,
}: UseAutomationLogPollingOptions) {
  let timer: number | undefined
  let refreshing = false

  async function refreshLogs() {
    if (refreshing) return
    refreshing = true
    try {
      await refresh()
    } finally {
      refreshing = false
    }
  }

  function stop() {
    if (timer) window.clearInterval(timer)
    timer = undefined
  }

  function start() {
    stop()
    void refreshLogs()
    timer = window.setInterval(() => void refreshLogs(), intervalMs)
  }

  watch([selectedUserId, isActive], ([userId, active]) => {
    if (!userId || !active) {
      stop()
      return
    }
    start()
  }, { immediate: true })

  onUnmounted(stop)
}
