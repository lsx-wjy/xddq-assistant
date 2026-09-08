<script setup lang="ts">
import { reactive, shallowRef, watch } from 'vue'
import { CheckCircle2, Save, Settings2 } from '@lucide/vue'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import { useDefaultUserSelection } from '@/features/users/useDefaultUserSelection'
import { useUsers } from '@/features/users/useUsers'
import type { UserRecord } from '@/features/users/types'

const { users, updateUser } = useUsers()
const settings = reactive({ autoReconnect: false, persistSnapshots: false, allowCombat: false, allowPurchase: false })
const { selectedUserId, selectedUser } = useDefaultUserSelection(users)
const saving = shallowRef(false)
const saveMessage = shallowRef('')

watch(selectedUser, user => {
  settings.autoReconnect = user?.autoReconnect ?? false
  settings.persistSnapshots = user?.persistSnapshots ?? false
  settings.allowCombat = user?.allowCombat ?? false
  settings.allowPurchase = user?.allowPurchase ?? false
}, { immediate: true })

function toDraft(user: UserRecord) {
  return { note: user.note, account: user.account, password: '', serverName: user.serverName, serverId: user.serverId, selectedActivities: [...user.selectedActivities], ...settings }
}

async function save() {
  const user = selectedUser.value
  if (!user || saving.value) return
  saving.value = true
  try { await updateUser(user.id, toDraft(user)); saveMessage.value = '系统设置已保存。' } catch (error) { saveMessage.value = error instanceof Error ? error.message : '保存失败' } finally { saving.value = false }
}
</script>

<template>
  <section class="page-panel"><div class="page-content"><header class="page-header"><div><h1 class="page-title">系统设置</h1><p class="page-subtitle">管理本地运行策略；所有变更都按账号与区服独立保存</p></div></header>
    <section class="settings-panel"><div class="setting-account"><Settings2 :size="20" /><label for="settings-user">配置账号</label><select id="settings-user" v-model="selectedUserId" class="field-control"><option value="">请选择用户</option><option v-for="user in users" :key="user.id" :value="user.id">{{ user.note }} · {{ user.serverName }}{{ user.serverId }}服</option></select></div>
      <template v-if="selectedUser"><div class="setting-row"><div><strong>断线后自动重连</strong><small>只对已经成功连接过的账号生效；505 限制时不会重连。</small></div><ToggleSwitch v-model="settings.autoReconnect" label="自动重连" /></div><div class="setting-row"><div><strong>保存玩法数据快照</strong><small>保存收到的玩法数据，便于后续查看开放状态。</small></div><ToggleSwitch v-model="settings.persistSnapshots" label="保存快照" /></div><div class="setting-row"><div><strong>允许战斗操作</strong><small>未开启时，自动任务队列会跳过战斗类功能。</small></div><ToggleSwitch v-model="settings.allowCombat" label="允许战斗" /></div><div class="setting-row"><div><strong>允许购买与交易</strong><small>未开启时，自动任务队列会跳过购买、交易和消耗类功能。</small></div><ToggleSwitch v-model="settings.allowPurchase" label="允许购买与交易" /></div><footer><span v-if="saveMessage"><CheckCircle2 :size="16" />{{ saveMessage }}</span><button class="jade-button" type="button" :disabled="saving" @click="save"><Save :size="18" />{{ saving ? '保存中' : '保存设置' }}</button></footer></template>
      <p v-else class="settings-empty">请选择用户后再调整系统设置。</p>
    </section>
    <aside class="storage-note"><strong>本地数据</strong><span>用户、区服、勾选任务和系统设置保存在本机 SQLite 数据库中，不会自动连接账号。</span></aside>
  </div></section>
</template>

<style scoped>
.settings-panel { overflow: hidden; border: 1px solid #cbbd9e; border-radius: 9px; }.setting-account { display: grid; grid-template-columns: auto auto minmax(220px, 1fr); gap: 10px; align-items: center; padding: 14px; color: #43655a; background: #e9f1e8; border-bottom: 1px solid #bacbb7; }.setting-account label { font-family: var(--font-serif); font-weight: 800; }.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; min-height: 79px; padding: 13px 16px; border-bottom: 1px solid #e1d8c6; }.setting-row strong,.setting-row small { display: block; }.setting-row strong { color: #45392b; font-family: var(--font-serif); font-size: 15px; }.setting-row small { margin-top: 4px; color: #7b7162; font-size: 11px; }.settings-panel footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 16px; background: #f3eee1; }.settings-panel footer span { display: flex; align-items: center; gap: 6px; color: #35705b; font-size: 12px; }.settings-empty { margin: 0; padding: 34px; color: #7e7364; text-align: center; }.storage-note { display: grid; gap: 4px; margin-top: 15px; padding: 13px 15px; color: #5d695f; background: rgb(239 244 235 / 70%); border: 1px solid #bfceb9; border-radius: 8px; }.storage-note strong { color: #375f50; font-family: var(--font-serif); }.storage-note span { font-size: 12px; line-height: 1.6; }
@media (max-width: 620px) { .setting-account { grid-template-columns: auto 1fr; }.setting-account select { grid-column: 1 / -1; }.setting-row { align-items: flex-start; flex-direction: column; gap: 10px; }.settings-panel footer { align-items: flex-start; flex-direction: column; } }
</style>
