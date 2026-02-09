<template>
  <div class="relative" ref="wrapperRef">
    <div class="relative">
      <input
        :id="inputId"
        ref="inputRef"
        type="text"
        :value="modelValue"
        @input="onInput"
        @keydown="onKeydown"
        @focus="onFocus"
        @blur="onBlur"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        :class="['input uppercase', inputClass]"
        autocomplete="off"
      />
      <div
        v-if="isLoading"
        class="absolute right-3 top-1/2 -translate-y-1/2"
      >
        <div class="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent"></div>
      </div>
    </div>

    <transition
      enter-active-class="transition ease-out duration-100"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-75"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <ul
        v-if="showDropdown"
        class="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-auto"
        role="listbox"
      >
        <li
          v-if="suggestions.length === 0 && !isLoading && queryText.length >= 1"
          class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400"
        >
          No symbols found
        </li>
        <li
          v-for="(item, index) in suggestions"
          :key="item.symbol"
          @mousedown.prevent="selectItem(item)"
          @mouseenter="highlightedIndex = index"
          :class="[
            'px-3 py-2 cursor-pointer text-sm flex items-center justify-between',
            index === highlightedIndex
              ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
              : 'text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
          ]"
          role="option"
          :aria-selected="index === highlightedIndex"
        >
          <div class="flex items-center space-x-2 min-w-0">
            <span class="font-medium flex-shrink-0">{{ item.symbol }}</span>
            <span
              v-if="item.company_name"
              class="text-gray-500 dark:text-gray-400 truncate text-xs"
            >
              {{ item.company_name }}
            </span>
          </div>
          <span
            v-if="item.source === 'user_trades'"
            class="text-xs bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded flex-shrink-0 ml-2"
          >
            Traded
          </span>
        </li>
      </ul>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import api from '@/services/api'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: 'e.g., AAPL'
  },
  required: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  inputClass: {
    type: String,
    default: ''
  },
  id: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue', 'select'])

const inputRef = ref(null)
const wrapperRef = ref(null)
const suggestions = ref([])
const isLoading = ref(false)
const isOpen = ref(false)
const highlightedIndex = ref(-1)
const queryText = ref('')
const isFocused = ref(false)

let debounceTimer = null

const inputId = computed(() => props.id || `symbol-autocomplete-${Math.random().toString(36).slice(2, 9)}`)

const showDropdown = computed(() => {
  return isOpen.value && isFocused.value && queryText.value.length >= 1
})

function onInput(e) {
  const value = e.target.value.toUpperCase()
  emit('update:modelValue', value)
  queryText.value = value
  highlightedIndex.value = -1

  if (debounceTimer) clearTimeout(debounceTimer)

  if (!value || value.length < 1) {
    suggestions.value = []
    isOpen.value = false
    return
  }

  debounceTimer = setTimeout(() => {
    fetchSuggestions(value)
  }, 300)
}

async function fetchSuggestions(q) {
  if (!q) return
  isLoading.value = true
  try {
    const { data } = await api.get('/symbols/search', { params: { q } })
    suggestions.value = data.results || []
    isOpen.value = true
  } catch (err) {
    console.warn('[SYMBOL_AUTOCOMPLETE] Search failed:', err.message)
    suggestions.value = []
  } finally {
    isLoading.value = false
  }
}

function selectItem(item) {
  emit('update:modelValue', item.symbol)
  emit('select', item)
  queryText.value = item.symbol
  isOpen.value = false
  highlightedIndex.value = -1
}

function onKeydown(e) {
  if (!showDropdown.value) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (highlightedIndex.value < suggestions.value.length - 1) {
      highlightedIndex.value++
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (highlightedIndex.value > 0) {
      highlightedIndex.value--
    }
  } else if (e.key === 'Enter') {
    if (highlightedIndex.value >= 0 && highlightedIndex.value < suggestions.value.length) {
      e.preventDefault()
      selectItem(suggestions.value[highlightedIndex.value])
    }
    // If no item highlighted, let Enter propagate normally for form submission
  } else if (e.key === 'Escape') {
    isOpen.value = false
    highlightedIndex.value = -1
  }
}

function onFocus() {
  isFocused.value = true
  if (queryText.value.length >= 1 && suggestions.value.length > 0) {
    isOpen.value = true
  }
}

function onBlur() {
  // Delay to allow mousedown on suggestion to fire first
  setTimeout(() => {
    isFocused.value = false
    isOpen.value = false
  }, 150)
}

function handleClickOutside(e) {
  if (wrapperRef.value && !wrapperRef.value.contains(e.target)) {
    isOpen.value = false
  }
}

// Sync queryText when modelValue changes externally
watch(() => props.modelValue, (val) => {
  queryText.value = val || ''
})

onMounted(() => {
  queryText.value = props.modelValue || ''
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>
