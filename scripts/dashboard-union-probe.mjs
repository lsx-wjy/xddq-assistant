// Isolated verification process: receives login data and reads union membership only.
import initialize from '../src/loaders/index.js'
import account from '../src/config/runtimeAccount.js'
import GameNetMgr from '../src/game/net/GameNetMgr.js'
import Protocol from '../src/game/net/Protocol.js'

const game = GameNetMgr.inst
let unionId = null
let finished = false
const timer = setTimeout(() => finish({ error: '妖盟资格验证超时，请稍后重试' }), 45_000)

function finish(result) {
  if (finished) return
  finished = true
  clearTimeout(timer)
  game.close()
  process.send?.({ type: 'union-verification', ...result }, () => process.exit(result.error ? 1 : 0))
}

// Bypass all gameplay handlers, including those triggered by login broadcasts.
game.resvHandler = (_msgId, data, methodPath) => {
  const method = methodPath?.split('.').at(-1)
  if (method === 'RspLoginMsg') game.handleLoginResponse(data)
  else if (method === 'MyUnionData') {
    unionId = String(data?.baseData?.unionId || '')
    if (game.loginReady) finish({ unionId })
  } else if (method === 'LoginOverMsg' && game.loginAccepted) {
    game.loginReady = true
    if (unionId !== null) finish({ unionId })
    else game.sendPbMsg(Protocol.S_UNION_ENTER, {}, null)
  } else if (method === 'RspUnionEnter') {
    if (Number(data?.ret) !== 0) finish({ error: '无法验证角色妖盟资格，请确认角色已加入允许的妖盟' })
    else finish({ unionId: String(data?.myUnionData?.baseData?.unionId || '') })
  }
}

const send = game.sendPbMsg.bind(game)
game.sendPbMsg = (msgId, ...args) => {
  if (![Protocol.S_PLAYER_LOGIN, Protocol.S_PLAYER_PING, Protocol.S_UNION_ENTER].includes(msgId)) return false
  return send(msgId, ...args)
}

initialize(account.username, account.password, account.serverId).catch(error => finish({
  error: error.message || '妖盟资格验证失败',
  code: error.code,
  forbiddenEndTime: error.forbiddenEndTime,
}))
