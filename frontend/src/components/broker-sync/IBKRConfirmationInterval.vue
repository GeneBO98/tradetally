<template>
  <div>
    <label :for="id" class="label">Confirmation sync interval (minutes)</label>
    <input :id="id" :value="modelValue" @input="emit('update:modelValue', $event.target.value === '' ? '' : Number($event.target.value))"
      type="number" min="15" max="1440" step="15" required class="input" :aria-describedby="`${id}-help`" :aria-invalid="!validConfirmationInterval(modelValue)" />
    <p :id="`${id}-help`" class="mt-1 text-sm text-gray-500 dark:text-gray-400">Choose 15 minutes to 24 hours in 15-minute steps. For hourly checks, enter 60. This applies when Auto-Sync is enabled.</p>
    <p v-if="!validConfirmationInterval(modelValue)" class="mt-1 text-sm text-primary-700 dark:text-primary-300" role="status">Enter a whole multiple of 15 between 15 and 1440.</p>
  </div>
</template>

<script setup>
import { validConfirmationInterval } from '@/utils/ibkrConfirmationInterval'
defineProps({ modelValue: { type: [Number, String], default: 15 }, id: { type: String, required: true } })
const emit = defineEmits(['update:modelValue'])
</script>
