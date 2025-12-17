<template>
  <div class="relative">
    <!-- Toggle Button -->
    <button
      ref="buttonRef"
      @click="toggleMenu"
      class="inline-flex items-center justify-center p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
      title="Customize columns"
    >
      <AdjustmentsHorizontalIcon class="h-4 w-4" />
    </button>

    <!-- Dropdown Menu with Teleport -->
    <Teleport to="body">
      <transition
        enter-active-class="transition ease-out duration-100"
        enter-from-class="transform opacity-0 scale-95"
        enter-to-class="transform opacity-100 scale-100"
        leave-active-class="transition ease-in duration-75"
        leave-from-class="transform opacity-100 scale-100"
        leave-to-class="transform opacity-0 scale-95"
      >
        <div
          v-if="showMenu"
          ref="menuRef"
          :style="dropdownStyle"
          class="fixed w-full max-w-sm sm:w-96 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-[9999] flex flex-col overflow-hidden"
        >
          <!-- Header (Fixed) -->
          <div class="p-4 flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium text-gray-900 dark:text-white">Customize Columns</h3>
              <button
                @click="resetToDefault"
                class="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
              >
                Reset to default
              </button>
            </div>
          </div>

          <!-- Column List (Scrollable) -->
          <div class="overflow-y-auto flex-1 p-4">
            <div class="space-y-2">
            <div
              v-for="(column, index) in localColumns"
              :key="column.key"
              :draggable="true"
              @dragstart="handleDragStart(index)"
              @dragover.prevent
              @drop="handleDrop(index)"
              @dragend="handleDragEnd"
              :class="[
                'flex items-center justify-between p-2 rounded cursor-move transition-colors',
                draggedIndex === index ? 'opacity-50' : '',
                'hover:bg-gray-50 dark:hover:bg-gray-700'
              ]"
            >
              <div class="flex items-center space-x-3">
                <!-- Drag Handle -->
                <Bars3Icon class="h-4 w-4 text-gray-400" />
                
                <!-- Checkbox -->
                <input
                  type="checkbox"
                  v-model="column.visible"
                  @change="updateColumns"
                  :disabled="isRequiredColumn(column.key)"
                  class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded disabled:opacity-50"
                />
                
                <!-- Column Name -->
                <label class="text-sm text-gray-700 dark:text-gray-300 select-none">
                  {{ column.label }}
                  <span v-if="isRequiredColumn(column.key)" class="text-xs text-gray-400 ml-1">(required)</span>
                </label>
              </div>

              <!-- Column Width Selector (for visible columns) -->
              <div v-if="column.visible && !isRequiredColumn(column.key)" class="flex items-center space-x-2">
                <select
                  v-model="column.width"
                  @change="updateColumns"
                  class="text-xs border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-300"
                >
                  <option value="auto">Auto</option>
                  <option value="sm">Small</option>
                  <option value="md">Medium</option>
                  <option value="lg">Large</option>
                </select>
              </div>
            </div>
            </div>
          </div>

          <!-- Quick Actions & Buttons (Sticky Footer) -->
          <div class="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
            <div class="flex items-center justify-between text-xs mb-4">
              <button
                @click="selectAll"
                class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
              >
                Select all
              </button>
              <button
                @click="deselectAll"
                class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
              >
                Deselect all
              </button>
            </div>

            <!-- Apply/Cancel Buttons -->
            <div class="flex justify-end space-x-2">
              <button
                @click="cancel"
                class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                @click="apply"
                class="px-3 py-2 text-sm text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { AdjustmentsHorizontalIcon } from '@heroicons/vue/24/outline'
import { Bars3Icon } from '@heroicons/vue/24/solid'

const props = defineProps({
  columns: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['update:columns'])

// Refs
const buttonRef = ref(null)
const menuRef = ref(null)
const dropdownStyle = ref({})

// Default column configuration
const defaultColumns = [
  { key: 'checkbox', label: 'Select', visible: true, width: 'auto', required: true },
  { key: 'symbol', label: 'Symbol', visible: true, width: 'auto', required: true },
  { key: 'date', label: 'Date', visible: true, width: 'auto' },
  { key: 'entryTime', label: 'Entry Time', visible: false, width: 'auto' },
  { key: 'side', label: 'Side', visible: true, width: 'auto' },
  { key: 'entry', label: 'Entry', visible: true, width: 'auto' },
  { key: 'exit', label: 'Exit', visible: true, width: 'auto' },
  { key: 'pnl', label: 'P&L', visible: true, width: 'auto' },
  { key: 'confidence', label: 'Confidence', visible: true, width: 'auto' },
  { key: 'quality', label: 'Quality', visible: true, width: 'auto' },
  { key: 'sector', label: 'Sector', visible: true, width: 'auto' },
  { key: 'status', label: 'Status', visible: true, width: 'auto' },
  { key: 'comments', label: 'Comments', visible: true, width: 'auto' },
  { key: 'quantity', label: 'Quantity', visible: false, width: 'auto' },
  { key: 'commission', label: 'Commission', visible: false, width: 'auto' },
  { key: 'fees', label: 'Fees', visible: false, width: 'auto' },
  { key: 'strategy', label: 'Strategy', visible: true, width: 'auto' },
  { key: 'broker', label: 'Broker', visible: false, width: 'auto' },
  { key: 'tags', label: 'Tags', visible: false, width: 'auto' },
  { key: 'notes', label: 'Notes', visible: false, width: 'auto' },
  { key: 'holdTime', label: 'Hold Time', visible: false, width: 'auto' },
  { key: 'roi', label: 'ROI %', visible: false, width: 'auto' },
  { key: 'stopLoss', label: 'Stop Loss', visible: false, width: 'auto' },
  { key: 'takeProfit', label: 'Take Profit', visible: false, width: 'auto' },
  { key: 'rValue', label: 'R-Multiple', visible: false, width: 'auto' },
  { key: 'instrumentType', label: 'Instrument Type', visible: false, width: 'auto' },
  { key: 'underlyingSymbol', label: 'Underlying Symbol', visible: false, width: 'auto' },
  { key: 'optionType', label: 'Option Type', visible: false, width: 'auto' },
  { key: 'strikePrice', label: 'Strike Price', visible: false, width: 'auto' },
  { key: 'expirationDate', label: 'Expiration Date', visible: false, width: 'auto' },
  { key: 'contractSize', label: 'Contract Size', visible: false, width: 'auto' },
  { key: 'heartRate', label: 'Heart Rate', visible: false, width: 'auto' },
  { key: 'sleepHours', label: 'Sleep Hours', visible: false, width: 'auto' },
  { key: 'sleepScore', label: 'Sleep Score', visible: false, width: 'auto' },
  { key: 'tradingviewLink', label: 'TradingView', visible: false, width: 'auto' }
]

const showMenu = ref(false)
const localColumns = ref([])
const draggedIndex = ref(null)

// Required columns that can't be hidden
const requiredColumns = ['checkbox', 'symbol']

const isRequiredColumn = (key) => requiredColumns.includes(key)

// Load saved column preferences from localStorage
const loadSavedColumns = () => {
  const saved = localStorage.getItem('tradeListColumns')
  if (saved) {
    try {
      const savedColumns = JSON.parse(saved)
      console.log('[COLUMNS] Loaded saved columns from localStorage:', savedColumns.length, 'columns')

      // Check if quality column exists in saved preferences
      const hasQualityColumn = savedColumns.some(c => c.key === 'quality')

      if (!hasQualityColumn) {
        console.log('[COLUMNS] MIGRATION: Adding missing quality column to saved preferences')
        // Find the confidence column index to insert quality after it
        const confidenceIndex = savedColumns.findIndex(c => c.key === 'confidence')
        if (confidenceIndex !== -1) {
          // Insert quality column after confidence
          savedColumns.splice(confidenceIndex + 1, 0, {
            key: 'quality',
            label: 'Quality',
            visible: true,
            width: 'auto'
          })
        } else {
          // If confidence not found, just add at a reasonable position
          savedColumns.push({
            key: 'quality',
            label: 'Quality',
            visible: true,
            width: 'auto'
          })
        }
        // Save the updated columns back to localStorage
        localStorage.setItem('tradeListColumns', JSON.stringify(savedColumns))
        console.log('[COLUMNS] MIGRATION: Quality column added and saved')
      }

      // Merge saved preferences with default columns to handle new columns
      // Use default column order, but preserve visibility settings from saved columns
      const savedMap = new Map(savedColumns.map(c => [c.key, c]))

      const mergedColumns = defaultColumns.map(defaultCol => {
        const savedCol = savedMap.get(defaultCol.key)
        if (savedCol) {
          // Column exists in saved preferences, use saved visibility and width
          return {
            ...defaultCol,
            visible: savedCol.visible,
            width: savedCol.width || defaultCol.width
          }
        } else {
          // New column, use default configuration
          console.log('[COLUMNS] Adding new column:', defaultCol.key)
          return { ...defaultCol }
        }
      })

      localColumns.value = mergedColumns
    } catch (e) {
      console.error('[COLUMNS] Failed to load saved columns:', e)
      localColumns.value = [...defaultColumns]
    }
  } else {
    console.log('[COLUMNS] No saved columns found, using defaults')
    localColumns.value = [...defaultColumns]
  }
}

// Save column preferences to localStorage
const saveColumns = () => {
  const columnsToSave = localColumns.value.map(col => ({
    key: col.key,
    label: col.label,
    visible: col.visible,
    width: col.width,
    required: col.required
  }))
  localStorage.setItem('tradeListColumns', JSON.stringify(columnsToSave))
  console.log('[COLUMNS] Saved column preferences:', columnsToSave.length, 'columns')
}

const updateDropdownPosition = () => {
  if (!buttonRef.value) return

  const rect = buttonRef.value.getBoundingClientRect()
  const menuWidth = 320 // w-80 = 20rem = 320px
  const viewportMargin = 16 // 1rem margin from viewport edges

  // Calculate position
  let left = rect.right - menuWidth
  let top = rect.bottom + 4

  // Ensure dropdown doesn't go off the left edge of the screen
  if (left < viewportMargin) {
    left = viewportMargin
  }

  // Ensure dropdown doesn't go off the right edge of the screen
  if (left + menuWidth > window.innerWidth - viewportMargin) {
    left = window.innerWidth - menuWidth - viewportMargin
  }

  // Calculate available space and max height
  const spaceBelow = window.innerHeight - rect.bottom - viewportMargin
  const spaceAbove = rect.top - viewportMargin

  let maxHeight
  if (spaceBelow < 400 && spaceAbove > spaceBelow) {
    // Position above button if more space there
    maxHeight = Math.min(spaceAbove - 8, 600)
    top = rect.top - maxHeight - 4
  } else {
    // Position below button
    maxHeight = Math.min(spaceBelow - 8, 600)
    top = rect.bottom + 4
  }

  // Ensure top doesn't go above viewport
  if (top < viewportMargin) {
    top = viewportMargin
    maxHeight = window.innerHeight - viewportMargin * 2
  }

  dropdownStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    maxHeight: `${maxHeight}px`
  }
}

const toggleMenu = async () => {
  showMenu.value = !showMenu.value
  if (showMenu.value) {
    // Reset local columns to current state when opening
    loadSavedColumns()
    await nextTick()
    updateDropdownPosition()
  }
}

const handleDragStart = (index) => {
  draggedIndex.value = index
}

const handleDrop = (dropIndex) => {
  if (draggedIndex.value === null || draggedIndex.value === dropIndex) return

  const draggedItem = { ...localColumns.value[draggedIndex.value] }
  const newColumns = [...localColumns.value]

  // Remove dragged item
  newColumns.splice(draggedIndex.value, 1)

  // Insert at new position (adjust index if dragging from earlier position)
  const insertIndex = draggedIndex.value < dropIndex ? dropIndex - 1 : dropIndex
  newColumns.splice(insertIndex, 0, draggedItem)

  localColumns.value = newColumns
  console.log('[COLUMNS] Reordered columns:', draggedItem.label, 'moved to position', insertIndex)
}

const handleDragEnd = () => {
  draggedIndex.value = null
}

const selectAll = () => {
  localColumns.value.forEach(col => {
    if (!isRequiredColumn(col.key)) {
      col.visible = true
    }
  })
}

const deselectAll = () => {
  localColumns.value.forEach(col => {
    if (!isRequiredColumn(col.key)) {
      col.visible = false
    }
  })
}

const resetToDefault = () => {
  localColumns.value = [...defaultColumns]
  localStorage.removeItem('tradeListColumns')
}

const updateColumns = () => {
  // Updates will be applied when user clicks Apply
}

const apply = () => {
  saveColumns()
  const columnsToEmit = localColumns.value.map(col => ({ ...col }))
  emit('update:columns', columnsToEmit)
  console.log('[COLUMNS] Applied column configuration with', columnsToEmit.filter(c => c.visible).length, 'visible columns')
  showMenu.value = false
}

const cancel = () => {
  loadSavedColumns()
  showMenu.value = false
}

// Click outside handler
const handleClickOutside = (event) => {
  if (!showMenu.value) return
  
  // Check if click is outside both the button and the menu
  const clickedOnButton = buttonRef.value && buttonRef.value.contains(event.target)
  const clickedOnMenu = menuRef.value && menuRef.value.contains(event.target)
  
  if (!clickedOnButton && !clickedOnMenu) {
    showMenu.value = false
  }
}

// Handle window resize
const handleResize = () => {
  if (showMenu.value) {
    updateDropdownPosition()
  }
}

onMounted(() => {
  loadSavedColumns()
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('resize', handleResize)
  window.addEventListener('scroll', handleResize, true)

  // Emit initial columns
  const columnsToEmit = localColumns.value.map(col => ({ ...col }))
  emit('update:columns', columnsToEmit)
  console.log('[COLUMNS] Initialized with', columnsToEmit.filter(c => c.visible).length, 'visible columns')
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('scroll', handleResize, true)
})
</script>