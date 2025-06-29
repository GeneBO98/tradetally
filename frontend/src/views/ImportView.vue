<template>
  <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Import Trades</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Import your trades from CSV files exported from major brokers.
      </p>
    </div>

    <div class="space-y-8">
      <!-- Import Form -->
      <div class="card">
        <div class="card-body">
          <form @submit.prevent="handleImport" class="space-y-6">
            <div>
              <label for="broker" class="label">Broker Format</label>
              <select id="broker" v-model="selectedBroker" required class="input">
                <option value="">Select broker format</option>
                <option value="generic">Generic CSV</option>
                <option value="lightspeed">Lightspeed Trader</option>
                <option value="schwab">Charles Schwab</option>
                <option value="thinkorswim">ThinkorSwim</option>
                <option value="ibkr">Interactive Brokers</option>
                <option value="etrade">E*TRADE</option>
              </select>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Choose the format that matches your CSV file structure.
              </p>
            </div>

            <div>
              <label for="file" class="label">CSV File</label>
              <div 
                class="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md transition-colors"
                :class="[
                  dragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 dark:border-gray-600'
                ]"
                @dragover.prevent="handleDragOver"
                @dragleave.prevent="handleDragLeave"
                @drop.prevent="handleDrop"
              >
                <div class="space-y-1 text-center">
                  <ArrowUpTrayIcon class="mx-auto h-12 w-12 text-gray-400" />
                  <div class="flex text-sm text-gray-600 dark:text-gray-400">
                    <label
                      for="file-upload"
                      class="relative cursor-pointer bg-white dark:bg-gray-800 rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500"
                    >
                      <span>Upload a file</span>
                      <input
                        id="file-upload"
                        ref="fileInput"
                        name="file-upload"
                        type="file"
                        accept=".csv"
                        class="sr-only"
                        @change="handleFileSelect"
                      />
                    </label>
                    <p class="pl-1">or drag and drop</p>
                  </div>
                  <p class="text-xs text-gray-500 dark:text-gray-400">CSV files only (up to 50MB)</p>
                </div>
              </div>
              <div v-if="selectedFile" class="mt-2">
                <p class="text-sm text-gray-900 dark:text-white">
                  Selected: {{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})
                </p>
              </div>
            </div>

            <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <p class="text-sm text-red-800 dark:text-red-400">{{ error }}</p>
            </div>

            <div class="flex justify-end">
              <button
                type="submit"
                :disabled="!selectedFile || !selectedBroker || loading"
                class="btn-primary"
              >
                <span v-if="loading">Importing...</span>
                <span v-else>Import Trades</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Format Examples -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Supported CSV Formats</h3>
          
          <div class="space-y-6">
            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">Generic CSV</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Use this format if your broker isn't listed or for custom CSV files.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                Symbol,Date,Entry Price,Exit Price,Quantity,Side,Commission,Fees<br>
                AAPL,2024-01-15,150.25,155.50,100,long,1.00,0.50<br>
                TSLA,2024-01-16,200.00,,50,short,1.00,0.50
              </div>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">Lightspeed Trader</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export from Lightspeed's "Reports" > "Trade Blotter" section as CSV.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                Account Number,Side,Symbol,Trade Date,Price,Qty,Commission Amount<br>
                12345,B,AAPL,02/03/2025,150.25,100,1.00<br>
                12345,S,AAPL,02/03/2025,155.50,100,1.00
              </div>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">ThinkorSwim</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export from ThinkorSwim's "Account Statement" section.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                Exec Time,Symbol,Side,Qty,Price,Commission<br>
                2024-01-15 09:30:00,AAPL,BUY,100,150.25,1.00<br>
                2024-01-15 10:45:00,AAPL,SELL,100,155.50,1.00
              </div>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">Interactive Brokers</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export from IBKR's "Reports" > "Trade Confirmation" section.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                DateTime,Symbol,Quantity,Price,Commission<br>
                2024-01-15 09:30:00,AAPL,100,150.25,1.00<br>
                2024-01-15 10:45:00,AAPL,-100,155.50,1.00
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Import History -->
      <div v-if="importHistory.length > 0" class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Import History</h3>
            <button @click="fetchLogs" class="btn-secondary text-sm">
              View Logs
            </button>
          </div>
          <div class="space-y-3">
            <div
              v-for="importLog in importHistory"
              :key="importLog.id"
              class="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div>
                <p class="font-medium text-gray-900 dark:text-white">{{ importLog.file_name }}</p>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {{ formatDate(importLog.created_at) }} • {{ importLog.broker }}
                </p>
              </div>
              <div class="flex items-center space-x-3">
                <div class="text-right">
                  <div class="flex items-center space-x-2">
                    <span class="px-2 py-1 text-xs rounded-full" :class="getStatusClass(importLog.status)">
                      {{ getStatusText(importLog.status) }}
                    </span>
                  </div>
                  <p v-if="importLog.status === 'completed'" class="text-sm text-gray-500 dark:text-gray-400">
                    {{ importLog.trades_imported }} imported
                    <span v-if="importLog.trades_failed > 0">
                      • {{ importLog.trades_failed }} failed
                    </span>
                  </p>
                </div>
                <button
                  @click="deleteImport(importLog.id)"
                  class="text-red-600 hover:text-red-500 text-sm"
                  :disabled="deleting"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Logs Modal -->
      <div v-if="showLogs" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div class="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white dark:bg-gray-800">
          <div class="mt-3">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">Import Logs</h3>
              <button @click="showLogs = false" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <XMarkIcon class="h-6 w-6" />
              </button>
            </div>
            
            <div v-if="logFiles.length === 0" class="text-center py-4 text-gray-500 dark:text-gray-400">
              No log files found
            </div>
            
            <div v-else class="space-y-2 mb-4">
              <button
                v-for="logFile in logFiles"
                :key="logFile.name"
                @click="loadLogFile(logFile.name)"
                class="w-full text-left p-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                :class="{ 'bg-primary-50 dark:bg-primary-900/20': selectedLogFile === logFile.name }"
              >
                {{ logFile.name }}
              </button>
            </div>
            
            <div v-if="logContent" class="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg max-h-96 overflow-y-auto">
              <pre class="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{{ logContent }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- CUSIP Management -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
            CUSIP to Ticker Lookup
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Manage CUSIP to ticker symbol mappings. Add mappings for securities that appear as CUSIP numbers instead of ticker symbols.
          </p>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Add New Mapping -->
            <div>
              <h4 class="font-medium text-gray-900 dark:text-white mb-3">Add CUSIP Mapping</h4>
              <div class="space-y-3">
                <div>
                  <label for="cusip" class="label">CUSIP (9 characters)</label>
                  <input
                    id="cusip"
                    v-model="cusipForm.cusip"
                    type="text"
                    maxlength="9"
                    placeholder="31447N204"
                    class="input"
                  />
                </div>
                <div>
                  <label for="ticker" class="label">Ticker Symbol</label>
                  <input
                    id="ticker"
                    v-model="cusipForm.ticker"
                    type="text"
                    placeholder="FMTO"
                    class="input"
                  />
                </div>
                <button
                  @click="addCusipMapping"
                  :disabled="!cusipForm.cusip || !cusipForm.ticker || cusipLoading"
                  class="btn-primary w-full"
                >
                  <span v-if="cusipLoading">Adding...</span>
                  <span v-else>Add Mapping</span>
                </button>
              </div>
            </div>

            <!-- Lookup Existing -->
            <div>
              <h4 class="font-medium text-gray-900 dark:text-white mb-3">Lookup CUSIP</h4>
              <div class="space-y-3">
                <div>
                  <label for="lookupCusip" class="label">CUSIP to Lookup</label>
                  <input
                    id="lookupCusip"
                    v-model="lookupForm.cusip"
                    type="text"
                    maxlength="9"
                    placeholder="31447N204"
                    class="input"
                  />
                </div>
                <button
                  @click="lookupCusip"
                  :disabled="!lookupForm.cusip || cusipLoading"
                  class="btn-secondary w-full"
                >
                  <span v-if="cusipLoading">Looking up...</span>
                  <span v-else>Lookup</span>
                </button>
                <div v-if="lookupResult" class="p-3 rounded-md" :class="[
                  lookupResult.found ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'
                ]">
                  <p class="text-sm" :class="[
                    lookupResult.found ? 'text-green-800 dark:text-green-400' : 'text-red-800 dark:text-red-400'
                  ]">
                    <span v-if="lookupResult.found">
                      {{ lookupResult.cusip }} → {{ lookupResult.ticker }}
                    </span>
                    <span v-else>
                      CUSIP {{ lookupResult.cusip }} not found
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Current Mappings -->
          <div v-if="cusipMappings && Object.keys(cusipMappings).length > 0" class="mt-6">
            <h4 class="font-medium text-gray-900 dark:text-white mb-3">Current Mappings</h4>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      CUSIP
                    </th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Ticker
                    </th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr v-for="(ticker, cusip) in cusipMappings" :key="cusip">
                    <td class="px-3 py-2 text-sm font-mono text-gray-900 dark:text-white">
                      {{ cusip }}
                    </td>
                    <td class="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">
                      {{ ticker }}
                    </td>
                    <td class="px-3 py-2 text-sm">
                      <button 
                        @click="deleteCusipMapping(cusip)"
                        class="text-red-600 hover:text-red-500 text-sm font-medium disabled:opacity-50"
                        :disabled="cusipLoading"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useTradesStore } from '@/stores/trades'
import { useNotification } from '@/composables/useNotification'
import { format } from 'date-fns'
import { ArrowUpTrayIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const tradesStore = useTradesStore()
const { showSuccess, showError } = useNotification()

const loading = ref(false)
const error = ref(null)
const selectedBroker = ref('')
const selectedFile = ref(null)
const fileInput = ref(null)
const dragOver = ref(false)
const importHistory = ref([])
const deleting = ref(false)
const showLogs = ref(false)
const logFiles = ref([])
const logContent = ref('')
const selectedLogFile = ref('')
const cusipLoading = ref(false)
const cusipForm = ref({
  cusip: '',
  ticker: ''
})
const lookupForm = ref({
  cusip: ''
})
const lookupResult = ref(null)
const cusipMappings = ref({})

function handleFileSelect(event) {
  const file = event.target.files[0]
  console.log('File selected:', {
    name: file?.name,
    type: file?.type,
    size: file?.size,
    lastModified: file?.lastModified
  })
  
  if (file && (file.type === 'text/csv' || file.type === 'application/csv' || file.name.toLowerCase().endsWith('.csv'))) {
    selectedFile.value = file
    error.value = null
    console.log('File accepted:', file.name)
  } else {
    error.value = 'Please select a valid CSV file'
    selectedFile.value = null
    console.log('File rejected - not CSV')
  }
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatDate(date) {
  return format(new Date(date), 'MMM dd, yyyy HH:mm')
}

function handleDragOver(event) {
  event.preventDefault()
  dragOver.value = true
}

function handleDragLeave(event) {
  event.preventDefault()
  dragOver.value = false
}

function handleDrop(event) {
  event.preventDefault()
  dragOver.value = false
  
  const files = event.dataTransfer.files
  if (files.length > 0) {
    const file = files[0]
    console.log('File dropped:', {
      name: file?.name,
      type: file?.type,
      size: file?.size
    })
    
    if (file.type === 'text/csv' || file.type === 'application/csv' || file.name.toLowerCase().endsWith('.csv')) {
      selectedFile.value = file
      error.value = null
      console.log('Dropped file accepted:', file.name)
    } else {
      error.value = 'Please select a valid CSV file'
      selectedFile.value = null
      console.log('Dropped file rejected - not CSV')
    }
  }
}

function getStatusClass(status) {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
    case 'processing':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
  }
}

function getStatusText(status) {
  switch (status) {
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'processing':
      return 'Processing'
    default:
      return 'Pending'
  }
}

async function handleImport() {
  if (!selectedFile.value || !selectedBroker.value) {
    error.value = 'Please select a file and broker format'
    return
  }

  console.log('Starting import with:', {
    fileName: selectedFile.value.name,
    fileSize: selectedFile.value.size,
    fileType: selectedFile.value.type,
    broker: selectedBroker.value
  })

  loading.value = true
  error.value = null

  try {
    const result = await tradesStore.importTrades(selectedFile.value, selectedBroker.value)
    console.log('Import result:', result)
    showSuccess('Import Started', `Import has been queued. Import ID: ${result.importId}`)
    
    // Reset form
    selectedFile.value = null
    selectedBroker.value = ''
    if (fileInput.value) {
      fileInput.value.value = ''
    }
    
    // Refresh import history
    fetchImportHistory()
  } catch (err) {
    console.error('Import error:', err)
    console.error('Error response:', err.response)
    error.value = err.response?.data?.error || err.message || 'Import failed'
    showError('Import Failed', error.value)
  } finally {
    loading.value = false
  }
}

async function fetchImportHistory() {
  try {
    const response = await api.get('/trades/import/history')
    importHistory.value = response.data.imports || []
  } catch (error) {
    console.error('Failed to fetch import history:', error)
  }
}

async function deleteImport(importId) {
  if (!confirm('Are you sure you want to delete this import and all associated trades?')) {
    return
  }

  deleting.value = true
  
  try {
    await api.delete(`/trades/import/${importId}`)
    showSuccess('Import Deleted', 'Import and associated trades have been deleted')
    await fetchImportHistory()
  } catch (error) {
    showError('Delete Failed', error.response?.data?.error || 'Failed to delete import')
  } finally {
    deleting.value = false
  }
}

async function fetchLogs() {
  try {
    const response = await api.get('/trades/import/logs')
    logFiles.value = response.data.logFiles || []
    showLogs.value = true
  } catch (error) {
    showError('Load Failed', 'Failed to load log files')
  }
}

async function loadLogFile(filename) {
  try {
    selectedLogFile.value = filename
    const response = await api.get(`/trades/import/logs/${filename}`)
    logContent.value = response.data.content || 'No content available'
  } catch (error) {
    showError('Load Failed', 'Failed to load log file content')
    logContent.value = 'Failed to load content'
  }
}

async function addCusipMapping() {
  if (!cusipForm.value.cusip || !cusipForm.value.ticker) {
    return
  }

  cusipLoading.value = true
  
  try {
    await api.post('/trades/cusip', {
      cusip: cusipForm.value.cusip.toUpperCase(),
      ticker: cusipForm.value.ticker.toUpperCase()
    })
    
    showSuccess('CUSIP Mapping Added', `${cusipForm.value.cusip} → ${cusipForm.value.ticker}`)
    
    // Reset form
    cusipForm.value.cusip = ''
    cusipForm.value.ticker = ''
    
    // Refresh mappings
    await fetchCusipMappings()
  } catch (error) {
    showError('Add Failed', error.response?.data?.error || 'Failed to add CUSIP mapping')
  } finally {
    cusipLoading.value = false
  }
}

async function lookupCusip() {
  if (!lookupForm.value.cusip) {
    return
  }

  cusipLoading.value = true
  lookupResult.value = null
  
  try {
    const response = await api.get(`/trades/cusip/${lookupForm.value.cusip.toUpperCase()}`)
    lookupResult.value = response.data
  } catch (error) {
    showError('Lookup Failed', error.response?.data?.error || 'Failed to lookup CUSIP')
  } finally {
    cusipLoading.value = false
  }
}

async function fetchCusipMappings() {
  try {
    const response = await api.get('/trades/cusip-mappings')
    cusipMappings.value = response.data.mappings || {}
  } catch (error) {
    console.error('Failed to fetch CUSIP mappings:', error)
  }
}

async function deleteCusipMapping(cusip) {
  if (!confirm(`Are you sure you want to delete the mapping for ${cusip}?`)) {
    return
  }
  
  cusipLoading.value = true
  
  try {
    await api.delete(`/trades/cusip/${cusip}`)
    showSuccess('CUSIP Mapping Deleted', `Mapping for ${cusip} has been deleted`)
    await fetchCusipMappings()
  } catch (error) {
    showError('Delete Failed', error.response?.data?.error || 'Failed to delete CUSIP mapping')
  } finally {
    cusipLoading.value = false
  }
}

onMounted(() => {
  fetchImportHistory()
  fetchCusipMappings()
  setInterval(fetchImportHistory, 5000)
})
</script>