<script setup lang="ts">
import { shallowRef } from 'vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AutomationCenter from '@/features/automation/AutomationCenter.vue'
import OverviewDashboard from '@/features/dashboard/OverviewDashboard.vue'
import ActivityProtocols from '@/features/activities/ActivityProtocols.vue'
import RunLogsPage from '@/features/logs/RunLogsPage.vue'
import SystemSettingsPage from '@/features/settings/SystemSettingsPage.vue'
import UserManagement from '@/features/users/UserManagement.vue'

type PageKey = 'overview' | 'users' | 'automation' | 'activities' | 'logs' | 'settings'

const currentPage = shallowRef<PageKey>('overview')
</script>

<template>
  <div class="app-shell">
    <AppSidebar v-model="currentPage" />
    <main class="app-main">
      <OverviewDashboard v-if="currentPage === 'overview'" @navigate="currentPage = $event" />
      <UserManagement v-else-if="currentPage === 'users'" />
      <AutomationCenter v-else-if="currentPage === 'automation'" />
      <ActivityProtocols v-else-if="currentPage === 'activities'" />
      <RunLogsPage v-else-if="currentPage === 'logs'" />
      <SystemSettingsPage v-else />
    </main>
  </div>
</template>

<style scoped>
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
