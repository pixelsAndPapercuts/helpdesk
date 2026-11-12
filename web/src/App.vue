<script setup lang="ts">
import AppToast from './components/AppToast.vue'
import MiniCall from './components/MiniCall.vue'
</script>

<template>
  <RouterView />
  <MiniCall />
  <AppToast />
</template>
