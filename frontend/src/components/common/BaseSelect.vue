<template>
  <div class="relative" :data-base-select="uid">
    <button
      ref="buttonRef"
      type="button"
      :disabled="disabled"
      @click.stop="toggleOpen"
      class="input w-full text-left flex items-center justify-between"
      :class="{ 'opacity-60 cursor-not-allowed': disabled }"
    >
      <span class="truncate" :class="(selectedOption || hasValue) ? '' : 'text-gray-400 dark:text-gray-500'">
        {{ displayLabel }}
      </span>
      <svg
        class="h-4 w-4 text-gray-400 flex-shrink-0 ml-2 transition-transform duration-200"
        :class="{ 'rotate-180': open }"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Teleported to body so the panel is never clipped by overflow ancestors. -->
    <Teleport to="body">
      <div
        v-if="open"
        :data-base-select-panel="uid"
        :style="panelStyle"
        class="bg-white dark:bg-gray-800 shadow-lg max-h-72 rounded-md text-base ring-1 ring-black ring-opacity-5 overflow-hidden focus:outline-none flex flex-col"
        style="z-index: 9999"
      >
        <!-- Search (auto-shown for longer lists) -->
        <div v-if="showSearch" class="p-2 border-b border-gray-200 dark:border-gray-600">
          <input
            ref="searchInput"
            v-model="search"
            type="text"
            :placeholder="`Search ${noun}...`"
            class="input text-sm py-1.5"
            @click.stop
            @keydown.enter.prevent="selectFirstMatch"
            @keydown.esc.stop="open = false"
          />
        </div>

        <!-- Options -->
        <div class="overflow-auto py-1 flex-1">
          <button
            v-if="placeholder"
            type="button"
            @click="selectClear"
            class="flex items-center w-full px-3 py-2 text-sm text-left"
            :class="!selectedOption && !hasValue ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'"
          >
            {{ placeholder }}
          </button>

          <template v-for="(group, gi) in filteredGroups" :key="`g-${gi}`">
            <div v-if="group.label" class="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {{ group.label }}
            </div>
            <button
              v-for="opt in group.options"
              :key="String(opt.value)"
              type="button"
              :disabled="opt.disabled"
              @click="select(opt.value)"
              class="flex items-center justify-between w-full px-3 py-2 text-sm text-left"
              :class="rowClass(opt)"
            >
              <span class="truncate">{{ opt.label }}</span>
              <svg v-if="isSelected(opt.value)" class="h-4 w-4 flex-shrink-0 ml-2 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </template>

          <div v-if="filteredOptions.length === 0" class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
            {{ emptyText }}
          </div>
        </div>

        <!-- Optional add / manage actions (used by the strategy/setup dropdowns) -->
        <div v-if="addLabel || (manageLabel && showManage)" class="border-t border-gray-200 dark:border-gray-600 py-1">
          <button
            v-if="addLabel"
            type="button"
            @click="onAdd"
            class="flex items-center w-full px-3 py-2 text-sm text-primary-600 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            {{ addLabel }}
          </button>
          <button
            v-if="manageLabel && showManage"
            type="button"
            @click="onManage"
            class="flex items-center w-full px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {{ manageLabel }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

let counter = 0

const props = defineProps({
  modelValue: { type: [String, Number, Boolean, null], default: '' },
  // Each option may be a primitive (string/number) or an object.
  // Objects use `valueKey`/`labelKey` (defaults: value/label) plus optional `disabled`.
  options: { type: Array, default: () => [] },
  valueKey: { type: String, default: 'value' },
  labelKey: { type: String, default: 'label' },
  // When set, renders a leading "empty" row that clears the selection.
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  searchable: { type: Boolean, default: true },
  emptyText: { type: String, default: 'No matches' },
  noun: { type: String, default: 'options' },
  // Optional footer actions (strategy/setup dropdowns)
  addLabel: { type: String, default: '' },
  manageLabel: { type: String, default: '' },
  showManage: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'add', 'manage', 'change'])

const uid = `bs-${++counter}`
const open = ref(false)
const search = ref('')
const searchInput = ref(null)
const buttonRef = ref(null)
const panelStyle = ref({})

function normalizeOption(opt) {
  if (opt !== null && typeof opt === 'object') {
    return {
      value: opt[props.valueKey],
      label: String(opt[props.labelKey] ?? opt[props.valueKey] ?? ''),
      disabled: !!opt.disabled
    }
  }
  return { value: opt, label: String(opt), disabled: false }
}

// An option is a group when it has a nested `options` array, enabling
// <optgroup>-style headers. Otherwise the list is flat (one unlabeled group).
const isGrouped = computed(() =>
  props.options.some(o => o !== null && typeof o === 'object' && Array.isArray(o.options))
)

const renderGroups = computed(() => {
  if (!isGrouped.value) {
    return [{ label: null, options: props.options.map(normalizeOption) }]
  }
  return props.options.map(g => ({
    label: g.label ?? null,
    options: (g.options || []).map(normalizeOption)
  }))
})

const flatOptions = computed(() => renderGroups.value.flatMap(g => g.options))

const hasValue = computed(() =>
  props.modelValue !== '' && props.modelValue !== null && props.modelValue !== undefined
)

const selectedOption = computed(() =>
  flatOptions.value.find(o => o.value === props.modelValue) || null
)

const displayLabel = computed(() => {
  if (selectedOption.value) return selectedOption.value.label
  if (hasValue.value) return String(props.modelValue)
  return props.placeholder
})

const showSearch = computed(() => props.searchable && flatOptions.value.length > 7)

const filteredGroups = computed(() => {
  const q = search.value.trim().toLowerCase()
  return renderGroups.value
    .map(g => ({
      label: g.label,
      options: q ? g.options.filter(o => o.label.toLowerCase().includes(q)) : g.options
    }))
    .filter(g => g.options.length > 0)
})

const filteredOptions = computed(() => filteredGroups.value.flatMap(g => g.options))

function isSelected(value) {
  return value === props.modelValue
}

function rowClass(opt) {
  if (opt.disabled) return 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
  return isSelected(opt.value)
    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
    : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
}

function computePosition() {
  const el = buttonRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const panelMax = 288 // matches max-h-72
  const openUp = spaceBelow < Math.min(panelMax, 260) && rect.top > spaceBelow
  panelStyle.value = {
    position: 'fixed',
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    ...(openUp
      ? { bottom: `${window.innerHeight - rect.top + 4}px`, maxHeight: `${Math.min(panelMax, rect.top - 8)}px` }
      : { top: `${rect.bottom + 4}px`, maxHeight: `${Math.min(panelMax, spaceBelow - 8)}px` })
  }
}

async function toggleOpen() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    search.value = ''
    computePosition()
    await nextTick()
    searchInput.value?.focus()
  }
}

function select(value) {
  const next = value === null ? '' : value
  emit('update:modelValue', next)
  emit('change', next)
  open.value = false
}

function selectFirstMatch() {
  const first = filteredOptions.value.find(o => !o.disabled)
  if (first) select(first.value)
}

function onAdd() {
  open.value = false
  emit('add')
}

function onManage() {
  open.value = false
  emit('manage')
}

function handleClickOutside(event) {
  const inWrapper = event.target.closest(`[data-base-select="${uid}"]`)
  const inPanel = event.target.closest(`[data-base-select-panel="${uid}"]`)
  if (!inWrapper && !inPanel && open.value) open.value = false
}

function onReposition() {
  if (open.value) computePosition()
}

watch(open, (isOpen) => {
  if (isOpen) {
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
  } else {
    window.removeEventListener('scroll', onReposition, true)
    window.removeEventListener('resize', onReposition)
  }
})

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', onReposition, true)
  window.removeEventListener('resize', onReposition)
})
</script>
