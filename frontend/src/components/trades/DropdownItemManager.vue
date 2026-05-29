<template>
  <div
    v-if="show"
    class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
    @click.self="close"
  >
    <div class="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white dark:bg-gray-800">
      <div class="flex justify-between items-center mb-2">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">{{ title }}</h3>
        <button @click="close" class="text-gray-400 hover:text-gray-500">
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Hidden items stay on existing trades but are removed from the dropdowns to keep them clean.
      </p>

      <div class="space-y-2 max-h-72 overflow-y-auto">
        <div
          v-for="item in items"
          :key="item.name"
          class="flex items-center justify-between p-2 rounded border border-gray-200 dark:border-gray-600"
        >
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <span
              class="text-sm truncate"
              :class="isHidden(item.name) ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-white'"
            >{{ item.name }}</span>
            <span class="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
              {{ item.count }} {{ item.count === 1 ? 'trade' : 'trades' }}
            </span>
          </div>
          <button
            @click="$emit('toggle', item.name)"
            type="button"
            class="ml-2 flex-shrink-0 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            :class="isHidden(item.name) ? 'text-gray-400 dark:text-gray-500' : 'text-primary-600 dark:text-primary-400'"
            :title="isHidden(item.name) ? 'Show in dropdowns' : 'Hide from dropdowns'"
          >
            <!-- Eye (visible) -->
            <svg v-if="!isHidden(item.name)" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <!-- Eye-off (hidden) -->
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          </button>
        </div>

        <div v-if="items.length === 0" class="text-center text-gray-500 dark:text-gray-400 py-8">
          Nothing to manage yet.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: 'Manage' },
  items: { type: Array, default: () => [] }, // [{ name, count }]
  hidden: { type: Array, default: () => [] } // hidden names
})

const emit = defineEmits(['update:show', 'toggle'])

function isHidden(name) {
  return props.hidden.includes(name)
}

function close() {
  emit('update:show', false)
}
</script>
