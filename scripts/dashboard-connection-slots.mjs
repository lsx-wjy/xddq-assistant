export class ConnectionLimitError extends Error {
  constructor(limit) {
    super(`游戏连接已达上限（${limit} 个），请先断开其他角色后重试`)
    this.statusCode = 409
  }
}

export function createConnectionSlots(readLimit) {
  const slots = new Set()
  return {
    acquire() {
      const limit = readLimit()
      if (slots.size >= limit) {
        throw new ConnectionLimitError(limit)
      }
      const slot = Symbol('game-connection')
      slots.add(slot)
      return () => slots.delete(slot)
    },
    get size() { return slots.size },
  }
}
