import { createRouter, createWebHistory } from 'vue-router'
import type { NavItem, Role } from './types'
import { useAuthStore } from './stores/auth'
import AppShell from './components/AppShell.vue'
import Login from './views/Login.vue'
import ClientHome from './views/client/ClientHome.vue'
import ClientSupport from './views/client/ClientSupport.vue'
import ConsultantHelpRequests from './views/consultant/ConsultantHelpRequests.vue'
import CallView from './views/CallView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    role?: Role
  }
}

export function homeFor(role: Role) {
  return role === 'CLIENT' ? '/client' : '/consultant'
}

const clientNav: NavItem[] = [
  { label: 'Home', to: '/client', icon: 'home' },
  { label: 'Support', to: '/client/support', icon: 'support' },
]

const consultantNav: NavItem[] = [
  { label: 'Requests', to: '/consultant', icon: 'inbox' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: Login, meta: { public: true } },

    {
      path: '/client',
      component: AppShell,
      meta: { role: 'CLIENT' },
      props: {
        navItems: clientNav,
        accent: 'var(--capture-yellow)',
        avatarColor: 'var(--nurture-blue)',
      },
      children: [
        { path: '', component: ClientHome },
        { path: 'support', component: ClientSupport },
      ],
    },
    {
      path: '/consultant',
      component: AppShell,
      meta: { role: 'CONSULTANT' },
      props: {
        navItems: consultantNav,
        accent: 'var(--close-green)',
        avatarColor: 'var(--close-green)',
        roleLabel: 'Consultant workspace',
      },
      children: [
        { path: '', component: ConsultantHelpRequests },
      ],
    },

    { path: '/call/:callId', component: CallView },

    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.public) return auth.user ? homeFor(auth.user.role) : true

  if (!auth.user) return '/login'

  if (to.meta.role && to.meta.role !== auth.user.role) return homeFor(auth.user.role)

  return true
})
