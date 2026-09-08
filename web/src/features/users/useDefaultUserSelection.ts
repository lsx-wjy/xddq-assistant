import { computed, shallowRef, watch, type Ref } from 'vue'
import type { UserRecord } from './types'

type UsersRef = Readonly<Ref<readonly UserRecord[]>>

function isConnected(user: UserRecord) {
  return user.desiredConnected
    || user.connectionState === 'running'
    || user.connectionState === 'connecting'
    || user.connectionState === 'reconnecting'
}

export function useDefaultUserSelection(users: UsersRef) {
  const selectedUserId = shallowRef('')

  const selectedUser = computed(() =>
    users.value.find(user => user.id === selectedUserId.value) ?? null,
  )

  watch(users, availableUsers => {
    if (selectedUser.value) return
    selectedUserId.value = availableUsers.find(isConnected)?.id ?? ''
  }, { immediate: true })

  return { selectedUserId, selectedUser }
}
