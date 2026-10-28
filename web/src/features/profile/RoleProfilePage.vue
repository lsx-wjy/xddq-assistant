<script setup lang="ts">
import { computed, onUnmounted, shallowRef } from 'vue'
import {
  Activity,
  AlertCircle,
  BadgeCheck,
  BatteryCharging,
  CheckCircle2,
  CircleUserRound,
  Clock3,
  Crown,
  Gauge,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sprout,
  Swords,
  UsersRound,
} from '@lucide/vue'
import { connectionActionFor } from '@/features/users/connectionPolicy'
import { useDefaultUserSelection } from '@/features/users/useDefaultUserSelection'
import { useUsers } from '@/features/users/useUsers'

const { users, loading, error, refreshUsers, setConnection } = useUsers()
const { selectedUser } = useDefaultUserSelection(users)
const connectionPending = shallowRef(false)
const toastMessage = shallowRef('')
const toastTone = shallowRef<'success' | 'error'>('success')
let toastTimer: number | undefined

const profile = computed(() => selectedUser.value?.profile ?? {})
const identity = computed(() => profile.value.identity ?? {})
const progress = computed(() => profile.value.progress ?? {})
const tree = computed(() => profile.value.tree ?? {})
const resources = computed(() => profile.value.resources ?? {})
const dailyClaimedJade = computed(() => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
  return resources.value.dailyClaimedJadeSource === 'palace' && resources.value.dailyClaimedJadeDate === today
    ? (resources.value.dailyClaimedJade ?? 0)
    : 0
})
const union = computed(() => profile.value.union ?? {})
const homeland = computed(() => profile.value.homeland ?? {})
const benefits = computed(() => profile.value.benefits ?? {})
const connection = computed(() => selectedUser.value
  ? connectionActionFor(selectedUser.value, connectionPending.value)
  : null)
const enabledTaskCount = computed(() => Object.values(selectedUser.value?.automationSettings.tasks ?? {})
  .filter(task => task.enabled).length)
const runningTask = computed(() => ['running', 'active'].includes(selectedUser.value?.automationRun.status ?? 'idle'))
const unionPosition = computed(() => ({ 0: '盟主', 1: '副盟主', 2: '精英', 3: '成员' })[union.value.position ?? -1] ?? '尚未同步')
const lastSyncCopy = computed(() => {
  if (!profile.value.syncedAt) return '连接角色后同步资料'
  return `最近同步 ${new Date(profile.value.syncedAt).toLocaleString('zh-CN', { hour12: false })}`
})

function numberCopy(value: number | undefined) {
  return Number.isFinite(value) ? new Intl.NumberFormat('zh-CN').format(value as number) : '—'
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastTone.value = tone
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toastMessage.value = '' }, 3_200)
}

async function toggleConnection() {
  const user = selectedUser.value
  const action = connection.value
  if (!user || !action || action.disabled) {
    if (user?.connectionBlocked) showToast(user.lastError || '该角色当前被服务器限制登录', 'error')
    return
  }
  connectionPending.value = true
  try {
    const updated = await setConnection(user.id, action.shouldConnect)
    showToast(action.shouldConnect ? `正在连接“${updated.note}”` : `已断开“${updated.note}”`)
  } catch (requestError) {
    showToast(requestError instanceof Error ? requestError.message : '连接操作失败', 'error')
  } finally {
    connectionPending.value = false
  }
}

onUnmounted(() => { if (toastTimer) window.clearTimeout(toastTimer) })
</script>

<template>
  <section class="page-panel profile-page">
    <div class="page-content">
      <header class="page-header">
        <div>
          <h1 class="page-title">我的角色</h1>
          <p class="page-subtitle">角色概况、连接状态与后台任务一处掌握</p>
        </div>
        <button class="jade-button" type="button" :disabled="loading" @click="refreshUsers()">
          <RefreshCw :size="19" :class="{ 'is-spinning': loading }" />
          刷新资料
        </button>
      </header>

      <div v-if="error" class="service-error" role="alert"><AlertCircle :size="18" />{{ error }}</div>

      <template v-if="selectedUser">
        <section class="identity-scroll">
          <div class="identity-seal" aria-hidden="true">{{ (identity.nickname || selectedUser.note).slice(0, 1) }}</div>
          <div class="identity-copy">
            <span class="identity-kicker">CURRENT CULTIVATOR</span>
            <h2>{{ identity.nickname || selectedUser.note }}</h2>
            <p>{{ selectedUser.serverName }} · ID {{ identity.roleId || selectedUser.serverId }}</p>
          </div>
          <div class="identity-meta">
            <span :class="['connection-state', `connection-state--${selectedUser.connectionState}`]">
              <i></i>{{ connection?.statusLabel }}
            </span>
            <small>{{ lastSyncCopy }}</small>
          </div>
        </section>

        <section class="connection-panel">
          <div class="connection-orb" :class="{ 'connection-orb--active': connection?.active }">
            <Gauge :size="28" />
          </div>
          <div class="connection-copy">
            <span>角色连接</span>
            <strong>{{ connection?.active ? '后台连接保持中' : '当前未建立游戏连接' }}</strong>
            <small v-if="selectedUser.lastError">{{ selectedUser.lastError }}</small>
            <small v-else>连接成功后才会同步角色数据并执行已启用任务</small>
          </div>
          <button
            class="connection-action"
            :class="{ 'connection-action--disconnect': connection?.active }"
            type="button"
            :disabled="connection?.disabled"
            @click="toggleConnection"
          >
            <RefreshCw v-if="connectionPending" :size="18" class="is-spinning" />
            <LogOut v-else-if="connection?.active" :size="18" />
            <LogIn v-else :size="18" />
            {{ connection?.actionLabel }}
          </button>
        </section>

        <div class="profile-grid">
          <section class="profile-card profile-card--progress">
            <header><Swords :size="20" /><span>修行概况</span></header>
            <div class="metric-grid">
              <div><small>境界等级</small><strong>{{ numberCopy(progress.realmsId) }}</strong></div>
              <div><small>当前妖力</small><strong>{{ numberCopy(progress.fightValue) }}</strong></div>
              <div><small>仙树等级</small><strong>Lv.{{ numberCopy(tree.level) }}</strong></div>
              <div><small>剩余桃子</small><strong>{{ numberCopy(tree.peaches) }}</strong></div>
              <div class="metric-jade"><small>仙玉余额</small><strong>{{ numberCopy(resources.fairyJade) }}</strong></div>
              <div class="metric-jade-daily" title="当日自动仙宫朝拜与收礼实际获得的仙玉"><small>当日领玉</small><strong>+{{ numberCopy(dailyClaimedJade) }}</strong></div>
            </div>
          </section>

          <section class="profile-card">
            <header><UsersRound :size="20" /><span>妖盟信息</span></header>
            <dl>
              <div><dt>妖盟</dt><dd>{{ union.name || '尚未加入或未同步' }}</dd></div>
              <div><dt>职位</dt><dd>{{ unionPosition }}</dd></div>
              <div><dt>成员数量</dt><dd>{{ numberCopy(union.memberCount) }}</dd></div>
              <div><dt>妖盟 ID</dt><dd>{{ union.id || '—' }}</dd></div>
            </dl>
          </section>

          <section class="profile-card">
            <header><Sprout :size="20" /><span>福地状态</span></header>
            <div class="homeland-energy">
              <BatteryCharging :size="23" />
              <span><small>剩余体力</small><strong>{{ numberCopy(homeland.energy) }}</strong></span>
            </div>
            <dl>
              <div><dt>空闲鼠宝</dt><dd>{{ numberCopy(homeland.freeWorkers) }}</dd></div>
              <div><dt>鼠宝总数</dt><dd>{{ numberCopy(homeland.totalWorkers) }}</dd></div>
              <div><dt>可用状态</dt><dd>{{ (homeland.energy ?? 0) > 0 && (homeland.freeWorkers ?? 0) > 0 ? '可继续采集' : '等待恢复' }}</dd></div>
            </dl>
          </section>

          <section class="profile-card">
            <header><Crown :size="20" /><span>福利与仙宫</span></header>
            <ul class="benefit-list">
              <li><BadgeCheck :size="17" /><span>月卡</span><strong>{{ benefits.monthCardActive ? '生效中' : '未开通/未同步' }}</strong></li>
              <li><Sparkles :size="17" /><span>终身卡</span><strong>{{ benefits.yearCardActive ? '生效中' : '未开通/未同步' }}</strong></li>
              <li><CircleUserRound :size="17" /><span>仙宫膜拜</span><strong>{{ benefits.palaceWorshipAvailable ? '可进行' : benefits.palaceMiracle ? '今日已完成' : '待同步' }}</strong></li>
              <li><Activity :size="17" /><span>仙树加速</span><strong>{{ numberCopy(tree.freeSpeedUpRemaining) }} 次</strong></li>
            </ul>
          </section>

          <section class="profile-card profile-card--tasks">
            <header><Clock3 :size="20" /><span>后台任务</span></header>
            <div class="task-summary">
              <strong>{{ enabledTaskCount }}</strong>
              <span>项任务已启用</span>
              <i :class="{ 'task-running': runningTask }">{{ runningTask ? '后台执行中' : '当前未运行' }}</i>
            </div>
            <p>网页退出后，角色连接与已经运行的后台任务会继续保持。</p>
          </section>
        </div>

        <aside class="logout-note">
          <ShieldCheck :size="19" />
          <span><strong>退出登录不会断开角色</strong>只有点击上方“断开连接”或停止管理服务，才会结束角色进程和持续任务。</span>
        </aside>
      </template>

      <div v-else-if="!loading" class="empty-profile">当前登录没有对应角色，请退出后重新选择区服。</div>
    </div>
  </section>

  <div v-if="toastMessage" class="toast" :class="{ 'toast--error': toastTone === 'error' }" role="status">
    <AlertCircle v-if="toastTone === 'error'" :size="18" />
    <CheckCircle2 v-else :size="18" />
    {{ toastMessage }}
  </div>
</template>

<style scoped>
.profile-page { --profile-ink: #3d3325; }
.jade-button { display: inline-flex; align-items: center; gap: 8px; }
.service-error { display: flex; align-items: center; gap: 8px; margin: 12px 0; padding: 11px 13px; color: #984533; background: #f8e6dd; border: 1px solid #d8a08e; border-radius: 8px; }
.identity-scroll { position: relative; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 18px; min-height: 140px; margin-top: 14px; padding: 24px 30px; background: linear-gradient(108deg, rgb(20 67 58 / 96%), rgb(33 91 72 / 91%) 55%, rgb(82 111 77 / 82%)); border: 1px solid #b89a56; border-radius: 12px; box-shadow: inset 0 0 0 4px rgb(240 220 154 / 8%), 0 12px 28px rgb(30 62 48 / 17%); overflow: hidden; }
.identity-scroll::after { position: absolute; right: -32px; bottom: -72px; width: 260px; height: 180px; content: ''; background: radial-gradient(ellipse, rgb(231 210 142 / 16%), transparent 68%); transform: rotate(-12deg); }
.identity-seal { display: grid; width: 78px; height: 78px; color: #21483d; font-family: var(--font-display); font-size: 39px; background: radial-gradient(circle at 38% 32%, #fff4c9, #d8bd74); border: 5px double #765722; border-radius: 50%; box-shadow: 0 7px 18px rgb(0 0 0 / 28%); place-items: center; }
.identity-kicker { color: #8ed7b8; font-size: 10px; font-weight: 900; letter-spacing: .24em; }
.identity-copy h2 { margin: 5px 0 2px; color: #fff1c3; font-family: var(--font-display); font-size: 34px; letter-spacing: .08em; }
.identity-copy p { margin: 0; color: #c6d9c9; font-family: var(--font-serif); font-size: 13px; }
.identity-meta { position: relative; z-index: 1; display: grid; justify-items: end; gap: 8px; color: #aec6b8; font-size: 11px; }
.connection-state { display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px; color: #d8eee2; font-weight: 800; background: rgb(3 29 26 / 42%); border: 1px solid rgb(218 191 114 / 45%); border-radius: 999px; }
.connection-state i { width: 9px; height: 9px; background: #89958c; border-radius: 50%; }
.connection-state--running i { background: #6ae2ad; box-shadow: 0 0 10px #6ae2ad; }
.connection-state--connecting i,.connection-state--reconnecting i { background: #e3bc5f; box-shadow: 0 0 9px #e3bc5f; }
.connection-state--error i { background: #e57861; }
.connection-panel { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px; margin: 16px 0; padding: 16px 18px; background: linear-gradient(90deg, rgb(235 242 229 / 94%), rgb(250 245 229 / 94%)); border: 1px solid #b8c7ab; border-radius: 10px; }
.connection-orb { display: grid; width: 52px; height: 52px; color: #797d70; background: #dfded2; border: 1px solid #bcb8a8; border-radius: 50%; place-items: center; }
.connection-orb--active { color: #f2e7bb; background: #287b67; border-color: #b89a58; box-shadow: 0 0 0 4px rgb(45 132 105 / 12%); }
.connection-copy { display: grid; gap: 2px; }
.connection-copy > span { color: #768076; font-size: 10px; font-weight: 900; letter-spacing: .13em; }
.connection-copy strong { color: #354c3e; font-family: var(--font-serif); font-size: 17px; }
.connection-copy small { color: #798074; font-size: 11px; }
.connection-action { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-width: 132px; min-height: 44px; color: #fff4d2; font-weight: 800; background: linear-gradient(#3ca184, #247861); border: 1px solid #90712e; border-radius: 8px; box-shadow: inset 0 0 0 2px rgb(255 255 255 / 16%), 0 4px 9px rgb(31 72 57 / 20%); cursor: pointer; }
.connection-action--disconnect { color: #8f3f2e; background: #fff8e8; border-color: #c88c70; }
.connection-action:disabled { opacity: .55; cursor: not-allowed; }
.profile-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.profile-card { padding: 17px 18px; color: var(--profile-ink); background: rgb(255 251 237 / 88%); border: 1px solid #cfc09e; border-radius: 10px; box-shadow: 0 6px 17px rgb(66 61 43 / 7%); }
.profile-card > header { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; color: #31745f; font-family: var(--font-serif); font-size: 16px; font-weight: 800; }
.metric-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.metric-grid div { padding: 11px; text-align: center; background: #f1edde; border: 1px solid #ddd2ba; border-radius: 8px; }
.metric-grid small,.metric-grid strong { display: block; }
.metric-grid small { color: #8a7c68; font-size: 10px; }
.metric-grid strong { margin-top: 5px; color: #4b3b25; font-family: var(--font-serif); font-size: 18px; }
.metric-grid .metric-jade { background: linear-gradient(145deg, #f8f0ce, #eee3bd); border-color: #cfb76e; }
.metric-grid .metric-jade strong { color: #8a661f; }
.metric-grid .metric-jade-daily { background: linear-gradient(145deg, #edf3dd, #f3e8bd); border-color: #b8c276; }
.metric-grid .metric-jade-daily strong { color: #2f765c; }
.profile-card--progress,.profile-card--tasks { grid-column: 1 / -1; }
.profile-card dl { display: grid; gap: 8px; margin: 0; }
.profile-card dl div { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-bottom: 7px; border-bottom: 1px dashed #dbcfb7; }
.profile-card dt { color: #8a7d69; font-size: 11px; }
.profile-card dd { margin: 0; color: #4a3c2b; font-weight: 750; text-align: right; }
.homeland-energy { display: flex; align-items: center; gap: 10px; margin-bottom: 11px; padding: 11px 13px; color: #2d8067; background: #e7f1e7; border-radius: 8px; }
.homeland-energy small,.homeland-energy strong { display: block; }
.homeland-energy small { color: #718173; font-size: 10px; }
.homeland-energy strong { font-family: var(--font-serif); font-size: 23px; }
.benefit-list { display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; }
.benefit-list li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; padding: 8px 9px; color: #5d6f61; background: #f1eee2; border-radius: 7px; }
.benefit-list span { color: #645743; font-size: 12px; }
.benefit-list strong { color: #33715d; font-size: 11px; }
.task-summary { display: flex; align-items: baseline; gap: 9px; }
.task-summary > strong { color: #2b765e; font-family: var(--font-display); font-size: 36px; }
.task-summary > span { color: #6d6252; font-family: var(--font-serif); }
.task-summary i { margin-left: auto; padding: 5px 9px; color: #7b7366; font-size: 10px; font-style: normal; background: #e6e1d3; border-radius: 999px; }
.task-summary i.task-running { color: #24765d; background: #dceee1; }
.profile-card--tasks p { margin: 4px 0 0; color: #887b68; font-size: 11px; }
.logout-note { display: flex; align-items: center; gap: 11px; margin-top: 14px; padding: 13px 15px; color: #49665a; background: rgb(229 239 225 / 76%); border: 1px solid #b7c8b2; border-radius: 8px; }
.logout-note span { font-size: 12px; line-height: 1.6; }.logout-note strong { margin-right: 8px; color: #285e4c; }
.empty-profile { padding: 80px 20px; color: #7a705f; text-align: center; }
.toast--error { background: #8f3829; }
.is-spinning { animation: profile-spin 850ms linear infinite; }
@keyframes profile-spin { to { transform: rotate(360deg); } }
@media (max-width: 820px) { .profile-grid { grid-template-columns: 1fr; }.profile-card--progress,.profile-card--tasks { grid-column: auto; }.metric-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 620px) { .identity-scroll { grid-template-columns: auto 1fr; padding: 20px; }.identity-meta { grid-column: 1 / -1; justify-items: start; }.connection-panel { grid-template-columns: auto 1fr; }.connection-action { grid-column: 1 / -1; width: 100%; }.profile-grid { gap: 10px; } }
</style>
