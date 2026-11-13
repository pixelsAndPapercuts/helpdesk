<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { authApi } from '../api/auth'
import { ApiError } from '../api/http'
import { homeFor } from '../router'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import type { Role } from '../types'

const router = useRouter()
const auth = useAuthStore()
const toast = useToastStore()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const demoAccounts: { name: string; email: string; role: Role }[] = [
  { name: 'Jordan', email: 'jordan@consultant.test', role: 'CONSULTANT' },
  { name: 'Alex', email: 'alex@client.test', role: 'CLIENT' },
  { name: 'Sam', email: 'sam@client.test', role: 'CLIENT' },
]

const features = [
  { text: 'Requests reach your consultant instantly', color: '#ffd000' },
  { text: 'Screen sharing and voice in the browser', color: '#7cc0ff' },
  { text: 'Recorded only with your consent', color: '#17d94b' },
]

function fillDemo(account: (typeof demoAccounts)[number]) {
  email.value = account.email
  password.value = 'password'
  error.value = ''
}

async function onSubmit() {
  error.value = ''
  loading.value = true
  try {
    const session = await authApi.login(email.value, password.value)
    auth.setSession(session)
    toast.show(`Signed in successfully. Welcome, ${session.user.name.split(' ')[0]}!`)
    router.push(homeFor(session.user.role))
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login">
    <section class="brand-panel" aria-label="About the portal">
      <div class="brand">
        <span class="logo"><AppIcon name="logo" :size="22" /></span>
        <span class="brand-name">HelpDesk</span>
      </div>

      <div class="pitch">
        <h1>Stuck? Get a consultant on your screen in minutes.</h1>
        <p class="lead">
          Raise a request, share your screen, and get a recording, transcript and summary of every
          call afterwards.
        </p>
        <ul class="features">
          <li v-for="f in features" :key="f.text">
            <span class="check" :style="{ '--c': f.color }"><AppIcon name="check" :size="14" /></span>
            {{ f.text }}
          </li>
        </ul>
      </div>
    </section>

    <section class="form-panel" aria-labelledby="signin-h">
      <div class="form-wrap">
        <div class="heading">
          <h2 id="signin-h">Welcome back</h2>
          <p>Sign in to your account to continue.</p>
        </div>

        <form class="form" @submit.prevent="onSubmit">
          <div class="field">
            <label for="email">Email</label>
            <input id="email" v-model="email" type="email" autocomplete="email" required />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              required
            />
          </div>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <button type="submit" class="submit" :disabled="loading">
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <div class="demo">
          <span class="demo-title">Demo accounts</span>
          <div class="chips">
            <button
              v-for="a in demoAccounts"
              :key="a.email"
              type="button"
              class="chip"
              :class="{ selected: email === a.email }"
              :aria-pressed="email === a.email"
              @click="fillDemo(a)"
            >
              {{ a.name }} · {{ a.role === 'CLIENT' ? 'Client' : 'Consultant' }}
            </button>
          </div>
          <span class="demo-note">Password for all seeded users: password</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: flex;
  flex-wrap: wrap;
  background: var(--surface);
}

.brand-panel {
  flex: 1 1 520px;
  padding: 56px 64px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 48px;
  color: var(--on-dark);
  background-color: var(--space-blue);
  background-image:
    radial-gradient(circle at 85% 15%, rgba(40, 150, 251, 0.45) 0, rgba(40, 150, 251, 0) 42%),
    radial-gradient(circle at 10% 95%, rgba(23, 217, 75, 0.22) 0, rgba(23, 217, 75, 0) 38%),
    radial-gradient(circle at 70% 85%, rgba(255, 208, 0, 0.16) 0, rgba(255, 208, 0, 0) 30%),
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: auto, auto, auto, 48px 48px, 48px 48px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.logo {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--capture-yellow);
  color: var(--space-blue);
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand-name {
  font-size: 18px;
  font-weight: 600;
}

.pitch {
  margin-block: auto;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.pitch h1 {
  margin: 0;
  font-size: 48px;
  line-height: 1.15;
  font-weight: 700;
}
.lead {
  margin: 0;
  font-size: 17px;
  line-height: 1.6;
  color: var(--on-dark-muted);
}

.features {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 15px;
}
.features li {
  display: flex;
  align-items: center;
  gap: 12px;
}
.check {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: color-mix(in srgb, var(--c) 20%, transparent);
  color: var(--c);
  display: flex;
  align-items: center;
  justify-content: center;
}

.form-panel {
  flex: 1 1 480px;
  padding: 56px 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.form-wrap {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.heading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.heading h2 {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
}
.heading p {
  margin: 0;
  font-size: 15px;
  color: var(--text-muted);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field label {
  font-size: 14px;
  font-weight: 500;
}
.field input {
  height: 48px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 15px;
  color: var(--text);
}
.field input:focus-visible {
  outline: 2px solid var(--nurture-blue);
  outline-offset: 1px;
}

.error {
  margin: 0;
  font-size: 14px;
  color: #b42318;
}

.submit {
  height: 48px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--capture-yellow);
  color: var(--space-blue);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.submit:hover {
  filter: brightness(0.95);
}

.demo {
  padding: 16px;
  border-radius: 12px;
  background: #f2f8ff;
  border: 1px solid #d6e8fc;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.demo-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.chip.selected {
  background: var(--space-blue);
  border-color: var(--space-blue);
  color: var(--on-dark);
}
.chip:hover {
  filter: brightness(0.96);
}
.demo-note {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
