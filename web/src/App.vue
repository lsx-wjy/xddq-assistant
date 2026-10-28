<script setup lang="ts">
import { onMounted, shallowRef, watch } from 'vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AutomationCenter from '@/features/automation/AutomationCenter.vue'
import OverviewDashboard from '@/features/dashboard/OverviewDashboard.vue'
import ActivityProtocols from '@/features/activities/ActivityProtocols.vue'
import LoginPage from '@/features/auth/LoginPage.vue'
import { useSession } from '@/features/auth/useSession'
import RoleProfilePage from '@/features/profile/RoleProfilePage.vue'
import RunLogsPage from '@/features/logs/RunLogsPage.vue'
import SystemSettingsPage from '@/features/settings/SystemSettingsPage.vue'
import UserManagement from '@/features/users/UserManagement.vue'

type PageKey = 'overview' | 'profile' | 'users' | 'automation' | 'activities' | 'logs' | 'settings'

const currentPage = shallowRef<PageKey>('overview')
const sessionReady = shallowRef(false)
const { session, refreshSession, logout } = useSession()

watch(() => session.value.role, role => {
  if (role === 'admin') currentPage.value = 'overview'
  if (role === 'user') {
    currentPage.value = 'profile'
  }
})

onMounted(async () => {
  await refreshSession()
  sessionReady.value = true
})
</script>

<template>
  <div v-if="!sessionReady" class="session-loading" aria-live="polite">
    <span class="session-loading__seal">寻</span>
    <p>正在确认入境凭证…</p>
  </div>
  <LoginPage v-else-if="!session.authenticated" />
  <div v-else class="app-shell">
    <AppSidebar
      v-model="currentPage"
      :is-admin="session.role === 'admin'"
      :display-name="session.displayName"
      @logout="logout"
    />
    <main class="app-main">
      <OverviewDashboard v-if="currentPage === 'overview'" @navigate="currentPage = $event" />
      <RoleProfilePage v-else-if="currentPage === 'profile'" />
      <UserManagement v-else-if="currentPage === 'users'" />
      <AutomationCenter v-else-if="currentPage === 'automation'" />
      <ActivityProtocols v-else-if="currentPage === 'activities'" />
      <RunLogsPage v-else-if="currentPage === 'logs'" />
      <SystemSettingsPage v-else />
    </main>
  </div>
</template>

<style scoped>
.session-loading {
  display: grid;
  min-height: 100dvh;
  color: #385d50;
  font-family: var(--font-serif);
  background: var(--page-background) center / cover fixed;
  place-content: center;
  place-items: center;
}

.session-loading__seal {
  display: grid;
  width: 66px;
  height: 66px;
  color: #f3e4b4;
  font-family: var(--font-display);
  font-size: 34px;
  background: #174a40;
  border: 5px double #c2a762;
  border-radius: 50%;
  box-shadow: 0 10px 30px rgb(28 59 48 / 25%);
  place-items: center;
}

.app-shell {
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  min-height: 100dvh;
  background: var(--page-background) center / cover fixed;
}

.app-main {
  min-width: 0;
  padding: 34px 36px 34px 28px;
}

@media (max-width: 980px) {
  .app-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .app-main {
    padding: 18px;
  }
}

@media (max-width: 620px) {
  .app-main {
    padding: 10px;
  }
}
</style>
