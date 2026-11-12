<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseModal from '../BaseModal.vue'
import { helpRequestsApi } from '../../api/helpRequests'
import { ApiError } from '../../api/http'
import type { HelpRequest } from '../../types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; created: [request: HelpRequest] }>()

const TITLE_MAX = 120
const DESCRIPTION_MAX = 2000

const title = ref('')
const description = ref('')
const submitting = ref(false)
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    title.value = ''
    description.value = ''
    error.value = ''
  },
)

async function onSubmit() {
  error.value = ''
  submitting.value = true
  try {
    const request = await helpRequestsApi.create({
      title: title.value.trim(),
      description: description.value.trim(),
    })
    emit('created', request)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    title="Raise a request"
    subtitle="Your consultant is notified right away."
    @close="emit('close')"
  >
    <form class="form" @submit.prevent="onSubmit">
      <div class="field">
        <label for="request-title">Title</label>
        <input
          id="request-title"
          v-model="title"
          type="text"
          placeholder="What are you stuck on?"
          :maxlength="TITLE_MAX"
          required
          autofocus
        />
      </div>

      <div class="field">
        <div class="label-row">
          <label for="request-description">Description</label>
          <span class="count">{{ description.length }}/{{ DESCRIPTION_MAX }}</span>
        </div>
        <textarea
          id="request-description"
          v-model="description"
          rows="5"
          placeholder="Steps you tried, error messages, which screen…"
          :maxlength="DESCRIPTION_MAX"
          required
        />
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <div class="actions">
        <button type="button" class="btn secondary" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn primary" :disabled="submitting">
          {{ submitting ? 'Submitting…' : 'Submit request' }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.label-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
label {
  font-size: 14px;
  font-weight: 500;
}
.count {
  font-size: 12px;
  color: var(--text-muted);
}
input,
textarea {
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 15px;
  color: var(--text);
}
input {
  height: 48px;
}
textarea {
  padding: 12px 14px;
  resize: vertical;
}
input:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--nurture-blue);
  outline-offset: 1px;
}

.error {
  margin: 0;
  font-size: 14px;
  color: #b42318;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
.btn {
  height: 44px;
  padding: 0 20px;
  border-radius: var(--radius-md);
  font-size: 14px;
  cursor: pointer;
  color: var(--text);
}
.btn.secondary {
  border: 1px solid var(--border-strong);
  background: var(--surface);
  font-weight: 500;
}
.btn.primary {
  border: none;
  background: var(--capture-yellow);
  font-weight: 600;
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
