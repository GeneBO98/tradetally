<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="manual-review-title">
    <div class="flex min-h-screen items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity dark:bg-gray-900 dark:bg-opacity-75" aria-hidden="true" @click="$emit('close')"></div>

      <span class="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>

      <div class="inline-block w-full max-w-4xl transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left align-bottom shadow-xl transition-all dark:bg-gray-800 sm:my-8 sm:p-6 sm:align-middle">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 id="manual-review-title" class="text-lg font-semibold text-gray-900 dark:text-white">
              Review sell-only executions
            </h3>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              These stock sells had no matching opening buy or existing open position. Confirm each one as a short, close-only long, gifted shares with $0 basis, or ignore it.
            </p>
          </div>
          <button
            type="button"
            class="rounded-md text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:hover:text-gray-200"
            @click="$emit('close')"
          >
            <span class="sr-only">Close</span>
            <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>

        <div v-if="error" class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {{ error }}
        </div>

        <div class="mt-5 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <div
            v-for="(item, index) in items"
            :key="reviewKey(item, index)"
            class="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
          >
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-base font-semibold text-gray-900 dark:text-white">{{ item.symbol }}</p>
                  <span class="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-800">
                    Needs review
                  </span>
                </div>
                <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
                  <div>
                    <dt class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Symbol</dt>
                    <dd class="font-medium text-gray-900 dark:text-white">{{ item.symbol || 'Unknown' }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Quantity</dt>
                    <dd class="font-medium text-gray-900 dark:text-white">{{ formatQuantity(item.quantity) }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Price</dt>
                    <dd class="font-medium text-gray-900 dark:text-white">{{ formatMoney(item.price) }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Date</dt>
                    <dd class="font-medium text-gray-900 dark:text-white">{{ formatDateTime(item.datetime) }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Account</dt>
                    <dd class="font-medium text-gray-900 dark:text-white">{{ item.account_identifier || 'Unknown' }}</dd>
                  </div>
                </dl>
                <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {{ item.reason || 'No matching opening buy was found.' }}
                </p>
              </div>

              <div class="w-full shrink-0 space-y-2 md:w-72">
                <label class="flex cursor-pointer rounded-md border p-2 text-sm" :class="optionClass(item, index, 'import_as_short')">
                  <input
                    v-model="decisions[reviewKey(item, index)]"
                    class="mt-0.5 h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                    type="radio"
                    value="import_as_short"
                  >
                  <span class="ml-2">
                    <span class="block font-medium">Import as short</span>
                    <span class="block text-xs opacity-80">Use this sell as the short entry.</span>
                  </span>
                </label>

                <label class="flex cursor-pointer rounded-md border p-2 text-sm" :class="optionClass(item, index, 'import_as_close_only')">
                  <input
                    v-model="decisions[reviewKey(item, index)]"
                    class="mt-0.5 h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                    type="radio"
                    value="import_as_close_only"
                  >
                  <span class="ml-2">
                    <span class="block font-medium">{{ closeOnlyLabel(item) }}</span>
                    <span class="block text-xs opacity-80">Use same-price synthetic entry basis.</span>
                  </span>
                </label>

                <label class="flex cursor-pointer rounded-md border p-2 text-sm" :class="optionClass(item, index, 'import_as_gifted_shares')">
                  <input
                    v-model="decisions[reviewKey(item, index)]"
                    class="mt-0.5 h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                    type="radio"
                    value="import_as_gifted_shares"
                  >
                  <span class="ml-2">
                    <span class="block font-medium">Import as gifted shares</span>
                    <span class="block text-xs opacity-80">$0 basis; realized gain is proceeds minus costs.</span>
                  </span>
                </label>

                <label class="flex cursor-pointer rounded-md border p-2 text-sm" :class="optionClass(item, index, 'ignore')">
                  <input
                    v-model="decisions[reviewKey(item, index)]"
                    class="mt-0.5 h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                    type="radio"
                    value="ignore"
                  >
                  <span class="ml-2">
                    <span class="block font-medium">Ignore</span>
                    <span class="block text-xs opacity-80">Do not import this execution.</span>
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            class="inline-flex w-full justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 sm:w-auto"
            :disabled="loading"
            @click="$emit('close')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="inline-flex w-full justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            :disabled="loading || items.length === 0"
            @click="submit"
          >
            {{ loading ? 'Saving...' : 'Save Decisions' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true
  },
  items: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'submit'])
const decisions = reactive({})

function reviewKey(item, index) {
  return item.id || `${item.symbol || 'trade'}-${item.datetime || 'time'}-${index}`
}

function resetDecisions() {
  Object.keys(decisions).forEach(key => {
    delete decisions[key]
  })
  props.items.forEach((item, index) => {
    decisions[reviewKey(item, index)] = 'ignore'
  })
}

watch(
  () => [props.isOpen, props.items],
  () => {
    if (props.isOpen) resetDecisions()
  },
  { immediate: true, deep: true }
)

function optionClass(item, index, value) {
  return decisions[reviewKey(item, index)] === value
    ? 'border-primary-500 bg-primary-50 text-primary-900 dark:border-primary-500 dark:bg-primary-900/20 dark:text-primary-100'
    : 'border-gray-200 text-gray-700 hover:border-primary-300 dark:border-gray-700 dark:text-gray-300 dark:hover:border-primary-700'
}

function closeOnlyLabel(item) {
  return String(item.action || '').toLowerCase() === 'buy'
    ? 'Import as close-only short'
    : 'Import as close-only long'
}

function formatMoney(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  return number.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  })
}

function formatQuantity(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  return number.toLocaleString(undefined, {
    maximumFractionDigits: 8
  })
}

function formatDateTime(value) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleString()
}

function submit() {
  const payload = props.items.map((item, index) => ({
    action: decisions[reviewKey(item, index)] || 'ignore',
    item
  }))
  emit('submit', payload)
}
</script>
