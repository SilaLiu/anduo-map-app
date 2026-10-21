<script setup lang="ts">
defineProps<{ level: string }>();
</script>

<template>
  <svg
    viewBox="0 0 180 210"
    role="img"
    :aria-label="`${level}图标`"
    fill="none"
    stroke="currentColor"
    stroke-width="6"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <template v-if="level === '连' || level === '排'">
      <path d="M90 15 V95 L15 173 H165 L90 95 M28 199 H152" />
      <path v-if="level === '连'" d="M72 47 H108 M72 67 H108" />
      <path v-else d="M72 59 H108" />
    </template>
    <template v-else-if="level === '班'">
      <path d="M90 15 V121 M56 59 H124 M56 199 H124" />
      <circle cx="90" cy="147" r="36" />
    </template>
  </svg>
</template>
