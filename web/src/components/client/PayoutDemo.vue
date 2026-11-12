<script setup lang="ts">
import { ref } from 'vue'

// Demo only: the payout always fails, to give the client something to raise a request about.
const recipients = ['Sharma Traders', 'Kumar Logistics', 'Bright Studio']
const recipient = ref(recipients[0])
const amount = ref('12500')
const busy = ref(false)
const error = ref<{ code: string; ref: string } | null>(null)

async function createPayout() {
  busy.value = true
  error.value = null
  await new Promise((r) => setTimeout(r, 1200))
  busy.value = false
  error.value = {
    code: 'PAYOUT_ACCOUNT_UNVERIFIED',
    ref: `po_${Math.random().toString(36).slice(2, 10)}`,
  }
}
</script>

<template>
  <section class="payout" aria-labelledby="payout-h">
    <div class="head">
      <h2 id="payout-h">New payout</h2>
      <span class="badge">Sandbox</span>
    </div>

    <form class="form" @submit.prevent="createPayout">
      <label>
        <span>Recipient</span>
        <select v-model="recipient" :disabled="busy">
          <option v-for="r in recipients" :key="r">{{ r }}</option>
        </select>
      </label>
      <label>
        <span>Amount (₹)</span>
        <input v-model="amount" inputmode="numeric" :disabled="busy" />
      </label>
      <button type="submit" :disabled="busy || !amount">
        {{ busy ? 'Creating…' : 'Create payout' }}
      </button>
    </form>

    <div v-if="error" class="error" role="alert">
      <strong>Payout failed</strong>
      <span>We couldn’t send ₹{{ Number(amount).toLocaleString('en-IN') }} to {{ recipient }}.</span>
      <code>{{ error.code }} · {{ error.ref }}</code>
    </div>
  </section>
</template>

<style scoped>
.payout {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.badge {
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: #edf1f6;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
}
.form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}
label {
  flex: 1 1 180px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}
select,
input {
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 400;
}
select {
  padding: 0 40px 0 14px;
  appearance: none;
  background: var(--surface)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%234a5b6e' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")
    no-repeat right 14px center;
  cursor: pointer;
}
input {
  padding: 0 14px;
}
button {
  height: 40px;
  padding: 0 18px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--space-blue);
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.error {
  padding: 12px 14px;
  border: 1px solid #f5c2bc;
  border-radius: var(--radius-md);
  background: #fdecea;
  color: #b42318;
  font-size: 13px;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.error code {
  margin-top: 4px;
  font-size: 12px;
  color: #7a271a;
}
</style>
