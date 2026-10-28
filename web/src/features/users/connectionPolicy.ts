import type { ConnectionState } from './types'

interface ConnectionCandidate {
  connectionState: ConnectionState
  desiredConnected: boolean
  connectionBlocked: boolean
}

const statusLabels: Record<ConnectionState, string> = {
  connecting: '正在连接',
  running: '运行中',
  reconnecting: '等待重连',
  stopped: '尚未连接',
  error: '连接异常',
}

export function connectionActionFor(user: ConnectionCandidate, pending: boolean) {
  const active = user.desiredConnected
    || user.connectionState === 'connecting'
    || user.connectionState === 'running'
    || user.connectionState === 'reconnecting'
  return {
    active,
    shouldConnect: !active,
    disabled: pending || (user.connectionBlocked && !active),
    actionLabel: pending ? '处理中…' : active ? '断开连接' : '连接角色',
    statusLabel: user.connectionBlocked && !active ? '登录暂受限制' : statusLabels[user.connectionState],
  }
}
