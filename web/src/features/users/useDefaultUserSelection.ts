import { computed, shallowRef, watch, type Ref } from 'vue'
import { useSession } from '@/features/auth/useSession'
import type { UserRecord } from './types'
import { chooseSelectedUserId } from './selectionPolicy'

type UsersRef = Readonly<Ref<readonly UserRecord[]>>

function isConnected(user: UserRecord) {
  return user.desiredConnected
    || user.connectionState === 'running'
    || user.connectionState === 'connecting'
    || user.connectionState === 'reconnecting'
}

export function useDefaultUserSelection(users: UsersRef) {
  const { session } = useSession()

  const selectedUser = computed(() =>
    users.value.find(user => user.id === sharedSelectedUserId.value) ?? null,
  )

  watch([users, () => session.value.userId], ([availableUsers, authenticatedUserId]) => {
    sharedSelectedUserId.value = chooseSelectedUserId(
      availableUsers.map(user => ({ id: user.id, connected: isConnected(user) })),
      sharedSelectedUserId.value,
      authenticatedUserId ?? '',
    )
  }, { immediate: true })

  return { selectedUserId: sharedSelectedUserId, selectedUser }
}

const sharedSelectedUserId = shallowRef('')
