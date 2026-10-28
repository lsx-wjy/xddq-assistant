interface SelectableUser {
  id: string
  connected: boolean
}

export function chooseSelectedUserId(
  users: readonly SelectableUser[],
  currentUserId: string,
  authenticatedUserId: string,
) {
  if (users.some(user => user.id === currentUserId)) return currentUserId
  if (users.some(user => user.id === authenticatedUserId)) return authenticatedUserId
  return users.find(user => user.connected)?.id ?? users[0]?.id ?? ''
}
