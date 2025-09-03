<template>
  <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        {{ isEdit ? 'Edit Trade' : 'Add New Trade' }}
      </h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {{ isEdit ? 'Update your trade details' : 'Enter the details of your trade' }}
      </p>
    </div>

    <form @submit.prevent="handleSubmit" class="card">
      <div class="card-body space-y-6">
        <!-- Symbol field standalone -->
        <div>
          <label for="symbol" class="label">Symbol *</label>
          <input
            id="symbol"
            v-model="form.symbol"
            type="text"
            required
            class="input uppercase"
            placeholder="AAPL"
          />
        </div>

        <!-- Two column grid for remaining fields -->
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label for="entryTime" class="label">Entry Time *</label>
            <input
              id="entryTime"
              v-model="form.entryTime"
              type="datetime-local"
              required
              class="input"
            />
          </div>

          <div>
            <label for="exitTime" class="label">Exit Time</label>
            <input
              id="exitTime"
              v-model="form.exitTime"
              type="datetime-local"
              class="input"
            />
          </div>

          <div>
            <label for="entryPrice" class="label">Entry Price *</label>
            <input
              id="entryPrice"
              v-model="form.entryPrice"
              type="number"
              step="0.0001"
              min="0"
              required
              class="input"
              placeholder="0.0000"
            />
          </div>

          <div>
            <label for="exitPrice" class="label">Exit Price</label>
            <input
              id="exitPrice"
              v-model="form.exitPrice"
              type="number"
              step="0.0001"
              min="0"
              class="input"
              placeholder="0.0000"
            />
          </div>

          <div>
            <label for="quantity" class="label">Quantity *</label>
            <input
              id="quantity"
              v-model="form.quantity"
              type="number"
              min="1"
              required
              class="input"
              placeholder="100"
            />
          </div>

          <div>
            <label for="side" class="label">Side *</label>
            <select id="side" v-model="form.side" required class="input">
              <option value="">Select side</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>

          <div>
            <label for="commission" class="label">Commission</label>
            <input
              id="commission"
              v-model="form.commission"
              type="number"
              step="0.0001"
              min="0"
              class="input"
              placeholder="0.0000"
            />
          </div>

          <div>
            <label for="fees" class="label">Fees</label>
            <input
              id="fees"
              v-model="form.fees"
              type="number"
              step="0.0001"
              min="0"
              class="input"
              placeholder="0.0000"
            />
          </div>

          <div>
            <label for="mae" class="label">
              MAE (Max Adverse Excursion)
              <span class="text-xs text-gray-500">Maximum loss during trade</span>
            </label>
            <input
              id="mae"
              v-model="form.mae"
              type="number"
              step="0.0001"
              class="input"
              placeholder="0.0000"
            />
          </div>

          <div>
            <label for="mfe" class="label">
              MFE (Max Favorable Excursion)
              <span class="text-xs text-gray-500">Maximum profit during trade</span>
            </label>
            <input
              id="mfe"
              v-model="form.mfe"
              type="number"
              step="0.0001"
              class="input"
              placeholder="0.0000"
            />
          </div>

          <div>
            <label for="broker" class="label">Broker</label>
            <input
              id="broker"
              v-model="form.broker"
              type="text"
              class="input"
              placeholder="ThinkorSwim"
            />
          </div>

          
        </div>
      
      <div v-if="showMoreOptions">
        <div>
          <label for="strategy" class="label">Strategy</label>
          <input
            id="strategy"
            v-model="form.strategy"
            type="text"
            class="input"
            placeholder="Scalping"
          />
        </div>
        <div>
          <label for="setup" class="label">Setup</label>
          <input
            id="setup"
            v-model="form.setup"
            type="text"
            class="input"
            placeholder="Breakout"
          />
        </div>
  
        <div>
          <label for="tags" class="label">Tags (comma separated)</label>
          <input
            id="tags"
            v-model="tagsInput"
            type="text"
            class="input"
            placeholder="momentum, earnings, breakout"
          />
        </div>
  
        <div>
          <label for="notes" class="label">Notes</label>
          <textarea
            id="notes"
            v-model="form.notes"
            rows="4"
            class="input"
            placeholder="Add your trade notes, observations, and learnings..."
            @keydown="handleNotesKeydown"
          ></textarea>
        </div>

        <!-- Image Upload Section -->
        <div v-if="isEdit && route.params.id">
          <ImageUpload 
            :trade-id="route.params.id" 
            @uploaded="handleImageUploaded"
          />
        </div>
  
        <div class="flex items-center">
          <input
            id="isPublic"
            v-model="form.isPublic"
            type="checkbox"
            class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label for="isPublic" class="ml-2 block text-sm text-gray-900 dark:text-white">
            Make this trade public
          </label>
        </div>
      </div>
      <button type="button" @click="showMoreOptions = !showMoreOptions" class="btn-secondary">
        {{ showMoreOptions ? 'Less Options' : 'More Options' }}
      </button>
      <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <p class="text-sm text-red-800 dark:text-red-400">{{ error }}</p>
        </div>

        <div class="flex justify-end space-x-3">
          <router-link to="/trades" class="btn-secondary">
            Cancel
          </router-link>
          <button
            type="submit"
            :disabled="loading"
            class="btn-primary"
          >
            <span v-if="loading">{{ isEdit ? 'Updating...' : 'Creating...' }}</span>
            <span v-else>{{ isEdit ? 'Update Trade' : 'Create Trade' }}</span>
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTradesStore } from '@/stores/trades'
import { useNotification } from '@/composables/useNotification'
import { useAnalytics } from '@/composables/useAnalytics'
import ImageUpload from '@/components/trades/ImageUpload.vue'

const showMoreOptions = ref(false)
const route = useRoute()
const router = useRouter()
const tradesStore = useTradesStore()
const { showSuccess, showError } = useNotification()
const { trackTradeAction } = useAnalytics()

const loading = ref(false)
const error = ref(null)

const isEdit = computed(() => !!route.params.id)

const form = ref({
  symbol: '',
  entryTime: '',
  exitTime: '',
  entryPrice: '',
  exitPrice: '',
  quantity: '',
  side: '',
  commission: 0,
  fees: 0,
  mae: null,
  mfe: null,
  broker: '',
  strategy: '',
  setup: '',
  notes: '',
  isPublic: false
})

const tagsInput = ref('')

function formatDateTimeLocal(date) {
  if (!date) return ''
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

async function loadTrade() {
  if (!isEdit.value) return
  
  try {
    loading.value = true
    const trade = await tradesStore.fetchTrade(route.params.id)
    
    form.value = {
      symbol: trade.symbol,
      entryTime: formatDateTimeLocal(trade.entry_time),
      exitTime: trade.exit_time ? formatDateTimeLocal(trade.exit_time) : '',
      entryPrice: trade.entry_price,
      exitPrice: trade.exit_price || '',
      quantity: trade.quantity,
      side: trade.side,
      commission: trade.commission || 0,
      fees: trade.fees || 0,
      mae: trade.mae || null,
      mfe: trade.mfe || null,
      broker: trade.broker || '',
      strategy: trade.strategy || '',
      setup: trade.setup || '',
      notes: trade.notes || '',
      isPublic: trade.is_public || false
    }
    
    tagsInput.value = trade.tags ? trade.tags.join(', ') : ''
  } catch (err) {
    showError('Error', 'Failed to load trade')
    router.push('/trades')
  } finally {
    loading.value = false
  }
}

function handleNotesKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSubmit()
  }
}

async function handleSubmit() {
  loading.value = true
  error.value = null

  try {
    const tradeData = {
      ...form.value,
      entryPrice: parseFloat(form.value.entryPrice),
      exitPrice: form.value.exitPrice ? parseFloat(form.value.exitPrice) : null,
      quantity: parseInt(form.value.quantity),
      commission: parseFloat(form.value.commission) || 0,
      fees: parseFloat(form.value.fees) || 0,
      mae: form.value.mae ? parseFloat(form.value.mae) : null,
      mfe: form.value.mfe ? parseFloat(form.value.mfe) : null,
      tags: tagsInput.value ? tagsInput.value.split(',').map(tag => tag.trim()).filter(Boolean) : []
    }

    if (isEdit.value) {
      await tradesStore.updateTrade(route.params.id, tradeData)
      showSuccess('Success', 'Trade updated successfully')
      trackTradeAction('update', {
        side: tradeData.side,
        broker: tradeData.broker,
        strategy: tradeData.strategy,
        notes: !!tradeData.notes
      })
      // For edits, go back to the trade detail page
      router.push(`/trades/${route.params.id}`)
    } else {
      const newTrade = await tradesStore.createTrade(tradeData)
      showSuccess('Success', 'Trade created successfully')
      trackTradeAction('create', {
        side: tradeData.side,
        broker: tradeData.broker,
        strategy: tradeData.strategy,
        notes: !!tradeData.notes
      })
      // For new trades, go to trades list
      router.push('/trades')
    }
  } catch (err) {
    error.value = err.response?.data?.error || 'An error occurred'
    showError('Error', error.value)
  } finally {
    loading.value = false
  }
}

function handleImageUploaded() {
  // Refresh trade data or show success message
  showSuccess('Images Uploaded', 'Trade images uploaded successfully')
}

onMounted(() => {
  if (isEdit.value) {
    loadTrade()
  } else {
    // Set default entry time
    const now = new Date()
    form.value.entryTime = formatDateTimeLocal(now)
  }
})
</script>