<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import IncomingCallBanner from './client/IncomingCallBanner.vue'
import { useAuthStore } from '../stores/auth'
import type { NavItem } from '../types'

defineProps<{
  navItems: NavItem[]
  accent: string
  avatarColor: string
  roleLabel?: string
}>()

const auth = useAuthStore()
const router = useRouter()

const userName = computed(() => auth.user?.name ?? '')
const roleText = computed(() => (auth.user?.role === 'CONSULTANT' ? 'Consultant' : 'Client'))

const initials = computed(() =>
  userName.value
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase(),
)

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="shell" :style="{ '--accent': accent, '--avatar': avatarColor }">
    <nav class="sidebar" aria-label="Main">
      <div class="brand">
        <div class="brand-row">
          <span class="logo"><AppIcon name="logo" /></span>
          <span class="brand-name">HelpDesk</span>
        </div>
        <span v-if="roleLabel" class="role-pill">{{ roleLabel }}</span>
      </div>

      <div class="nav-links">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          exact-active-class="active"
        >
          <AppIcon :name="item.icon" class="nav-icon" />
          {{ item.label }}
          <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
        </RouterLink>
      </div>

      <div class="user-card">
        <div class="avatar">{{ initials }}</div>
        <div class="user-meta">
          <span class="user-name">{{ userName }}</span>
          <span class="user-role">{{ roleText }}</span>
        </div>
        <button type="button" class="logout" aria-label="Log out" @click="logout">
          <AppIcon name="logout" />
        </button>
      </div>
    </nav>

    <main class="content">
      <IncomingCallBanner v-if="auth.user?.role === 'CLIENT'" />
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-wrap: wrap;
}

.sidebar {
  flex: 1 1 240px;
  max-width: 100%;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  background: var(--space-blue);
  color: var(--on-dark);
}

.brand {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 8px;
}
.brand-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.logo {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--capture-yellow);
  color: var(--space-blue);
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand-name {
  font-size: 15px;
  font-weight: 600;
}
.role-pill {
  align-self: flex-start;
  height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  display: inline-flex;
  align-items: center;
}

.nav-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-link {
  height: 44px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  color: var(--on-dark-muted);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 12px;
}
.nav-link:hover {
  color: var(--on-dark);
  background: rgba(255, 255, 255, 0.05);
}
.nav-link.active {
  background: rgba(255, 255, 255, 0.1);
  color: var(--on-dark);
  font-weight: 600;
}
.nav-link.active .nav-icon {
  color: var(--accent);
}
.nav-badge {
  margin-left: auto;
  height: 20px;
  min-width: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--capture-yellow);
  color: var(--space-blue);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.user-card {
  margin-top: auto;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  gap: 10px;
}
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--avatar);
  color: var(--space-blue);
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.user-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.user-name {
  font-size: 14px;
  font-weight: 500;
}
.user-role {
  font-size: 12px;
  color: var(--on-dark-subtle);
}
.logout {
  border: none;
  background: none;
  cursor: pointer;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  color: var(--on-dark-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}
.logout:hover {
  color: var(--on-dark);
  background: rgba(255, 255, 255, 0.08);
}

.content {
  flex: 999 1 560px;
  min-width: 0;
  padding: 40px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
</style>
