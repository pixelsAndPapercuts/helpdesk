<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import PayoutDemo from '../../components/client/PayoutDemo.vue'
import { useAuthStore } from '../../stores/auth'
import type { IconName } from '../../types'

const auth = useAuthStore()

const firstName = computed(() => auth.user?.name.split(' ')[0] ?? '')

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
})

const steps: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'logo',
    title: 'Raise a request',
    text: 'Describe what you’re stuck on. Your consultant is notified instantly.',
  },
  {
    icon: 'video',
    title: 'Get a call',
    text: 'Your consultant calls you here. Share your screen and talk it through.',
  },
  {
    icon: 'file',
    title: 'Keep the recap',
    text: 'Afterwards you get the recording, a transcript and a summary of the call.',
  },
]
</script>

<template>
  <header class="header">
    <h1 class="page-title">{{ greeting }}, {{ firstName }}</h1>
    <p class="page-subtitle">Welcome to your HelpDesk. Here’s where you get help when you’re stuck.</p>
  </header>

  <section class="help-card" aria-labelledby="help-h">
    <h2 id="help-h">Stuck on something?</h2>
    <p>
      Raise a request and your consultant will call you, look at your screen and walk you through
      it.
    </p>
    <RouterLink :to="{ path: '/client/support', query: { new: '1' } }" class="cta">
      Raise a request
    </RouterLink>
  </section>

  <PayoutDemo />

  <section class="how" aria-labelledby="how-h">
    <h2 id="how-h" class="section-title">How it works</h2>
    <ol class="steps">
      <li v-for="(step, i) in steps" :key="step.title" class="step">
        <div class="step-head">
          <span class="step-icon"><AppIcon :name="step.icon" /></span>
          <span class="step-number">Step {{ i + 1 }}</span>
        </div>
        <h3>{{ step.title }}</h3>
        <p>{{ step.text }}</p>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.help-card {
  padding: 28px;
  border-radius: var(--radius-xl);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  color: var(--on-dark);
  background-color: var(--space-blue);
  background-image: radial-gradient(
    circle at 90% 10%,
    rgba(40, 150, 251, 0.4) 0,
    rgba(40, 150, 251, 0) 50%
  );
}
.help-card h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.help-card p {
  margin: 0;
  max-width: 520px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--on-dark-muted);
}
.cta {
  margin-top: 6px;
  height: 44px;
  padding: 0 20px;
  border-radius: var(--radius-md);
  background: var(--capture-yellow);
  color: var(--space-blue);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
.cta:hover {
  color: var(--space-blue);
  filter: brightness(0.95);
}

.how {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.step {
  padding: 20px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.step-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: #e3f1ff;
  color: var(--link);
  display: flex;
  align-items: center;
  justify-content: center;
}
.step-number {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}
.step h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.step p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}
</style>
