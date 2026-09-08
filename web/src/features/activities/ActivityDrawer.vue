<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import {
  AlertTriangle,
  ChevronDown,
  CircleCheck,
  CircleX,
  Code2,
  LoaderCircle,
  Play,
  Radio,
  Search,
} from '@lucide/vue'
import protocolVersion from '@protocol-version'
import type { ActivityObservation, UserRecord } from '@/features/users/types'
import medallionSheet from '@/assets/activity-medallions.png'
import AppDrawer from '@/components/ui/AppDrawer.vue'
import type {
  ActivityItem,
  ActivityProtocol,
  ProtocolRunOptions,
  ProtocolRunState,
} from './types'
import { protocolStateKey } from './useProtocolRunner'

const props = defineProps<{
  open: boolean
  activity: ActivityItem | null
  user: UserRecord | null
  observation?: ActivityObservation
  runStates: Readonly<Record<string, ProtocolRunState>>
}>()

const emit = defineEmits<{
  close: []
  run: [protocol: ActivityProtocol, options: ProtocolRunOptions]
}>()

const protocolQuery = shallowRef('')
const expandedProtocolKey = shallowRef('')
const payloads = reactive<Record<string, string>>({})
const advancedProtocols = reactive<Record<string, boolean>>({})

watch(
  () => props.activity?.name,
  () => {
    protocolQuery.value = ''
    expandedProtocolKey.value = ''
  },
)

const filteredProtocols = computed(() => {
  const protocols = props.activity?.protocols ?? []
  const normalizedQuery = protocolQuery.value.trim().toLocaleLowerCase()
  if (!normalizedQuery) return protocols
  return protocols.filter(protocol =>
    protocol.comment.toLocaleLowerCase().includes(normalizedQuery)
    || protocol.key.toLocaleLowerCase().includes(normalizedQuery)
    || protocol.requestMethod?.toLocaleLowerCase().includes(normalizedQuery)
    || protocol.responseMethod?.toLocaleLowerCase().includes(normalizedQuery)
    || String(protocol.id).includes(normalizedQuery),
  )
})

function medallionStyle(index: number) {
  const column = index % 3
  const row = Math.floor(index / 3)
  return {
    backgroundImage: `url(${medallionSheet})`,
    backgroundPosition: `${column * 50}% ${row * 100}%`,
  }
}

function riskLabel(risk: string) {
  if (risk === 'purchase') return '购买'
  if (risk === 'transaction') return '交易'
  if (risk === 'combat') return '战斗'
  return '常规'
}

function riskClass(risk: string) {
  if (risk === 'purchase' || risk === 'transaction') return 'protocol-risk--danger'
  if (risk === 'combat') return 'protocol-risk--amber'
  return ''
}

function runDisabledReason(protocol: ActivityProtocol) {
  if (!protocol.requestMethod) return '该功能由服务器主动下发，只能接收'
  if (!props.user) return '请先在上方选择账号'
  if (props.user.connectionState !== 'running') return '请先手动连接账号并等待同步完成'
  if (protocol.risk === 'combat' && !props.user.allowCombat) return '该账号尚未授权战斗操作'
  if ((protocol.risk === 'purchase' || protocol.risk === 'transaction') && !props.user.allowPurchase) {
    return '该账号尚未授权购买与交易操作'
  }
  return ''
}

function observationFor(protocol: ActivityProtocol) {
  return props.observation?.protocols?.[protocol.key]
}

function runStateFor(protocol: ActivityProtocol) {
  return props.runStates[protocolStateKey(protocol)] ?? {
    status: 'idle',
    result: null,
    error: '',
  }
}

function payloadFor(protocol: ActivityProtocol) {
  return payloads[protocolStateKey(protocol)] ?? '{}'
}

function isAdvanced(protocol: ActivityProtocol) {
  return advancedProtocols[protocolStateKey(protocol)] === true
}

function toggleDetails(protocol: ActivityProtocol) {
  const key = protocolStateKey(protocol)
  if (!(key in payloads)) payloads[key] = '{}'
  expandedProtocolKey.value = expandedProtocolKey.value === key ? '' : key
}

function updatePayload(protocol: ActivityProtocol, event: Event) {
  payloads[protocolStateKey(protocol)] = (event.target as HTMLTextAreaElement).value
}

function toggleAdvanced(protocol: ActivityProtocol) {
  const key = protocolStateKey(protocol)
  if (!(key in payloads)) payloads[key] = '{}'
  advancedProtocols[key] = !advancedProtocols[key]
}

function run(protocol: ActivityProtocol) {
  if (runDisabledReason(protocol) || runStateFor(protocol).status === 'running') return
  emit('run', protocol, isAdvanced(protocol)
    ? { mode: 'advanced', payloadText: payloadFor(protocol) }
    : { mode: 'auto' })
}

function formatTime(value?: string) {
  if (!value) return '未收到'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '已收到'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function formatResult(state: ProtocolRunState) {
  if (state.status === 'error') return state.error
  if (!state.result) return ''
  const parameterLine = state.result.parameterMessage
    ? `参数：${state.result.parameterMessage}`
    : ''
  if (state.result.response === null || state.result.response === undefined) {
    return [parameterLine, state.result.message || '请求已发送'].filter(Boolean).join('\n')
  }
  return [parameterLine, JSON.stringify(state.result.response, null, 2)].filter(Boolean).join('\n\n')
}
</script>

<template>
  <AppDrawer :open="open" labelled-by="activity-title" size="wide" @close="emit('close')">
    <div v-if="activity" class="activity-detail">
      <header class="activity-heading">
        <span class="detail-medallion" :style="medallionStyle(activity.iconIndex)" aria-hidden="true"></span>
        <div class="heading-copy">
          <h2 id="activity-title">{{ activity.displayName }}</h2>
          <p>内部标识 · {{ activity.name }}</p>
          <div class="heading-status">
            <span class="heading-category">{{ activity.categoryLabel }}</span>
            <span class="status-seal">{{ activity.protocols.length }} 个功能</span>
            <span class="status-seal" :class="activity.openState === 'observed' ? '' : 'status-seal--slate'">
              {{ !user ? '请先选择账号' : activity.openState === 'observed' ? '已收到服务端数据' : '尚未检测' }}
            </span>
          </div>
        </div>
      </header>

      <div class="activity-facts">
        <span><strong>{{ activity.requestableCount }}</strong> 项可主动请求</span>
        <span><strong>{{ activity.pushOnlyCount }}</strong> 项仅接收</span>
        <span><strong>{{ activity.observedProtocolCount }}</strong> 项已观察到数据</span>
        <span>APK {{ protocolVersion.version }}.{{ protocolVersion.buildID }}</span>
      </div>

      <div class="account-notice" :class="{ 'account-notice--ready': user?.connectionState === 'running' }">
        <Radio :size="17" />
        <span v-if="!user">未选择账号；可查看所有功能，但不能发送请求。</span>
        <span v-else-if="user.connectionState !== 'running'">
          {{ user.note }} · {{ user.serverName }} 尚未就绪；请先在上方手动连接。
        </span>
        <span v-else>{{ user.note }} · {{ user.serverName }} 已连接；每次点击只发送当前这一条功能请求。</span>
      </div>

      <div class="protocol-toolbar">
        <label class="protocol-search">
          <Search :size="18" aria-hidden="true" />
          <span class="sr-only">搜索功能</span>
          <input v-model="protocolQuery" type="search" placeholder="搜索中文功能、协议标识或消息编号" />
        </label>
        <span>当前显示 {{ filteredProtocols.length }} / {{ activity.protocols.length }}</span>
      </div>

      <div class="protocol-list">
        <article
          v-for="protocol in filteredProtocols"
          :key="protocolStateKey(protocol)"
          class="protocol-item"
          :class="{
            'protocol-item--expanded': expandedProtocolKey === protocolStateKey(protocol),
            'protocol-item--observed': observationFor(protocol),
          }"
        >
          <div class="protocol-summary">
            <div class="protocol-title">
              <strong>{{ protocol.comment || '未命名功能' }}</strong>
              <code>{{ protocol.key }}</code>
            </div>
            <div class="protocol-meta">
              <span>{{ protocol.requestMethod ? '可请求' : '服务器推送' }}</span>
              <span>#{{ protocol.id }}</span>
              <span :class="riskClass(protocol.risk)">{{ riskLabel(protocol.risk) }}</span>
            </div>
            <div class="protocol-observation">
              <CircleCheck v-if="observationFor(protocol)" :size="15" />
              <Radio v-else :size="15" />
              <span>{{ formatTime(observationFor(protocol)?.receivedAt) }}</span>
            </div>
            <div class="protocol-actions">
              <button class="details-action" type="button" @click="toggleDetails(protocol)">
                <Code2 :size="16" />
                参数与响应
                <ChevronDown
                  :size="15"
                  :class="{ 'chevron-open': expandedProtocolKey === protocolStateKey(protocol) }"
                />
              </button>
              <span v-if="!protocol.requestMethod" class="receive-only">仅接收</span>
              <button
                v-else
                class="run-action"
                type="button"
                :disabled="Boolean(runDisabledReason(protocol)) || runStateFor(protocol).status === 'running'"
                :title="runDisabledReason(protocol) || `运行 ${protocol.comment}`"
                @click="run(protocol)"
              >
                <LoaderCircle v-if="runStateFor(protocol).status === 'running'" class="is-spinning" :size="16" />
                <Play v-else :size="15" />
                {{ runStateFor(protocol).status === 'running' ? '等待响应' : '运行' }}
              </button>
            </div>
          </div>

          <div v-if="expandedProtocolKey === protocolStateKey(protocol)" class="protocol-details">
            <div class="method-grid">
              <div>
                <span>请求方法</span>
                <code>{{ protocol.requestMethod || '无（服务器主动下发）' }}</code>
              </div>
              <div>
                <span>响应方法</span>
                <code>{{ protocol.responseMethod || '无独立响应' }}</code>
              </div>
              <div>
                <span>响应编号</span>
                <code>{{ protocol.responseId || '—' }}</code>
              </div>
            </div>

            <div v-if="protocol.requestMethod" class="parameter-mode">
              <div class="auto-parameter-note">
                <CircleCheck :size="17" />
                <div>
                  <strong>脚本自动取参</strong>
                  <p>默认复用原脚本模板、当前角色数据和已收到的玩法数据，不需要手填。</p>
                </div>
                <button type="button" @click="toggleAdvanced(protocol)">
                  {{ isAdvanced(protocol) ? '关闭高级参数' : '高级参数（可选）' }}
                </button>
              </div>

              <div v-if="isAdvanced(protocol)" class="payload-editor">
                <label :for="`payload-${protocolStateKey(protocol)}`">覆盖请求参数 JSON</label>
                <textarea
                  :id="`payload-${protocolStateKey(protocol)}`"
                  :value="payloadFor(protocol)"
                  spellcheck="false"
                  @input="updatePayload(protocol, $event)"
                ></textarea>
                <p>开启后将跳过自动取参，仅用于协议调试；普通运行请保持关闭。</p>
              </div>
            </div>

            <div v-if="runDisabledReason(protocol) && protocol.requestMethod" class="safety-notice">
              <AlertTriangle :size="16" />
              {{ runDisabledReason(protocol) }}
            </div>

            <div
              v-if="runStateFor(protocol).status === 'success' || runStateFor(protocol).status === 'error'"
              class="response-panel"
              :class="{ 'response-panel--error': runStateFor(protocol).status === 'error' }"
            >
              <header>
                <CircleX v-if="runStateFor(protocol).status === 'error'" :size="16" />
                <CircleCheck v-else :size="16" />
                {{ runStateFor(protocol).status === 'error' ? '请求未发送 / 执行失败' : '服务器响应' }}
              </header>
              <pre>{{ formatResult(runStateFor(protocol)) }}</pre>
            </div>
          </div>
        </article>

        <div v-if="filteredProtocols.length === 0" class="protocol-empty">没有匹配的功能</div>
      </div>

      <div class="drawer-actions">
        <button class="paper-button" type="button" @click="emit('close')">关闭</button>
      </div>
    </div>
  </AppDrawer>
</template>

<style scoped>
.activity-heading { display: flex; align-items: flex-start; gap: 18px; padding-right: 46px; }
.detail-medallion {
  flex: 0 0 auto;
  width: 74px;
  height: 74px;
  background-repeat: no-repeat;
  background-size: 300% 200%;
  border: 3px solid #c3a459;
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px #f2dfa6, 0 5px 10px rgb(67 50 20 / 24%);
}

.heading-copy { min-width: 0; }
.activity-heading h2 { margin: 0; color: #342819; font-family: var(--font-display); font-size: 31px; letter-spacing: 0.08em; }
.activity-heading p { margin: 3px 0 9px; color: #5f5b53; font-size: 14px; }
.heading-status { display: flex; flex-wrap: wrap; gap: 8px; }
.heading-category {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  padding: 3px 11px;
  color: #8b5b25;
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 700;
  background: #f2e6c9;
  border: 1px solid #c9ac70;
  border-radius: 8px;
}

.activity-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin: 20px 0 12px;
  padding: 11px 14px;
  color: #6b6256;
  font-size: 12px;
  background: rgb(238 235 216 / 70%);
  border-block: 1px solid var(--line);
}

.activity-facts strong { color: var(--jade-800); font-family: var(--font-serif); font-size: 15px; }
.account-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px;
  color: #8e572a;
  font-size: 12px;
  background: #f7ead5;
  border: 1px solid #d7b47a;
  border-radius: 7px;
}

.account-notice--ready { color: #286b58; background: #e6f0e5; border-color: #a9c4af; }
.protocol-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 10px; }
.protocol-toolbar > span { flex: 0 0 auto; color: #776d5e; font-size: 12px; }
.protocol-search {
  display: flex;
  flex: 1;
  min-height: 42px;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  color: #7c7468;
  background: rgb(255 253 245 / 88%);
  border: 1px solid #b7aa8d;
  border-radius: 7px;
}

.protocol-search:focus-within { color: var(--jade-700); border-color: var(--jade-700); box-shadow: 0 0 0 3px rgb(49 141 117 / 12%); }
.protocol-search input { width: 100%; min-width: 0; color: var(--text-strong); background: transparent; border: 0; outline: 0; }
.protocol-list { display: grid; gap: 8px; }
.protocol-item {
  overflow: hidden;
  background: rgb(255 253 245 / 66%);
  border: 1px solid #cbbd9e;
  border-radius: 8px;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.protocol-item--observed { border-left: 3px solid var(--jade-700); }
.protocol-item--expanded { border-color: #9e8855; box-shadow: 0 5px 14px rgb(74 58 28 / 10%); }
.protocol-summary {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 190px 125px auto;
  align-items: center;
  gap: 12px;
  min-height: 68px;
  padding: 9px 11px;
}

.protocol-title { min-width: 0; }
.protocol-title strong,
.protocol-title code { display: block; }
.protocol-title strong { overflow: hidden; color: #3a3023; font-family: var(--font-serif); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.protocol-title code { margin-top: 5px; overflow: hidden; color: #766e63; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.protocol-meta { display: flex; flex-wrap: wrap; gap: 5px; }
.protocol-meta span {
  padding: 2px 6px;
  color: #516560;
  font-size: 10px;
  background: #e9eee7;
  border: 1px solid #c3ccc1;
  border-radius: 4px;
}

.protocol-meta .protocol-risk--amber { color: var(--amber); background: #f7ead6; border-color: #d9bd8c; }
.protocol-meta .protocol-risk--danger { color: var(--cinnabar); background: #f6e1db; border-color: #d8aaa0; }
.protocol-observation { display: flex; align-items: center; gap: 5px; color: #777064; font-size: 10px; }
.protocol-item--observed .protocol-observation { color: var(--jade-700); }
.protocol-actions { display: flex; align-items: center; justify-content: flex-end; gap: 7px; }
.details-action,
.run-action {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 9px;
  font-family: var(--font-serif);
  font-size: 11px;
  font-weight: 750;
  border-radius: 6px;
  cursor: pointer;
}

.details-action { color: #665335; background: #f7f0dc; border: 1px solid #c8b68f; }
.run-action { min-width: 70px; color: #fff4d1; background: linear-gradient(180deg, #4b9f86, #256d5b); border: 1px solid #8c743e; }
.run-action:disabled { color: #8b8476; background: #e4e0d4; border-color: #bbb3a1; cursor: not-allowed; }
.receive-only { min-width: 70px; color: #787168; font-size: 11px; text-align: center; }
.chevron-open { transform: rotate(180deg); }
.protocol-details { padding: 13px 14px 15px; background: rgb(239 237 219 / 55%); border-top: 1px solid #d4c9ad; }
.method-grid { display: grid; grid-template-columns: 1fr 1fr 120px; gap: 10px; }
.method-grid div { min-width: 0; }
.method-grid span,
.method-grid code { display: block; }
.method-grid span { margin-bottom: 4px; color: #7a6f5f; font-size: 10px; }
.method-grid code { overflow: hidden; color: #474038; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.parameter-mode { margin-top: 12px; }
.auto-parameter-note {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 9px;
  padding: 10px 11px;
  color: #286b58;
  background: rgb(230 240 229 / 78%);
  border: 1px solid #a8c3ac;
  border-radius: 6px;
}
.auto-parameter-note strong { display: block; font-family: var(--font-serif); font-size: 12px; }
.auto-parameter-note p { margin: 2px 0 0; color: #5f7165; font-size: 10px; line-height: 1.45; }
.auto-parameter-note button {
  padding: 5px 8px;
  color: #665335;
  font-family: var(--font-serif);
  font-size: 10px;
  background: #fffaf0;
  border: 1px solid #c8b68f;
  border-radius: 5px;
  cursor: pointer;
}
.payload-editor { margin-top: 10px; }
.payload-editor label { display: block; margin-bottom: 6px; color: #4d4438; font-family: var(--font-serif); font-size: 12px; font-weight: 750; }
.payload-editor textarea {
  width: 100%;
  min-height: 90px;
  resize: vertical;
  padding: 10px;
  color: #2f332f;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  background: #fffdf6;
  border: 1px solid #b9aa8c;
  border-radius: 6px;
  outline: 0;
}

.payload-editor textarea:focus { border-color: var(--jade-700); box-shadow: 0 0 0 3px rgb(49 141 117 / 12%); }
.payload-editor p { margin: 6px 0 0; color: #7c7366; font-size: 10px; }
.safety-notice { display: flex; align-items: center; gap: 6px; margin-top: 10px; color: #9b552f; font-size: 11px; }
.response-panel { margin-top: 12px; overflow: hidden; background: #e6f0e5; border: 1px solid #9ebba7; border-radius: 6px; }
.response-panel--error { background: #f6e4df; border-color: #d4a59a; }
.response-panel header { display: flex; align-items: center; gap: 6px; padding: 7px 9px; color: #286b58; font-family: var(--font-serif); font-size: 11px; font-weight: 750; border-bottom: 1px solid rgb(68 114 89 / 18%); }
.response-panel--error header { color: var(--cinnabar); }
.response-panel pre { max-height: 260px; margin: 0; padding: 10px; overflow: auto; color: #343a35; font-size: 11px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.protocol-empty { min-height: 140px; display: grid; color: #7e7568; place-items: center; }
.drawer-actions { justify-content: flex-end; margin-top: 16px; }
.is-spinning { animation: spin 850ms linear infinite; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 820px) {
  .protocol-summary { grid-template-columns: minmax(190px, 1fr) auto; }
  .protocol-meta,
  .protocol-observation { grid-column: 1; }
  .protocol-actions { grid-column: 2; grid-row: 1 / span 3; flex-direction: column; }
  .method-grid { grid-template-columns: 1fr; }
}

@media (max-width: 560px) {
  .activity-heading { padding-right: 32px; }
  .detail-medallion { width: 58px; height: 58px; }
  .activity-heading h2 { font-size: 25px; }
  .protocol-toolbar { align-items: stretch; flex-direction: column; }
  .protocol-summary { grid-template-columns: 1fr; }
  .protocol-meta,
  .protocol-observation,
  .protocol-actions { grid-column: 1; grid-row: auto; }
  .protocol-actions { align-items: stretch; flex-direction: row; justify-content: flex-start; }
}
</style>
