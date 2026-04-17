<template>
  <div class="content-wrapper py-8">
    <div class="mb-8 flex items-start justify-between">
      <div>
        <h1 class="heading-page">Import Trades</h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Import your trades from CSV files exported from major brokers.
        </p>
      </div>
      <router-link to="/broker-sync" class="mt-1 btn-secondary inline-flex items-center gap-2">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Broker Sync
      </router-link>
    </div>

    <!-- Guided onboarding: step 2 of tour -->
    <OnboardingCard
      v-if="authStore.onboardingStep === 2"
      :step="2"
      :total-steps="5"
      :next-step="3"
      title="Import Your Trades"
      description="When you're ready, upload a CSV from your broker or use Broker Sync. Auto-Detect handles the format for you."
      cta-label="Next: Trading Journal"
      cta-route="diary"
    />

    <div class="space-y-8">
      <!-- Import Form -->
      <div class="card">
        <div class="card-body">
          <form @submit.prevent="handleImport" class="space-y-6">
            <!-- File Upload Drop Zone -->
            <div>
              <div
                class="flex justify-center px-6 pt-8 pb-8 border-2 border-dashed rounded-xl transition-colors"
                :class="[
                  isAnalyzingFile ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-900/10 cursor-wait' :
                  dragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 cursor-pointer' : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 cursor-pointer'
                ]"
                @dragover.prevent="handleDragOver"
                @dragleave.prevent="handleDragLeave"
                @drop.prevent="handleDrop"
                @click="!isAnalyzingFile && $refs.fileInput && $refs.fileInput.click()"
              >
                <div v-if="isAnalyzingFile" class="space-y-3 text-center">
                  <div class="animate-spin mx-auto h-12 w-12 rounded-full border-4 border-primary-200 border-t-primary-600"></div>
                  <p class="text-base font-medium text-gray-900 dark:text-white">Analyzing file...</p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">Checking headers and row count</p>
                </div>
                <div v-else class="space-y-2 text-center">
                  <ArrowUpTrayIcon class="mx-auto h-16 w-16 text-gray-400" />
                  <p class="text-base font-medium text-gray-900 dark:text-white">Drop your broker CSV here</p>
                  <div class="flex text-sm text-gray-600 dark:text-gray-400">
                    <label
                      for="file-upload"
                      class="relative cursor-pointer rounded-md font-medium text-primary-600 hover:text-primary-500"
                      @click.stop
                    >
                      <span>Browse files</span>
                      <input
                        id="file-upload"
                        ref="fileInput"
                        name="file-upload"
                        type="file"
                        class="sr-only"
                        @change="handleFileSelect"
                      />
                    </label>
                    <p class="pl-1">or drag and drop</p>
                  </div>
                  <p class="text-xs text-gray-500 dark:text-gray-400">CSV files only (up to 50MB)</p>
                </div>
              </div>
              <div v-if="selectedFile" class="mt-2 flex items-center justify-between">
                <p class="text-sm text-gray-900 dark:text-white">
                  Selected: {{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})
                </p>
                <button
                  type="button"
                  class="text-sm text-gray-400 hover:text-red-500 transition-colors"
                  @click.prevent="clearSelectedFile"
                >
                  Clear
                </button>
              </div>
            </div>

            <div>
              <label for="broker" class="label">Broker Format</label>
              <select id="broker" v-model="selectedBroker" required class="input">
                <option value="auto">Auto-Detect (Recommended)</option>
                <option disabled>--- Or select your broker ---</option>
                <option value="generic">Generic CSV</option>
                <option value="lightspeed">Lightspeed Trader</option>
                <option value="schwab">Charles Schwab</option>
                <option value="thinkorswim">ThinkorSwim</option>
                <option value="ibkr">Interactive Brokers</option>
                <option value="webull">Webull</option>
                <option value="etrade">E*TRADE</option>
                <option value="papermoney">PaperMoney</option>
                <option value="tradervue">TraderVue</option>
                <option value="tradingview">TradingView</option>
                <option value="avatrade">AvaTrade</option>
                <option value="tradovate">Tradovate</option>
                <option value="questrade">Questrade</option>
                <option value="tradestation">TradeStation</option>
                <option value="tastytrade">Tastytrade</option>
                <optgroup v-if="customMappings.length > 0" label="Custom Importers">
                  <option
                    v-for="mapping in customMappings"
                    :key="mapping.id"
                    :value="`custom:${mapping.id}`"
                  >
                    {{ mapping.mapping_name }}
                  </option>
                </optgroup>
              </select>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                We'll automatically detect your broker from the CSV file. Select a specific broker only if auto-detection doesn't work.
              </p>
            </div>

            <!-- Account Selection (only shown if user has defined accounts) -->
            <div v-if="requiresAccountSelection">
              <label for="account" class="label">Trading Account</label>
              <select id="account" v-model="selectedAccountId" class="input">
                <option :value="null">Select account...</option>
                <option v-for="account in accounts" :key="account.id" :value="account.id">
                  {{ account.name }}{{ account.identifier ? ` (${redactAccountId(account.identifier)})` : '' }}{{ account.broker ? ` - ${formatBrokerName(account.broker)}` : '' }}
                </option>
                <option value="none">None (different broker/account)</option>
              </select>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Select a trading account to associate with this import, or choose "None" if importing from a different broker.
                <router-link to="/accounts" class="text-primary-600 hover:text-primary-500">Manage accounts</router-link>
              </p>
            </div>

            <div v-if="selectedFile" class="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/50">
              <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p class="text-sm font-semibold text-gray-900 dark:text-white">Pre-import check</p>
                  <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {{ fileReadinessMessage }}
                  </p>
                </div>
                <button
                  type="button"
                  class="self-start text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
                  @click="analyzeSelectedFile(selectedFile)"
                >
                  Re-check file
                </button>
              </div>

              <div v-if="isAnalyzingFile" class="mt-4 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-300">
                Analyzing headers and estimating trade count...
              </div>

              <div v-else class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div class="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
                  <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Estimated rows</p>
                  <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                    {{ fileAnalysis.rowCount !== null ? fileAnalysis.rowCount.toLocaleString() : 'Unknown' }}
                  </p>
                </div>
                <div class="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
                  <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Format check</p>
                  <p class="mt-1 text-sm font-semibold" :class="fileAnalysis.formatDetected ? 'text-green-700 dark:text-green-400' : 'text-yellow-700 dark:text-yellow-400'">
                    {{ fileAnalysis.formatDetected ? 'Recognized' : 'Needs review' }}
                  </p>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {{ fileAnalysis.detectedBroker ? formatBrokerName(fileAnalysis.detectedBroker) : 'We may need column mapping.' }}
                  </p>
                </div>
                <div class="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
                  <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Import mode</p>
                  <p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{{ selectedBrokerLabel }}</p>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ brokerRecommendation }}</p>
                </div>
                <div class="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
                  <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Account</p>
                  <p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{{ accountReadinessLabel }}</p>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ accountReadinessMessage }}</p>
                </div>
              </div>

              <div v-if="displayedHeaderPreview.length > 0" class="mt-4">
                <p class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Detected columns</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <span
                    v-for="header in displayedHeaderPreview"
                    :key="header"
                    class="rounded-full bg-white px-3 py-1 text-xs text-gray-700 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
                  >
                    {{ header }}
                  </span>
                  <span
                    v-if="fileAnalysis.headers.length > displayedHeaderPreview.length"
                    class="rounded-full bg-primary-50 px-3 py-1 text-xs text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/20 dark:text-primary-300 dark:ring-primary-800"
                  >
                    +{{ fileAnalysis.headers.length - displayedHeaderPreview.length }} more
                  </span>
                </div>
              </div>
            </div>

            <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <p class="text-sm text-red-800 dark:text-red-400">{{ error }}</p>
            </div>

            <!-- Import progress indicator -->
            <div v-if="loading && importStage" class="rounded-md bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 p-4">
              <div class="flex items-center space-x-3">
                <div class="animate-spin rounded-full h-5 w-5 border-2 border-primary-600 border-t-transparent flex-shrink-0"></div>
                <span class="text-sm font-medium text-primary-700 dark:text-primary-300">{{ importStage }}</span>
              </div>
            </div>

            <div class="flex justify-end">
              <button
                type="submit"
                :disabled="!selectedFile || !selectedBroker || loading"
                class="btn-primary inline-flex items-center"
              >
                <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span v-if="loading">Importing...</span>
                <span v-else>{{ importButtonLabel }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Import History -->
      <div v-if="importHistory.length > 0" class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center space-x-3">
              <h3 class="heading-card">
                Import History
                <span v-if="pagination.total > 0" class="text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({{ importHistory.length }} of {{ pagination.total }})
                </span>
              </h3>
              <button
                v-if="selectedImportIds.size > 0"
                @click="bulkDeleteImports"
                class="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
                :disabled="bulkDeleting"
              >
                Delete Selected ({{ selectedImportIds.size }})
              </button>
            </div>
            <div class="flex items-center space-x-3">
              <label class="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                <input
                  ref="selectAllCheckbox"
                  type="checkbox"
                  :checked="importHistory.length > 0 && selectedImportIds.size === importHistory.length"
                  @change="toggleSelectAll"
                  class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <span>Select All</span>
              </label>
              <button @click="fetchLogs" class="btn-secondary text-sm">
                View Logs
              </button>
            </div>
          </div>
          <div class="space-y-3">
            <div
              v-for="importLog in importHistory"
              :key="importLog.id"
              class="flex items-center justify-between p-3 border rounded-lg"
              :class="selectedImportIds.has(importLog.id) ? 'border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700'"
            >
              <div class="flex items-center space-x-3">
                <input
                  type="checkbox"
                  :checked="selectedImportIds.has(importLog.id)"
                  @change="toggleImportSelection(importLog.id)"
                  class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <p class="font-medium text-gray-900 dark:text-white">{{ importLog.file_name }}</p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ formatDate(importLog.created_at) }} • {{ importLog.broker }}
                  </p>
                </div>
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

          <!-- Load More Button -->
          <div v-if="pagination.hasMore" class="mt-4 text-center">
            <button
              @click="loadMoreHistory"
              class="btn-secondary text-sm"
            >
              Load More ({{ pagination.total - importHistory.length }} remaining)
            </button>
          </div>
        </div>
      </div>

      <!-- Manage Custom Importers -->
      <div v-if="customMappings.length > 0" class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-4">
            <h3 class="heading-card">Custom Importers</h3>
            <button
              @click="showCustomMappings = !showCustomMappings"
              class="flex items-center space-x-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-500"
            >
              <span>{{ showCustomMappings ? 'Hide' : 'Show' }} Importers</span>
              <svg
                class="w-4 h-4 transition-transform duration-200"
                :class="{ 'rotate-180': showCustomMappings }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          <div v-if="showCustomMappings" class="space-y-3">
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Manage your custom CSV importers. These appear in the broker format dropdown for quick reuse.
            </p>

            <div
              v-for="mapping in customMappings"
              :key="mapping.id"
              class="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div class="flex-1 min-w-0">
                <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                  {{ mapping.mapping_name }}
                </h4>
                <p v-if="mapping.description" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {{ mapping.description }}
                </p>
                <div class="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                  <span v-if="mapping.use_count > 0">Used {{ mapping.use_count }} time{{ mapping.use_count !== 1 ? 's' : '' }}</span>
                  <span v-if="mapping.last_used_at">Last used {{ formatDate(mapping.last_used_at) }}</span>
                  <span v-else>Never used</span>
                </div>
                <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  <span class="font-medium">Columns:</span>
                  {{ mapping.symbol_column }}, {{ mapping.quantity_column }}, {{ mapping.entry_price_column }}
                  <span v-if="mapping.side_column">, {{ mapping.side_column }}</span>
                </div>
              </div>

              <button
                @click="confirmDeleteMapping(mapping)"
                :disabled="deletingMappingId === mapping.id"
                class="ml-4 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Delete importer"
              >
                <XMarkIcon class="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- CUSIP Management (admin only) -->
      <div v-if="authStore.user?.role === 'admin' || authStore.user?.role === 'owner'" class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <h3 class="heading-card">CUSIP Symbol Mappings</h3>
              <div class="flex items-center gap-2">
                <button
                  @click="showAllMappingsModal = true"
                  class="btn-secondary text-sm"
                >
                  <Cog6ToothIcon class="h-5 w-5 sm:mr-2" />
                  <span class="hidden sm:inline">Manage All</span>
                </button>
                <button
                  v-if="unmappedCusipsCount > 0"
                  @click="showUnmappedModal = true"
                  class="btn-yellow text-sm"
                >
                  <ExclamationTriangleIcon class="h-5 w-5 sm:mr-2" />
                  <span class="hidden sm:inline">{{ unmappedCusipsCount }} Unmapped</span>
                  <span class="sm:hidden">{{ unmappedCusipsCount }}</span>
                </button>
              </div>
            </div>
            <button
              @click="showCusipManagement = !showCusipManagement"
              class="flex items-center space-x-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-500"
            >
              <span>{{ showCusipManagement ? 'Hide' : 'Show' }}</span>
              <svg
                class="w-4 h-4 transition-transform duration-200"
                :class="{ 'rotate-180': showCusipManagement }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          <div v-if="showCusipManagement">
            <div v-if="unmappedCusipsCount > 0" class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 mb-6">
              <div class="flex items-center">
                <ExclamationTriangleIcon class="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2" />
                <div class="text-sm">
                  <span class="font-medium text-yellow-800 dark:text-yellow-200">
                    {{ unmappedCusipsCount }} unmapped CUSIP{{ unmappedCusipsCount !== 1 ? 's' : '' }} found in your trades
                  </span>
                  <p class="text-yellow-700 dark:text-yellow-300 mt-1">
                    These trades may not appear when filtering by ticker symbol. Click "Unmapped" to resolve them.
                  </p>
                </div>
              </div>
            </div>

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
                    class="btn-primary w-full"
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
                    <div v-if="lookupResult.found" class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Source: {{ lookupResult.source }} • {{ lookupResult.verified ? 'Verified' : 'Unverified' }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Format Examples -->
      <div class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-4">
            <h3 class="heading-card">Supported CSV Formats</h3>
            <button
              @click="showFormats = !showFormats"
              class="flex items-center space-x-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-500"
            >
              <span>{{ showFormats ? 'Hide' : 'Show' }} Formats</span>
              <svg 
                class="w-4 h-4 transition-transform duration-200"
                :class="{ 'rotate-180': showFormats }"
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          
          <div v-if="showFormats" class="space-y-6">
            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">Generic CSV</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Use this format if your broker isn't listed or for custom CSV files. Supports comma, semicolon, or tab separators.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                Symbol,Date,Entry Price,Exit Price,Quantity,Side,Commission,Fees<br>
                AAPL,2024-01-15,150.25,155.50,100,long,1.00,0.50<br>
                TSLA,2024-01-16,200.00,,50,short,1.00,0.50
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Alternative column names:</strong> Symbol/symbol, Date/Trade Date, Entry Price/Buy Price/Price, Exit Price/Sell Price, Quantity/Shares/Size, Side/Direction/Type, Commission/Fees
              </p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">Lightspeed Trader</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export from Lightspeed's "Reports" > "Trade Blotter" section as CSV.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                Symbol,Trade Date,Price,Qty,Side,Commission Amount,Execution Time,Trade Number<br>
                AAPL,02/03/2025,150.25,100,B,1.00,09:30,12345<br>
                AAPL,02/03/2025,155.50,100,S,1.00,14:30,12346
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Required columns:</strong> Symbol, Trade Date, Price, Qty, Side (B/S), Commission Amount. Optional: Execution Time, Buy/Sell, Security Type, fee columns (FeeSEC, FeeMF, etc.)
              </p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">Charles Schwab</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Supports both completed trades export and transaction history. Tab-separated files are automatically detected.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                <strong>Completed Trades:</strong><br>
                Symbol,Opened Date,Closed Date,Quantity,Cost Per Share,Proceeds Per Share,Gain/Loss ($)<br>
                AAPL,01/15/2024,01/15/2024,100,150.25,155.50,525.00<br><br>
                <strong>Transaction History:</strong><br>
                Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount<br>
                01/15/2024,Buy,AAPL,Buy,100,150.25,1.00,15026.00<br>
                01/15/2024,Sell,AAPL,Sell,100,155.50,1.00,15549.00
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Supports both formats:</strong> Completed trades with P&L or individual transactions. Auto-detects format and delimiter.
              </p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">ThinkorSwim</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export from ThinkorSwim's "Account Statement" section. Only processes trade (TRD) records.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                DATE,TIME,TYPE,REF #,DESCRIPTION,Commissions & Fees,Misc Fees<br>
                01/15/2024,09:30:00,TRD,12345,"BOT +100 AAPL @150.25",1.00,0.00<br>
                01/15/2024,10:45:00,TRD,12346,"SOLD -100 AAPL @155.50",1.00,0.00
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Required columns:</strong> DATE, TIME, TYPE (must be "TRD"), REF #, DESCRIPTION (BOT/SOLD format). Optional: Commissions & Fees, Misc Fees
              </p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">Interactive Brokers</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Supports both Activity Statement and Trade Confirmation exports. Also supports Flex Query exports.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                <strong>Activity Statement:</strong><br>
                Symbol,Date/Time,Quantity,Price,Commission,Fees<br>
                AAPL,2024-01-15 09:30:00,100,150.25,-1.00,0.00<br>
                AAPL,2024-01-15 10:45:00,-100,155.50,-1.00,0.00<br><br>
                <strong>Trade Confirmation:</strong><br>
                Symbol,UnderlyingSymbol,Strike,Expiry,Put/Call,Quantity,Multiplier,Buy/Sell,Date/Time,Price,Commission<br>
                AAPL,,,,,,BUY,20240115;093000,150.25,-1.00
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Activity Statement:</strong> Symbol, Date/Time or DateTime, Quantity (positive=buy, negative=sell), Price. <strong>Trade Confirmation:</strong> Symbol, Buy/Sell, Date/Time, Price, UnderlyingSymbol, Strike, Expiry, Put/Call, Multiplier.
              </p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">Webull</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export from Webull's "Orders" > "Options Orders" history. Supports options trading with automatic roundtrip trade detection.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time<br>
                SPY251114C00672000,SPY251114C00672000,Buy,Filled,3,3,1.82,1.82,DAY,11/14/2025 11:10:02 EST,11/14/2025 11:10:02 EST<br>
                SPY251114C00672000,SPY251114C00672000,Sell,Filled,3,3,2.87,2.87,DAY,11/14/2025 11:31:56 EST,11/14/2025 11:31:56 EST
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Required columns:</strong> Symbol, Side, Status, Filled, Avg Price, Filled Time. Automatically parses option symbols (format: SPY251114C00672000).
              </p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">E*TRADE</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export from E*TRADE's transaction history.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                Symbol,Transaction Date,Transaction Type,Quantity,Price,Commission,Fees<br>
                AAPL,01/15/2024,Buy,100,150.25,1.00,0.00<br>
                AAPL,01/15/2024,Sell,100,155.50,1.00,0.00
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Required columns:</strong> Symbol, Transaction Date, Transaction Type (Buy/Sell), Quantity, Price. Optional: Commission, Fees
              </p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">PaperMoney</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export from ThinkorSwim's PaperMoney platform. Filled orders are treated as actual executed trades for analysis and tracking.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                Filled Orders<br>
                ,,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Price Improvement,Order Type<br>
                ,,9/19/25 13:24:32,STOCK,SELL,-100,TO CLOSE,FATN,,,STOCK,9.86,9.86,.00,MKT<br>
                ,,9/19/25 13:22:37,STOCK,BUY,+100,TO OPEN,FATN,,,STOCK,9.63,9.63,.00,MKT
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Required columns:</strong> Exec Time, Side, Qty, Symbol, Price. Filled orders are processed as real trades and grouped into round-trip positions with P&L calculations.
              </p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">TradingView</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export filled orders from TradingView's paper or live trading. Supports futures contracts with leverage detection.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                Symbol,Side,Type,Qty,Fill Price,Commission,Placing Time,Closing Time,Order ID,Leverage<br>
                CME_MINI:NQ1!,Buy,Market,1,25297,,2026-02-25 23:37:36,2026-02-25 23:37:36,2796864834,20:1<br>
                CME_MINI:NQ1!,Sell,Limit,1,25419,,2026-02-25 23:38:50,2026-02-26 05:31:17,2796872396,
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Required columns:</strong> Symbol, Side, Fill Price, Order ID. Optional: Status (if present, only "Filled" rows are imported), Qty, Type, Leverage, Commission, Placing Time/Closing Time.
              </p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">Tradovate</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export order history from Tradovate. Supports futures contracts with automatic contract month/year parsing and point value calculations.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                Contract,Product,Product Description,B/S,Status,Filled Qty,Avg Fill Price,Fill Time,Order ID<br>
                MESZ5,MES,Micro E-mini S&P 500,Buy,Filled,1,6025.50,11/25/2025 09:38:24,12345<br>
                MESZ5,MES,Micro E-mini S&P 500,Sell,Filled,1,6030.75,11/25/2025 10:15:10,12346
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Required columns:</strong> Contract, Product, B/S, Filled Qty (or filledQty), Avg Fill Price (or avgPrice), Fill Time. Optional: Order ID, Status, Product Description.
              </p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">Questrade</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export trade executions from Questrade. Supports stocks and options with automatic option symbol parsing.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                Symbol,Action,Fill qty,Fill price,Exec time,Account,Currency,Commission<br>
                AAPL,Buy,100,150.25,16 Dec 2025 09:30:15 AM,ABC123,USD,4.95<br>
                AAPL,Sell,100,155.50,16 Dec 2025 02:15:30 PM,ABC123,USD,4.95
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Required columns:</strong> Symbol, Action (Buy/Sell/BTO/STC/BTC/STO), Fill qty, Fill price, Exec time. Optional: Account, Currency, Commission. Date format: DD Mon YYYY HH:MM:SS AM/PM.
              </p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">TradeStation</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export transaction history from TradeStation. Supports both equity and options trades with detailed fee breakdown.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                Account,T/D,S/D,Currency,Type,Side,Symbol,Qty,Price,Exec Time,Comm,SEC,TAF,NSCC,Nasdaq,ECN Remove,ECN Add,Gross Proceeds,Net Proceeds<br>
                ABC123,01/15/25,01/17/25,USD,E,B,AAPL,100,150.50,09:30:15,4.95,0.01,0.01,0.01,0.00,0.00,0.00,15050.00,15045.02<br>
                ABC123,01/15/25,01/17/25,USD,E,S,AAPL,100,152.25,14:20:30,4.95,0.01,0.01,0.01,0.00,0.00,0.00,15225.00,15220.02
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Required columns:</strong> Account, T/D, S/D, Side, Symbol, Qty, Price, Exec Time, Gross Proceeds or Net Proceeds. All fee columns (Comm, SEC, TAF, NSCC, Nasdaq, ECN Remove, ECN Add) are automatically summed.
              </p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">Tastytrade</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export transaction history from Tastytrade. Supports stocks, options, and futures with OCC option symbol parsing.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                Date,Type,Action,Symbol,Instrument Type,Quantity,Average Price,Root Symbol,Underlying Symbol,Expiration Date,Strike Price,Call or Put,Multiplier,Commissions,Fees<br>
                2026-02-18T09:30:00-0500,Trade,BTO,IBM 260220C00265000,Option,5,2.15,IBM,IBM,2/20/26,265.00,Call,100,5.00,0.70<br>
                2026-02-18T14:15:00-0500,Trade,STC,IBM 260220C00265000,Option,5,3.40,IBM,IBM,2/20/26,265.00,Call,100,5.00,0.70
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Required columns:</strong> Type (must be "Trade"), Action (Buy/Sell/BTO/STC/BTC/STO), Symbol, Instrument Type, Quantity, Average Price, Root Symbol, Underlying Symbol, Call or Put. Optional: Date, Expiration Date, Strike Price, Multiplier, Commissions, Fees.
              </p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">TradingView Performance</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export performance data from TradingView. Contains completed trades with calculated P&L.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                symbol,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration<br>
                AAPL,fill_001,fill_002,100,150.50,152.25,175.00,1736950800000,1736961600000,3h<br>
                TSLA,fill_003,fill_004,50,225.75,220.50,-262.50,1736954400000,1736965200000,2h 40m
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Required columns:</strong> symbol, qty, buyPrice, sellPrice, boughtTimestamp, soldTimestamp. Timestamps are Unix milliseconds.
              </p>
            </div>
          </div>
        </div>
      </div>


      <!-- Logs Modal -->
      <div v-if="showLogs" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-11/12 max-w-4xl h-3/4 flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
            <h3 class="heading-card">Import Logs</h3>
            <button @click="showLogs = false" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <XMarkIcon class="h-6 w-6" />
            </button>
          </div>
          
          <!-- Content -->
          <div class="flex-1 p-5 overflow-hidden flex">
            
            <!-- Left Column: Log Files List -->
            <div class="w-1/3 pr-4 flex flex-col">
              <div v-if="logFiles.length === 0" class="text-center py-4 text-gray-500 dark:text-gray-400">
                No log files found
              </div>
              
              <div v-else class="flex flex-col h-full">
                <!-- File count and toggle -->
                <div class="flex items-center justify-between mb-4">
                  <span class="text-sm text-gray-600 dark:text-gray-400">
                    {{ logFilesPagination.showAll ? 'All log files' : 'Today\'s log files' }}
                    ({{ logFiles.length }} of {{ logFilesPagination.total }})
                  </span>
                  <button
                    v-if="logFilesPagination.olderFiles > 0"
                    @click="toggleLogFiles"
                    class="btn-secondary text-sm"
                  >
                    {{ logFilesPagination.showAll ? 'Show Today Only' : 'Show All Files' }}
                  </button>
                </div>
                
                <!-- Log files list with scroll -->
                <div class="flex-1 overflow-y-auto space-y-2 pr-2 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                  <button
                    v-for="logFile in logFiles"
                    :key="logFile.name"
                    @click="loadLogFile(logFile.name)"
                    class="w-full text-left p-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                    :class="{ 'bg-primary-50 dark:bg-primary-900/20': selectedLogFile === logFile.name }"
                  >
                    {{ logFile.name }}
                  </button>
                  
                  <!-- Load More Button -->
                  <div v-if="logFilesPagination.hasMore" class="text-center pt-2">
                    <button
                      @click="loadMoreLogFiles"
                      class="btn-secondary text-sm"
                    >
                      Load More ({{ logFilesPagination.total - logFiles.length }} remaining)
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Right Column: Log Content -->
            <div class="w-2/3 pl-4 flex flex-col">
              <div v-if="!selectedLogFile" class="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
                Select a log file to view its contents
              </div>
              
              <div v-else-if="selectedLogFile" class="flex flex-col h-full">
                <div class="flex items-center justify-between mb-4">
                  <div>
                    <h5 class="font-medium text-gray-900 dark:text-white">{{ selectedLogFile }}</h5>
                    <div class="flex items-center space-x-2 mt-1">
                      <span v-if="logPagination.total > 0" class="text-sm text-gray-500 dark:text-gray-400">
                        Showing {{ Math.min(logPagination.page * logPagination.limit, logPagination.total) }} of {{ logPagination.total }} lines
                        <span v-if="logSearchQuery">(filtered)</span>
                      </span>
                      <span v-if="!logPagination.showAll && logPagination.filteredOut > 0" class="text-xs text-primary-600 dark:text-primary-400">
                        (Last 24 hours)
                      </span>
                    </div>
                  </div>
                  <div class="flex items-center space-x-2">
                    <button
                      v-if="logPagination.filteredOut > 0"
                      @click="toggleLogView"
                      class="btn-secondary text-sm"
                    >
                      {{ logPagination.showAll ? 'Show Last 24h' : `Show All (${logPagination.totalAllLines} lines)` }}
                    </button>
                  </div>
                </div>
                
                <!-- Search bar -->
                <div class="mb-4">
                  <div class="relative">
                    <input
                      v-model="logSearchQuery"
                      type="text"
                      placeholder="Search logs... (e.g. CURR, SLRX, duplicate, error)"
                      class="input pl-10 pr-10"
                      @input="searchLogs"
                    />
                    <MagnifyingGlassIcon class="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <button
                      v-if="logSearchQuery"
                      @click="clearSearch"
                      class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <XMarkIcon class="h-5 w-5" />
                    </button>
                  </div>
                  <div v-if="logSearchQuery && searchResults" class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Found {{ searchResults.matchCount }} matches in {{ searchResults.lineCount }} lines
                  </div>
                </div>
                
                <div class="flex-1 bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-y-auto">
                  <div v-if="logSearchQuery && !logContent" class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                    <div class="text-center">
                      <MagnifyingGlassIcon class="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p class="text-sm">No results found for "{{ logSearchQuery }}"</p>
                      <button @click="clearSearch" class="mt-2 text-xs text-primary-600 dark:text-primary-400 hover:underline">
                        Clear search
                      </button>
                    </div>
                  </div>
                  <pre v-else class="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap" v-html="highlightedLogContent"></pre>
                </div>
                
                <div v-if="logPagination.hasMore" class="text-center mt-4">
                  <button
                    @click="loadMoreLogs"
                    class="btn-secondary text-sm"
                  >
                    Load More ({{ logPagination.total - (logPagination.page * logPagination.limit) }} lines remaining)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Unmapped CUSIPs Modal -->
    <UnmappedCusipsModal
      v-if="showUnmappedModal"
      :isOpen="showUnmappedModal"
      :unmappedCusips="unmappedCusips"
      @close="showUnmappedModal = false"
      @mappingCreated="handleMappingCreated"
      @resolutionStarted="handleResolutionStarted"
    />

    <!-- All CUSIP Mappings Modal -->
    <AllCusipMappingsModal
      v-if="showAllMappingsModal"
      :isOpen="showAllMappingsModal"
      @close="showAllMappingsModal = false"
      @mappingChanged="handleMappingCreated"
    />

    <!-- Delete Import Confirmation Modal -->
    <div v-if="showDeleteModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
        <div class="mt-3 text-center">
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900">
            <ExclamationTriangleIcon class="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white mt-4">
            {{ bulkDeleteIds ? `Delete ${bulkDeleteIds.length} Imports` : 'Delete Import' }}
          </h3>
          <div class="mt-2 px-7 py-3">
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ bulkDeleteIds
                ? `Are you sure you want to delete ${bulkDeleteIds.length} imports and all associated trades?`
                : 'Are you sure you want to delete this import and all associated trades?' }}
            </p>
            <!-- Single delete details -->
            <div v-if="deleteImportData && !bulkDeleteIds" class="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md text-left">
              <p class="text-sm font-medium text-gray-900 dark:text-white">{{ deleteImportData.file_name }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {{ formatDate(deleteImportData.created_at) }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ deleteImportData.trades_imported }} trades will be deleted
              </p>
            </div>
            <!-- Bulk delete details -->
            <div v-if="bulkDeleteIds" class="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md text-left max-h-48 overflow-y-auto">
              <div v-for="imp in bulkDeleteDetails" :key="imp.id" class="text-sm py-1 border-b border-gray-200 dark:border-gray-600 last:border-0">
                <p class="font-medium text-gray-900 dark:text-white">{{ imp.file_name }}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {{ formatDate(imp.created_at) }} - {{ imp.trades_imported }} trades
                </p>
              </div>
              <p class="text-sm font-medium text-gray-900 dark:text-white mt-2 pt-2 border-t border-gray-300 dark:border-gray-500">
                Total: {{ bulkDeleteTotalTrades }} trades will be deleted
              </p>
            </div>
            <p class="text-xs text-red-600 dark:text-red-400 mt-2 font-medium">
              This action cannot be undone.
            </p>
          </div>
          <div class="flex gap-3 justify-center mt-4">
            <button
              @click="cancelDelete"
              class="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-base font-medium rounded-md shadow-sm hover:bg-gray-400 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300"
              :disabled="deleting || bulkDeleting"
            >
              Cancel
            </button>
            <button
              @click="confirmDelete"
              class="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
              :disabled="deleting || bulkDeleting"
            >
              <span v-if="deleting || bulkDeleting">Deleting...</span>
              <span v-else>Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- CSV Column Mapping Modal -->
  <CSVColumnMappingModal
    v-if="showMappingModal"
    :is-open="showMappingModal"
    :csv-headers="csvHeaders"
    :csv-file="currentMappingFile"
    @close="showMappingModal = false"
    @mapping-saved="handleMappingSaved"
  />

  <!-- Currency Pro Feature Modal -->
  <div v-if="showCurrencyProModal" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <!-- Background overlay -->
      <div class="fixed inset-0 bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 transition-opacity" aria-hidden="true" @click="showCurrencyProModal = false"></div>

      <!-- Modal panel -->
      <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
        <div>
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-primary-100 dark:bg-primary-900">
            <svg class="h-6 w-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="mt-3 text-center sm:mt-5">
            <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
              Pro Feature Required
            </h3>
            <div class="mt-2">
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {{ currencyProMessage }}
              </p>
            </div>
          </div>
        </div>
        <div class="mt-5 sm:mt-6 space-y-3">
          <!-- Trial Button - show if user hasn't used trial yet -->
          <button
            v-if="!hasUsedTrial && (!trialInfo || !trialInfo.active)"
            type="button"
            :disabled="startingTrial"
            class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            @click="startTrial"
          >
            <span v-if="startingTrial" class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></span>
            Start 14-Day Free Trial
          </button>

          <div class="sm:grid sm:grid-cols-2 sm:gap-3">
            <router-link
              to="/pricing"
              class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:text-sm"
              @click="showCurrencyProModal = false"
            >
              View Pricing
            </router-link>
            <button
              type="button"
              class="mt-3 sm:mt-0 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:text-sm"
              @click="showCurrencyProModal = false"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Delete Importer Confirmation Modal -->
  <Teleport to="body">
    <div v-if="showDeleteMappingModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
        <div class="mt-3 text-center">
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900">
            <ExclamationTriangleIcon class="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white mt-4">
            Delete Custom Importer
          </h3>
          <div class="mt-2 px-7 py-3">
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Are you sure you want to delete this custom importer?
            </p>
            <div v-if="mappingToDelete" class="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md text-left">
              <p class="text-sm font-medium text-gray-900 dark:text-white">{{ mappingToDelete.mapping_name }}</p>
              <p v-if="mappingToDelete.description" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {{ mappingToDelete.description }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span v-if="mappingToDelete.use_count > 0">Used {{ mappingToDelete.use_count }} time{{ mappingToDelete.use_count !== 1 ? 's' : '' }}</span>
                <span v-else>Never used</span>
              </p>
            </div>
            <p class="text-xs text-red-600 dark:text-red-400 mt-2 font-medium">
              This action cannot be undone.
            </p>
          </div>
          <div class="flex gap-3 justify-center mt-4">
            <button
              @click="cancelDeleteMapping"
              class="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-base font-medium rounded-md shadow-sm hover:bg-gray-400 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300"
              :disabled="deletingMappingId !== null"
            >
              Cancel
            </button>
            <button
              @click="deleteMapping"
              class="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
              :disabled="deletingMappingId !== null"
            >
              <span v-if="deletingMappingId !== null">Deleting...</span>
              <span v-else>Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Broker Mismatch Modal -->
    <BrokerMismatchModal
      v-if="showBrokerMismatchModal"
      :is-open="showBrokerMismatchModal"
      :selected-broker="brokerMismatchData.selectedBroker"
      :detected-broker="brokerMismatchData.detectedBroker"
      :detected-headers="brokerMismatchData.detectedHeaders"
      :row-count="brokerMismatchData.rowCount"
      :file-name="brokerMismatchData.fileName"
      @close="handleBrokerMismatchClose"
      @use-detected="handleUseBrokerDetected"
      @keep-selected="handleKeepBrokerSelected"
    />

    <!-- Import Results Modal -->
    <ImportResultsModal
      v-if="showImportResultsModal"
      :is-open="showImportResultsModal"
      :trades-imported="importResultsData.tradesImported"
      :duplicates-skipped="importResultsData.duplicatesSkipped"
      :diagnostics="importResultsData.diagnostics"
      :failed-trades="importResultsData.failedTrades"
      :achievements="importResultsData.achievements"
      :selected-broker="selectedBroker"
      :file-name="selectedFile?.name || ''"
      :user-email="authStore.user?.email || ''"
      :show-demo-data-cta="showDemoDataCta"
      :demo-data-loading="creatingDemoData"
      @close="handleImportResultsClose"
      @load-demo-data="handleLoadDemoData"
      @view-analytics="handleImportResultsViewAnalytics"
      @view-trades="handleImportResultsViewTrades"
    />
  </Teleport>
</template>

<script setup>
import { ref, defineAsyncComponent, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTradesStore } from '@/stores/trades'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'
import { format } from 'date-fns'
import { formatTradeDate } from '@/utils/date'
import { useUserTimezone } from '@/composables/useUserTimezone'
import { ArrowUpTrayIcon, XMarkIcon, ExclamationTriangleIcon, Cog6ToothIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline'
import { useAnalytics } from '@/composables/useAnalytics'
import api from '@/services/api'
import { useGrowthBook } from '@/composables/useGrowthBook'
import { useNotificationCenter } from '@/composables/useNotificationCenter'

const { formatDateTime: formatDateTimeTz } = useUserTimezone()
// Lazy-load modal components - only parsed/executed when first shown
const UnmappedCusipsModal = defineAsyncComponent(() => import('@/components/cusip/UnmappedCusipsModal.vue'))
const AllCusipMappingsModal = defineAsyncComponent(() => import('@/components/cusip/AllCusipMappingsModal.vue'))
const CSVColumnMappingModal = defineAsyncComponent(() => import('@/components/import/CSVColumnMappingModal.vue'))
const BrokerMismatchModal = defineAsyncComponent(() => import('@/components/import/BrokerMismatchModal.vue'))
const ImportResultsModal = defineAsyncComponent(() => import('@/components/import/ImportResultsModal.vue'))
import OnboardingCard from '@/components/onboarding/OnboardingCard.vue'
import { usePriceAlertNotifications } from '@/composables/usePriceAlertNotifications'

const tradesStore = useTradesStore()
const authStore = useAuthStore()
const router = useRouter()
const { showSuccess, showError, showImportantWarning, showSuccessModal, clearModalAlert } = useNotification()
const { suppressCelebrations } = usePriceAlertNotifications()
const { track } = useAnalytics()
const { getFeatureValue } = useGrowthBook()
const { addUnreadNotifications } = useNotificationCenter()

const loading = ref(false)
const error = ref(null)
const importStage = ref('')
const selectedBroker = ref('auto')
const selectedFile = ref(null)
const isAnalyzingFile = ref(false)
const fileAnalysis = ref({
  rowCount: null,
  headers: [],
  formatDetected: false,
  detectedBroker: ''
})
const showCurrencyProModal = ref(false)

// Trial info for import limit modal
const trialInfo = ref(null)
const hasUsedTrial = ref(false)
const startingTrial = ref(false)

// Account selection for imports
const accounts = ref([])
const requiresAccountSelection = ref(false)
const selectedAccountId = ref(null)
const currencyProMessage = ref('')
const fileInput = ref(null)
const selectAllCheckbox = ref(null)
const dragOver = ref(false)
const importHistory = ref([])
const pagination = ref({
  page: 1,
  limit: 5,
  total: 0,
  totalPages: 0,
  hasMore: false
})
const deleting = ref(false)
const showLogs = ref(false)
const showFormats = ref(false)
const logFiles = ref([])
const logFilesPagination = ref({
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
  hasMore: false,
  showAll: false,
  totalFiles: 0,
  todayFiles: 0,
  olderFiles: 0
})
const logContent = ref('')
const originalLogContent = ref('')
const logSearchQuery = ref('')
const searchResults = ref(null)
const selectedLogFile = ref('')
const logPagination = ref({
  page: 1,
  limit: 100,
  total: 0,
  totalPages: 0,
  hasMore: false,
  showAll: false,
  totalAllLines: 0,
  filteredOut: 0
})
const cusipLoading = ref(false)
const cusipForm = ref({
  cusip: '',
  ticker: ''
})
const lookupForm = ref({
  cusip: ''
})
const lookupResult = ref(null)
const creatingDemoData = ref(false)
// Removed cusipMappings ref since it's no longer displayed in the UI
const unmappedCusipsCount = ref(0)
const unmappedCusips = ref([])
const showUnmappedModal = ref(false)
const showAllMappingsModal = ref(false)
const allMappings = ref([])
const allMappingsLoading = ref(false)

// CSV Column Mapping Modal
const showMappingModal = ref(false)
const csvHeaders = ref([])
const currentMappingFile = ref(null)
const customMappings = ref([])
const showCustomMappings = ref(false)
const showCusipManagement = ref(false)
const deletingMappingId = ref(null)
const mappingToDelete = ref(null)

// Delete confirmation modal
const showDeleteModal = ref(false)
const showDeleteMappingModal = ref(false)
const deleteImportId = ref(null)
const deleteImportData = ref(null)

// Multi-select for bulk delete
const selectedImportIds = ref(new Set())
const bulkDeleting = ref(false)
const bulkDeleteIds = ref(null)
const bulkDeleteDetails = ref([])
const bulkDeleteTotalTrades = ref(0)

// Broker mismatch modal
const showBrokerMismatchModal = ref(false)
const brokerMismatchData = ref({
  selectedBroker: '',
  detectedBroker: '',
  detectedHeaders: [],
  rowCount: 0,
  fileName: ''
})

// Import results modal
const showImportResultsModal = ref(false)
const importResultsData = ref({
  tradesImported: 0,
  duplicatesSkipped: 0,
  diagnostics: null,
  failedTrades: [],
  achievements: []
})
const activeImportStartedAt = ref(null)
let activeFileAnalysisId = 0

const showDemoDataCta = computed(() => getFeatureValue('import_zero_trades_demo_data_cta', true))

const popularBrokerOptions = [
  { value: 'auto', label: 'Auto-Detect' },
  { value: 'schwab', label: 'Schwab' },
  { value: 'thinkorswim', label: 'thinkorswim' },
  { value: 'ibkr', label: 'IBKR' },
  { value: 'tradovate', label: 'Tradovate' },
  { value: 'tradingview', label: 'TradingView' }
]

const selectedBrokerLabel = computed(() => {
  if (selectedBroker.value?.startsWith('custom:')) {
    const mapping = customMappings.value.find(item => `custom:${item.id}` === selectedBroker.value)
    return mapping?.mapping_name || 'Custom Importer'
  }

  if (selectedBroker.value === 'auto') return 'Auto-Detect'
  if (selectedBroker.value === 'generic') return 'Generic CSV'

  return formatBrokerName(selectedBroker.value)
})

const displayedHeaderPreview = computed(() => fileAnalysis.value.headers.slice(0, 6))

const brokerRecommendation = computed(() => {
  if (!selectedFile.value) {
    return 'Upload a file to see guidance.'
  }

  if (selectedBroker.value === 'auto') {
    return fileAnalysis.value.detectedBroker
      ? `We can probably route this as ${formatBrokerName(fileAnalysis.value.detectedBroker)}.`
      : 'Best for first-time imports and supported brokers.'
  }

  if (!fileAnalysis.value.detectedBroker) {
    return 'If this is a custom export, Generic CSV is the safer choice.'
  }

  if (selectedBroker.value !== 'generic' && selectedBroker.value !== fileAnalysis.value.detectedBroker) {
    return `Headers look closer to ${formatBrokerName(fileAnalysis.value.detectedBroker)}.`
  }

  return 'Selected format matches the file we inspected.'
})

const accountReadinessLabel = computed(() => {
  if (!requiresAccountSelection.value) return 'Optional'
  if (selectedAccountId.value === 'none') return 'No account'
  if (selectedAccountId.value !== null) return 'Assigned'
  return 'Needs selection'
})

const accountReadinessMessage = computed(() => {
  if (!requiresAccountSelection.value) return 'This import can continue without selecting an account.'
  if (selectedAccountId.value === 'none') return 'Trades will be imported without linking to an existing account.'
  if (selectedAccountId.value !== null) return 'Trades will be attached to your selected account.'
  return 'Pick an account before starting import.'
})

const fileReadinessMessage = computed(() => {
  if (!selectedFile.value) return 'Upload a CSV file to start.'
  if (isAnalyzingFile.value) return 'Analyzing your file before import.'
  if (!fileAnalysis.value.headers.length) return 'We could not read headers from this file yet.'
  if (!fileAnalysis.value.formatDetected) return 'This file may need Generic CSV or column mapping.'
  return `This file looks import-ready${fileAnalysis.value.detectedBroker ? ` for ${formatBrokerName(fileAnalysis.value.detectedBroker)}` : ''}.`
})

const importButtonLabel = computed(() => {
  if (fileAnalysis.value.rowCount && fileAnalysis.value.rowCount > 0) {
    return `Import ~${fileAnalysis.value.rowCount.toLocaleString()} Trades`
  }

  return 'Import Trades'
})

function runWhenIdle(callback, timeout = 1500) {
  if (typeof window === 'undefined') return

  if (window.requestIdleCallback) {
    window.requestIdleCallback(() => callback(), { timeout })
    return
  }

  window.setTimeout(callback, 1)
}

async function handleFileSelect(event) {
  const file = event.target.files[0]
  console.log('File selected:', {
    name: file?.name,
    type: file?.type,
    size: file?.size,
    lastModified: file?.lastModified
  })
  
  await setSelectedFile(file, 'picker')
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatDate(date) {
  if (!date) return ''
  return formatDateTimeTz(date)
}

function formatBrokerName(broker) {
  const brokerLabels = {
    schwab: 'Charles Schwab',
    thinkorswim: 'thinkorswim',
    ibkr: 'Interactive Brokers',
    lightspeed: 'Lightspeed',
    webull: 'Webull',
    etrade: 'E*TRADE',
    tradingview: 'TradingView',
    tradingview_performance: 'TradingView',
    tradingview_paper: 'TradingView',
    tradervue: 'TraderVue',
    avatrade: 'AvaTrade',
    tradovate: 'Tradovate',
    questrade: 'Questrade',
    tradestation: 'TradeStation',
    tastytrade: 'Tastytrade',
    other: 'Other'
  }
  return brokerLabels[broker] || broker
}

function redactAccountId(accountId) {
  if (!accountId) return null
  const str = String(accountId).trim()
  if (str.length <= 4) return str
  return '****' + str.slice(-4)
}

function resetFileAnalysis() {
  fileAnalysis.value = {
    rowCount: null,
    headers: [],
    formatDetected: false,
    detectedBroker: ''
  }
}

function selectQuickBroker(broker) {
  selectedBroker.value = broker
  track('import_broker_quick_pick', { broker })
}

function handleDragOver(event) {
  event.preventDefault()
  dragOver.value = true
}

function handleDragLeave(event) {
  event.preventDefault()
  dragOver.value = false
}

async function handleDrop(event) {
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
    
    await setSelectedFile(file, 'drop')
  }
}

function getStatusClass(status) {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
    case 'processing':
      return 'bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400'
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

// Count CSV rows (excluding header)
async function countCSVRows(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target.result
        const lines = text.split('\n').filter(line => line.trim())
        // Subtract 1 for header row
        const rowCount = Math.max(0, lines.length - 1)
        resolve(rowCount)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

// Parse CSV headers from file
async function parseCSVHeaders(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target.result
        const lines = text.split('\n')

        // Find the header line - prefer lines that look like actual column headers
        // (e.g., containing "date", "time", "type") over title/section rows
        // This handles ThinkorSwim CSVs that start with "Account Statement for..."
        let headerLine = ''
        let fallbackLine = ''
        for (let i = 0; i < Math.min(15, lines.length); i++) {
          const line = lines[i].trim()
          if (!line || !line.includes(',')) continue
          const lower = line.toLowerCase()
          // Check if this looks like a real header row with column names
          if ((lower.includes('date') && lower.includes('time') && lower.includes('type')) ||
              (lower.includes('symbol') && (lower.includes('quantity') || lower.includes('qty') || lower.includes('price'))) ||
              (lower.includes('action') && lower.includes('description')) ||
              (lower.includes('trade number') || lower.includes('order id'))) {
            headerLine = line
            break
          }
          // Keep the first non-empty line as a fallback
          if (!fallbackLine) {
            fallbackLine = line
          }
        }
        if (!headerLine) {
          headerLine = fallbackLine
        }

        if (!headerLine) {
          resolve([])
          return
        }

        // Try different delimiters
        let headers = []
        const delimiters = [',', ';', '\t', '|']

        for (const delimiter of delimiters) {
          const cols = headerLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''))
          if (cols.length > 1) {
            headers = cols
            break
          }
        }

        resolve(headers.filter(h => h))
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function detectBrokerFromHeaders(headers) {
  if (!headers || headers.length === 0) return false

  const lowerHeaders = headers.map(h => h.toLowerCase())
  const headersStr = lowerHeaders.join(',')

  // ThinkorSwim detection
  if (headersStr.includes('date') && headersStr.includes('time') && headersStr.includes('type') &&
      headersStr.includes('ref #') && headersStr.includes('description')) {
    return 'thinkorswim'
  }

  // AvaTrade detection (German-language order export)
  if (headersStr.includes('seite') && headersStr.includes('erfüllungsmenge') &&
      headersStr.includes('order-nummer') && headersStr.includes('platzierungszeit')) {
    return 'avatrade'
  }

  // TradingView detection
  if (headersStr.includes('symbol') && headersStr.includes('side') &&
      headersStr.includes('fill price') && headersStr.includes('status') &&
      headersStr.includes('order id') && headersStr.includes('leverage')) {
    return 'tradingview'
  }

  // Lightspeed detection
  if ((headersStr.includes('trade number') || headersStr.includes('sequence number')) &&
      (headersStr.includes('execution time') || headersStr.includes('raw exec')) &&
      (headersStr.includes('commission amount') || headersStr.includes('feesec'))) {
    return 'lightspeed'
  }

  // PaperMoney detection
  if (headersStr.includes('exec time') && headersStr.includes('pos effect') &&
      headersStr.includes('spread')) {
    return 'papermoney'
  }

  // Schwab detection (two formats)
  if ((headersStr.includes('opened date') && headersStr.includes('closed date') && headersStr.includes('gain/loss')) ||
      (headersStr.includes('symbol') && headersStr.includes('quantity') && headersStr.includes('cost per share') && headersStr.includes('proceeds per share'))) {
    return 'schwab'
  }
  if (headersStr.includes('action') && headersStr.includes('fees & comm') &&
      (headersStr.includes('date') && headersStr.includes('symbol') && headersStr.includes('description'))) {
    return 'schwab'
  }

  // IBKR detection (two formats)
  if (headersStr.includes('underlyingsymbol') && headersStr.includes('strike') &&
      headersStr.includes('expiry') && headersStr.includes('put/call') &&
      headersStr.includes('multiplier') && headersStr.includes('buy/sell')) {
    return 'ibkr'
  }
  if (headersStr.includes('symbol') &&
      (headersStr.includes('date/time') || headersStr.includes('datetime')) &&
      headersStr.includes('quantity') && headersStr.includes('price') &&
      !headersStr.includes('action')) {
    return 'ibkr'
  }

  // E*TRADE detection
  if (headersStr.includes('transaction date') && headersStr.includes('transaction type') &&
      (headersStr.includes('buy') || headersStr.includes('sell'))) {
    return 'etrade'
  }

  // ProjectX detection
  if (headersStr.includes('contractname') && headersStr.includes('enteredat') &&
      headersStr.includes('exitedat') && headersStr.includes('pnl') &&
      headersStr.includes('tradeduration')) {
    return 'projectx'
  }

  // Tradervue detection
  if (headersStr.includes('open datetime') && headersStr.includes('close datetime') &&
      headersStr.includes('symbol') && headersStr.includes('side') &&
      headersStr.includes('volume') && headersStr.includes('entry price') &&
      headersStr.includes('exit price') && headersStr.includes('gross p&l')) {
    return 'tradervue'
  }

  // Tradovate detection
  if (headersStr.includes('b/s') && headersStr.includes('contract') &&
      headersStr.includes('product') && headersStr.includes('fill time') &&
      (headersStr.includes('avgprice') || headersStr.includes('avg fill price')) &&
      (headersStr.includes('filledqty') || headersStr.includes('filled qty'))) {
    return 'tradovate'
  }

  // Questrade detection
  if (headersStr.includes('fill qty') && headersStr.includes('fill price') &&
      headersStr.includes('exec time') && headersStr.includes('option') &&
      headersStr.includes('strategy')) {
    return 'questrade'
  }

  // TradeStation detection
  if (headersStr.includes('account') && headersStr.includes('t/d') &&
      headersStr.includes('s/d') && headersStr.includes('exec time') &&
      (headersStr.includes('gross proceeds') || headersStr.includes('net proceeds'))) {
    return 'tradestation'
  }

  // TradingView Performance detection
  if (headersStr.includes('buyfillid') && headersStr.includes('sellfillid') &&
      headersStr.includes('boughttimestamp') && headersStr.includes('soldtimestamp') &&
      headersStr.includes('pnl')) {
    return 'tradingview_performance'
  }

  // Generic CSV detection - check if it has basic required fields
  // Include common non-English equivalents for broader detection
  const hasSymbol = lowerHeaders.some(h => h.includes('symbol') || h.includes('ticker') || h.includes('stock'))
  const hasSide = lowerHeaders.some(h => h.includes('side') || h.includes('direction') || h.includes('type') || h.includes('action') ||
    h.includes('seite') || h.includes('côté') || h.includes('lado'))
  const hasQuantity = lowerHeaders.some(h => h.includes('quantity') || h.includes('qty') || h.includes('shares') || h.includes('size') ||
    h.includes('anzahl') || h.includes('menge') || h.includes('anz.') || h.includes('quantité') || h.includes('cantidad'))
  const hasPrice = lowerHeaders.some(h => h.includes('price') || h.includes('fill') ||
    h.includes('preis') || h.includes('prix') || h.includes('precio'))

  // If it has these basic fields, consider it a generic format
  if (hasSymbol && hasSide && hasQuantity && hasPrice) {
    return 'generic'
  }

  // No known format detected
  return ''
}

// Detect if headers match a known format
function detectKnownFormat(headers) {
  return !!detectBrokerFromHeaders(headers)
}

async function analyzeSelectedFile(file) {
  if (!file) {
    resetFileAnalysis()
    return
  }

  const analysisId = ++activeFileAnalysisId
  isAnalyzingFile.value = true

  try {
    const [rowCount, headers] = await Promise.all([
      countCSVRows(file),
      parseCSVHeaders(file)
    ])
    const detectedBroker = detectBrokerFromHeaders(headers)

    if (analysisId !== activeFileAnalysisId) {
      return
    }

    fileAnalysis.value = {
      rowCount,
      headers,
      formatDetected: !!detectedBroker,
      detectedBroker
    }

    track('import_file_analyzed', {
      broker_selected: selectedBroker.value,
      detected_broker: detectedBroker || 'unknown',
      row_count: rowCount,
      header_count: headers.length
    })
  } catch (analysisError) {
    console.error('[IMPORT] Failed to analyze file:', analysisError)

    if (analysisId !== activeFileAnalysisId) {
      return
    }

    resetFileAnalysis()
  } finally {
    if (analysisId === activeFileAnalysisId) {
      isAnalyzingFile.value = false
    }
  }
}

function clearSelectedFile() {
  selectedFile.value = null
  resetFileAnalysis()
  if (document.getElementById('file-upload')) {
    document.getElementById('file-upload').value = ''
  }
}

async function setSelectedFile(file, source = 'picker') {
  if (file && (file.type === 'text/csv' || file.type === 'application/csv' || file.name.toLowerCase().endsWith('.csv'))) {
    selectedFile.value = file
    error.value = null
    console.log('File accepted:', file.name)
    track('import_file_selected', {
      source,
      file_name: file.name,
      file_size: file.size
    })
    await analyzeSelectedFile(file)
  } else {
    error.value = 'Please select a valid CSV file'
    selectedFile.value = null
    resetFileAnalysis()
    console.log('File rejected - not CSV')
  }
}

async function handleImport() {
  if (!selectedFile.value || !selectedBroker.value) {
    error.value = 'Please select a file and broker format'
    return
  }

  suppressCelebrations(15000)
  activeImportStartedAt.value = Date.now()

  // Validate account selection if required (null means not selected, "none" means explicitly no account)
  if (requiresAccountSelection.value && selectedAccountId.value === null) {
    error.value = 'Please select a trading account or choose "None" for this import'
    return
  }

  // Convert "none" to null for the API
  const accountIdToSend = selectedAccountId.value === 'none' ? null : selectedAccountId.value

  console.log('Starting import with:', {
    fileName: selectedFile.value.name,
    fileSize: selectedFile.value.size,
    fileType: selectedFile.value.type,
    broker: selectedBroker.value
  })

  loading.value = true
  error.value = null
  importStage.value = 'Validating file...'
  track('import_started', {
    broker: selectedBroker.value,
    file_name: selectedFile.value.name,
    estimated_rows: fileAnalysis.value.rowCount
  })

  try {
    // Pre-check: Count rows and check tier limits before uploading
    const tradeCount = await countCSVRows(selectedFile.value)
    console.log(`[IMPORT] Detected ${tradeCount} trades in CSV file`)

    // Check tier limits for free users
    const userTier = authStore.user?.tier || 'free'
    const FREE_TIER_IMPORT_LIMIT = 100

    if (userTier === 'free' && tradeCount > FREE_TIER_IMPORT_LIMIT) {
      console.log(`[IMPORT] Free tier user attempting to import ${tradeCount} trades (limit: ${FREE_TIER_IMPORT_LIMIT})`)
      loading.value = false
      importStage.value = ''
      showCurrencyProModal.value = true
      currencyProMessage.value = `Free tier imports are limited to ${FREE_TIER_IMPORT_LIMIT} executions per batch. Your file contains ${tradeCount} executions. You can still import all your trades - just split the file into smaller batches of ${FREE_TIER_IMPORT_LIMIT} or fewer. Upgrade to Pro for unlimited batch sizes.`
      return
    }

    console.log(`[IMPORT] Tier check passed (${userTier}), proceeding with format detection`)

    // Extract mapping ID if custom mapping is selected
    let mappingId = null
    let broker = selectedBroker.value

    if (selectedBroker.value.startsWith('custom:')) {
      mappingId = selectedBroker.value.substring(7) // Remove "custom:" prefix
      broker = 'generic' // Use generic parser with custom mapping
      console.log(`[IMPORT] Using custom mapping ID: ${mappingId}`)
    }

    // Pre-validate: Check for broker format mismatch (only if user selected a specific broker)
    if (broker !== 'auto' && broker !== 'generic' && !mappingId) {
      console.log(`[IMPORT] Validating broker format...`)
      try {
        const validationFormData = new FormData()
        validationFormData.append('file', selectedFile.value)
        validationFormData.append('broker', broker)

        const validationResult = await api.post('/trades/import/validate', validationFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        const validation = validationResult.data
        console.log(`[IMPORT] Validation result:`, validation)

        if (validation.mismatch) {
          console.log(`[IMPORT] Broker mismatch detected: selected=${validation.selectedBroker}, detected=${validation.detectedBroker}`)
          loading.value = false
          brokerMismatchData.value = {
            selectedBroker: validation.selectedBroker,
            detectedBroker: validation.detectedBroker,
            detectedHeaders: validation.detectedHeaders,
            rowCount: validation.rowCount,
            fileName: validation.fileName
          }
          showBrokerMismatchModal.value = true
          return
        }
      } catch (validationErr) {
        console.warn('[IMPORT] Validation check failed, proceeding with import:', validationErr.message)
        // Continue with import even if validation fails
      }
    }

    // Pre-check: Try to detect format if using auto-detect or generic (and no custom mapping)
    if ((selectedBroker.value === 'auto' || selectedBroker.value === 'generic') && !mappingId) {
      const headers = await parseCSVHeaders(selectedFile.value)
      console.log(`[IMPORT] Parsed headers:`, headers)

      const formatDetected = detectKnownFormat(headers)
      console.log(`[IMPORT] Format detection result:`, formatDetected)

      // If no known format detected, show mapping modal before importing
      if (!formatDetected) {
        console.log('[IMPORT] Unknown format - showing column mapping modal')
        loading.value = false
        csvHeaders.value = headers
        currentMappingFile.value = selectedFile.value
        showMappingModal.value = true
        track('import_mapping_requested', {
          reason: 'unknown_format_precheck',
          broker: selectedBroker.value,
          header_count: headers.length
        })
        showError(
          'Format Not Recognized',
          'Your CSV format was not recognized. Please map the columns to import your trades.'
        )
        return
      }

      console.log(`[IMPORT] Known format detected, proceeding with import`)
    }

    importStage.value = `Uploading and processing${tradeCount ? ` ~${tradeCount} trades` : ''}...`
    const result = await tradesStore.importTrades(selectedFile.value, broker, mappingId, accountIdToSend)
    console.log('Import result:', result)
    importStage.value = 'Processing trades...'
    showSuccess('Import Started', `Import has been queued. Import ID: ${result.importId}`)

    // Save broker preference to localStorage
    localStorage.setItem('lastSelectedBroker', selectedBroker.value)

    // Reset form (but keep broker selection)
    selectedFile.value = null
    // Don't reset selectedBroker - keep it for next import
    if (fileInput.value) {
      fileInput.value.value = ''
    }

    // Refresh import history
    fetchImportHistory()
    startImportHistoryPolling()

    // Poll import status for achievements
    pollImportStatus(result.importId)
  } catch (err) {
    console.error('Import error:', err)
    console.error('Error response:', err.response)
    const errorMessage = err.response?.data?.error || err.message || 'Import failed'

    // Check if this is a currency pro tier error
    if (errorMessage.includes('CURRENCY_REQUIRES_PRO') || errorMessage.includes('Currency conversion is a Pro feature')) {
      const message = errorMessage.split(':')[1] || 'Currency conversion is a Pro feature. Please upgrade to Pro to import trades with non-USD currencies.'
      showCurrencyProModal.value = true
      currencyProMessage.value = message
    }
    // Check if this is a batch import limit error
    else if (errorMessage.includes('trades per import') || errorMessage.includes('batch import')) {
      showCurrencyProModal.value = true
      currencyProMessage.value = errorMessage
    }
    // Check if this is an unsupported format or missing columns error
    else if (
      errorMessage.toLowerCase().includes('unsupported') ||
      errorMessage.toLowerCase().includes('not supported') ||
      errorMessage.toLowerCase().includes('unknown format') ||
      errorMessage.toLowerCase().includes('missing required') ||
      errorMessage.toLowerCase().includes('could not parse') ||
      errorMessage.toLowerCase().includes('failed to parse')
    ) {
      // Parse CSV headers and show mapping modal
      try {
        const headers = await parseCSVHeaders(selectedFile.value)
        if (headers.length > 0) {
          csvHeaders.value = headers
          currentMappingFile.value = selectedFile.value
          showMappingModal.value = true
          track('import_mapping_requested', {
            reason: 'import_error_fallback',
            broker: selectedBroker.value,
            header_count: headers.length
          })
        } else {
          error.value = 'Could not parse CSV headers. Please check your file format.'
          showError('Import Failed', error.value)
        }
      } catch (parseErr) {
        console.error('Error parsing CSV headers:', parseErr)
        error.value = errorMessage
        showError('Import Failed', error.value)
      }
    }
    else {
      error.value = errorMessage
      showError('Import Failed', error.value)
    }
  } finally {
    loading.value = false
    importStage.value = ''
  }
}

// Broker mismatch modal handlers
function handleBrokerMismatchClose() {
  showBrokerMismatchModal.value = false
  brokerMismatchData.value = {
    selectedBroker: '',
    detectedBroker: '',
    detectedHeaders: [],
    rowCount: 0,
    fileName: ''
  }
}

async function handleUseBrokerDetected(detectedBroker) {
  console.log(`[IMPORT] User chose to use detected broker: ${detectedBroker}`)
  showBrokerMismatchModal.value = false

  // Update selected broker to the detected one and re-run import
  selectedBroker.value = detectedBroker

  // Re-run import with the detected broker
  await handleImport()
}

async function handleKeepBrokerSelected(selectedBrokerValue) {
  console.log(`[IMPORT] User chose to keep selected broker: ${selectedBrokerValue}`)
  showBrokerMismatchModal.value = false
  suppressCelebrations(15000)
  activeImportStartedAt.value = Date.now()

  // Continue with original import - re-run handleImport but skip validation this time
  // by temporarily setting a flag
  loading.value = true
  error.value = null
  importStage.value = 'Uploading and processing...'

  try {
    // Extract mapping ID if custom mapping is selected
    let mappingId = null
    let broker = selectedBroker.value

    if (selectedBroker.value.startsWith('custom:')) {
      mappingId = selectedBroker.value.substring(7)
      broker = 'generic'
    }

    // Get account to send
    let accountIdToSend = null
    if (requiresAccountSelection.value && selectedAccountId.value !== null && selectedAccountId.value !== 'none') {
      accountIdToSend = selectedAccountId.value
    }

    const result = await tradesStore.importTrades(selectedFile.value, broker, mappingId, accountIdToSend)
    console.log('Import result:', result)
    importStage.value = 'Processing trades...'
    showSuccess('Import Started', `Import has been queued. Import ID: ${result.importId}`)

    // Save broker preference to localStorage
    localStorage.setItem('lastSelectedBroker', selectedBroker.value)

    // Reset form (but keep broker selection)
    selectedFile.value = null
    if (fileInput.value) {
      fileInput.value.value = ''
    }

    // Refresh import history
    fetchImportHistory()
    startImportHistoryPolling()

    // Poll import status for achievements and results
    pollImportStatus(result.importId)
  } catch (err) {
    console.error('Import error:', err)
    const errorMessage = err.response?.data?.error || err.message || 'Import failed'
    error.value = errorMessage
    showError('Import Failed', error.value)
  } finally {
    loading.value = false
    importStage.value = ''
  }
}

// Import results modal handler
function handleImportResultsClose() {
  showImportResultsModal.value = false
  track('import_results_closed', {
    trades_imported: importResultsData.value.tradesImported,
    duplicates_skipped: importResultsData.value.duplicatesSkipped
  })
  importResultsData.value = {
    tradesImported: 0,
    duplicatesSkipped: 0,
    diagnostics: null,
    failedTrades: [],
    achievements: []
  }
}

async function handleImportResultsViewAnalytics() {
  handleImportResultsClose()
  await router.push({ name: 'metrics' })
}

async function handleImportResultsViewTrades() {
  handleImportResultsClose()
  await router.push({ name: 'trades' })
}

async function handleLoadDemoData() {
  if (creatingDemoData.value) {
    return
  }

  creatingDemoData.value = true

  try {
    await api.post('/trades/sample-data')
    track('demo_data_loaded_after_zero_import', {
      broker: selectedBroker.value,
      detected_broker: importResultsData.value.diagnostics?.detectedBroker || 'unknown'
    })
    handleImportResultsClose()
    showSuccess('Demo Data Ready', 'Sample trades were added so you can explore the product while you sort out your CSV.')
    await router.push({ name: 'dashboard' })
  } catch (err) {
    console.error('[IMPORT] Failed to load demo data:', err)
    showError('Demo Data Failed', err.response?.data?.error || 'Failed to load demo data')
  } finally {
    creatingDemoData.value = false
  }
}

function getImportAchievementWindowStart() {
  return activeImportStartedAt.value ? (activeImportStartedAt.value - 10000) : (Date.now() - 60000)
}

function formatAchievementToast(notifications, achievements) {
  const achievementNames = achievements
    .slice(0, 2)
    .map(achievement => achievement.name)
    .join(', ')

  if (achievements.length > 0) {
    if (achievements.length === 1) {
      return {
        title: 'Achievement Unlocked',
        message: achievementNames
      }
    }

    return {
      title: `${achievements.length} Achievements Unlocked`,
      message: achievements.length > 2
        ? `${achievementNames}, and ${achievements.length - 2} more`
        : achievementNames
    }
  }

  const levelUp = notifications.find(notification => notification.type === 'level_up')

  return {
    title: 'Progress Updated',
    message: levelUp?.message || 'Your latest import updated your gamification progress.'
  }
}

async function getImportAchievementNotifications() {
  const createdAfter = getImportAchievementWindowStart()
  const response = await api.get('/notifications', {
    params: {
      limit: 25,
      unread_only: true
    }
  })

  const notifications = (response.data?.data || []).filter(notification => {
    if (!['achievement_earned', 'level_up'].includes(notification.type)) {
      return false
    }

    const createdAt = Date.parse(notification.created_at)
    return !Number.isNaN(createdAt) && createdAt >= createdAfter
  })

  const achievements = notifications
    .filter(notification => notification.type === 'achievement_earned')
    .map(notification => ({
      id: notification.id,
      name: notification.symbol || notification.message?.replace(/^Achievement unlocked:\s*/i, '') || 'Achievement'
    }))

  return {
    notifications,
    achievements
  }
}

async function fetchImportHistory(page = 1) {
  try {
    const response = await api.get('/trades/import/history', {
      params: {
        page,
        limit: pagination.value.limit
      }
    })
    
    if (page === 1) {
      importHistory.value = response.data.imports || []
    } else {
      // Append to existing history for "Load More"
      importHistory.value.push(...(response.data.imports || []))
    }
    
    pagination.value = response.data.pagination || {
      page: 1,
      limit: 5,
      total: 0,
      totalPages: 0,
      hasMore: false
    }

    syncImportHistoryPolling(importHistory.value)
  } catch (error) {
    console.error('Failed to fetch import history:', error)
  }
}

function loadMoreHistory() {
  if (pagination.value.hasMore) {
    fetchImportHistory(pagination.value.page + 1)
  }
}

function hasActiveImportHistory(imports = importHistory.value) {
  return imports.some(importLog => ['pending', 'processing'].includes(importLog.status))
}

function startImportHistoryPolling() {
  if (importHistoryInterval) return
  importHistoryInterval = window.setInterval(() => {
    fetchImportHistory()
  }, 5000)
}

function stopImportHistoryPolling() {
  if (!importHistoryInterval) return
  clearInterval(importHistoryInterval)
  importHistoryInterval = null
}

function syncImportHistoryPolling(imports = importHistory.value) {
  if (hasActiveImportHistory(imports)) {
    startImportHistoryPolling()
    return
  }

  stopImportHistoryPolling()
}

function deleteImport(importId) {
  // Find the import data to show in modal
  const importData = importHistory.value.find(imp => imp.id === importId)
  
  deleteImportId.value = importId
  deleteImportData.value = importData
  showDeleteModal.value = true
}

async function confirmDelete() {
  // Bulk delete path
  if (bulkDeleteIds.value) {
    bulkDeleting.value = true
    try {
      const response = await api.delete('/trades/import/bulk', {
        data: { importIds: bulkDeleteIds.value }
      })
      showSuccess('Imports Deleted', `${response.data.deletedImports} imports and ${response.data.deletedTrades} trades deleted`)
      selectedImportIds.value = new Set()
      await fetchImportHistory()
      await tradesStore.fetchTrades()
      await tradesStore.fetchAnalytics()
      showDeleteModal.value = false
    } catch (error) {
      showError('Delete Failed', error.response?.data?.error || 'Failed to delete imports')
    } finally {
      bulkDeleting.value = false
      bulkDeleteIds.value = null
      bulkDeleteDetails.value = []
      bulkDeleteTotalTrades.value = 0
    }
    return
  }

  // Single delete path
  if (!deleteImportId.value) return

  deleting.value = true

  try {
    await api.delete(`/trades/import/${deleteImportId.value}`)
    showSuccess('Import Deleted', 'Import and associated trades have been deleted')
    selectedImportIds.value.delete(deleteImportId.value)
    await fetchImportHistory()
    await tradesStore.fetchTrades()
    await tradesStore.fetchAnalytics()
    showDeleteModal.value = false
  } catch (error) {
    showError('Delete Failed', error.response?.data?.error || 'Failed to delete import')
  } finally {
    deleting.value = false
    deleteImportId.value = null
    deleteImportData.value = null
  }
}

function cancelDelete() {
  showDeleteModal.value = false
  deleteImportId.value = null
  deleteImportData.value = null
  bulkDeleteIds.value = null
  bulkDeleteDetails.value = []
  bulkDeleteTotalTrades.value = 0
}

function toggleImportSelection(importId) {
  const newSet = new Set(selectedImportIds.value)
  if (newSet.has(importId)) {
    newSet.delete(importId)
  } else {
    newSet.add(importId)
  }
  selectedImportIds.value = newSet
}

function toggleSelectAll() {
  if (selectedImportIds.value.size === importHistory.value.length) {
    selectedImportIds.value = new Set()
  } else {
    selectedImportIds.value = new Set(importHistory.value.map(imp => imp.id))
  }
}

function bulkDeleteImports() {
  const ids = Array.from(selectedImportIds.value)
  const details = importHistory.value.filter(imp => selectedImportIds.value.has(imp.id))
  const totalTrades = details.reduce((sum, imp) => sum + (imp.trades_imported || 0), 0)

  bulkDeleteIds.value = ids
  bulkDeleteDetails.value = details
  bulkDeleteTotalTrades.value = totalTrades
  deleteImportId.value = null
  deleteImportData.value = null
  showDeleteModal.value = true
}

async function fetchLogs(showAll = null, page = 1) {
  try {
    // If showAll is explicitly passed, update the state and reset page
    if (showAll !== null) {
      logFilesPagination.value.showAll = showAll
      page = 1
    }
    
    const response = await api.get('/trades/import/logs', {
      params: { 
        showAll: logFilesPagination.value.showAll.toString(),
        page,
        limit: logFilesPagination.value.limit
      }
    })
    
    if (page === 1) {
      logFiles.value = response.data.logFiles || []
    } else {
      // Append for "Load More"
      logFiles.value.push(...(response.data.logFiles || []))
    }
    
    logFilesPagination.value = {
      ...logFilesPagination.value,
      ...response.data.pagination
    }
    
    if (page === 1) {
      showLogs.value = true
    }
  } catch (error) {
    showError('Load Failed', 'Failed to load log files')
  }
}

function toggleLogFiles() {
  fetchLogs(!logFilesPagination.value.showAll)
}

function loadMoreLogFiles() {
  if (logFilesPagination.value.hasMore) {
    fetchLogs(null, logFilesPagination.value.page + 1)
  }
}

// Computed property for highlighted log content
const highlightedLogContent = computed(() => {
  if (!logContent.value) return ''

  // Escape HTML entities first to prevent XSS from log content
  const escaped = logContent.value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  if (!logSearchQuery.value) {
    return escaped
  }

  try {
    const query = logSearchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(${query})`, 'gi')
    return escaped.replace(regex, '<mark class="bg-yellow-300 dark:bg-yellow-600 text-black dark:text-white">$1</mark>')
  } catch (error) {
    return escaped
  }
})

// Search logs function - debounced server-side search
let searchTimeout = null
function searchLogs() {
  // Clear existing timeout
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  
  // Debounce the search to avoid too many requests
  searchTimeout = setTimeout(() => {
    if (selectedLogFile.value) {
      // Reload log file with search query
      loadLogFile(selectedLogFile.value, 1, logPagination.value.showAll, logSearchQuery.value)
    }
  }, 300) // 300ms debounce
}

// Clear search
function clearSearch() {
  logSearchQuery.value = ''
  searchResults.value = null
  // Reload without search
  if (selectedLogFile.value) {
    loadLogFile(selectedLogFile.value, 1, logPagination.value.showAll, '')
  }
}

async function loadLogFile(filename, page = 1, showAll = null, search = null) {
  try {
    selectedLogFile.value = filename
    
    // Only reset search if explicitly loading a new file (search is null)
    if (search === null && page === 1) {
      logSearchQuery.value = ''
      searchResults.value = null
    } else if (search !== null) {
      // Search was explicitly provided (including empty string to clear)
      logSearchQuery.value = search
    }
    
    // If showAll is explicitly passed, update the state, otherwise use current state
    if (showAll !== null) {
      logPagination.value.showAll = showAll
      page = 1 // Reset to first page when toggling view
    }
    
    // On first load, default to showing only last 24 hours
    if (showAll === null && page === 1 && search === null) {
      logPagination.value.showAll = false
    }
    
    const response = await api.get(`/trades/import/logs/${filename}`, {
      params: {
        page,
        limit: logPagination.value.limit,
        showAll: logPagination.value.showAll.toString(),
        search: logSearchQuery.value
      }
    })
    
    if (page === 1) {
      logContent.value = response.data.content || 'No content available'
      originalLogContent.value = logContent.value
    } else {
      // Append to existing content for "Load More"
      logContent.value += '\n' + (response.data.content || '')
      originalLogContent.value = logContent.value
    }
    
    logPagination.value = {
      ...logPagination.value,
      ...response.data.pagination
    }
    
    // Update search results if searching
    if (response.data.pagination.searchQuery) {
      searchResults.value = {
        matchCount: response.data.pagination.searchMatchCount || 0,
        lineCount: response.data.pagination.searchLineCount || 0
      }
    } else {
      searchResults.value = null
    }
  } catch (error) {
    showError('Load Failed', 'Failed to load log file content')
    logContent.value = 'Failed to load content'
  }
}

function loadMoreLogs() {
  if (logPagination.value.hasMore && selectedLogFile.value) {
    loadLogFile(selectedLogFile.value, logPagination.value.page + 1, null, logSearchQuery.value)
  }
}

function toggleLogView() {
  if (selectedLogFile.value) {
    loadLogFile(selectedLogFile.value, 1, !logPagination.value.showAll, logSearchQuery.value)
  }
}

async function addCusipMapping() {
  if (!cusipForm.value.cusip || !cusipForm.value.ticker) {
    return
  }

  cusipLoading.value = true
  
  try {
    const response = await fetch('/api/cusip-mappings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tradesStore.token || localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        cusip: cusipForm.value.cusip.toUpperCase(),
        ticker: cusipForm.value.ticker.toUpperCase(),
        verified: true
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      showSuccess('CUSIP Mapping Added', `${cusipForm.value.cusip} → ${cusipForm.value.ticker}${result.tradesUpdated ? ` (${result.tradesUpdated} trades updated)` : ''}`)
      
      // Reset form
      cusipForm.value.cusip = ''
      cusipForm.value.ticker = ''
      
      // Refresh unmapped count
      await fetchUnmappedCusipsCount()
    } else {
      const error = await response.json()
      showError('Add Failed', error.error || 'Failed to add CUSIP mapping')
    }
  } catch (error) {
    showError('Add Failed', 'Failed to add CUSIP mapping')
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
    // Use the database function to get mapping
    const response = await fetch(`/api/cusip-mappings?search=${lookupForm.value.cusip.toUpperCase()}&limit=1`, {
      headers: {
        'Authorization': `Bearer ${tradesStore.token || localStorage.getItem('token')}`
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      if (data.data && data.data.length > 0) {
        const mapping = data.data[0]
        lookupResult.value = {
          found: true,
          cusip: mapping.cusip,
          ticker: mapping.ticker,
          source: mapping.resolution_source,
          verified: mapping.verified
        }
      } else {
        lookupResult.value = {
          found: false,
          cusip: lookupForm.value.cusip.toUpperCase()
        }
      }
    } else {
      throw new Error('Failed to lookup CUSIP')
    }
  } catch (error) {
    showError('Lookup Failed', 'Failed to lookup CUSIP')
    lookupResult.value = {
      found: false,
      cusip: lookupForm.value.cusip.toUpperCase()
    }
  } finally {
    cusipLoading.value = false
  }
}

// Removed fetchCusipMappings since mappings are no longer displayed in main UI
// All CUSIP management is now handled through the comprehensive modal

async function deleteCusipMapping(cusip) {
  if (!confirm(`Are you sure you want to delete the mapping for ${cusip}?`)) {
    return
  }
  
  cusipLoading.value = true
  
  try {
    const response = await fetch(`/api/cusip-mappings/${cusip}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tradesStore.token || localStorage.getItem('token')}`
      }
    })
    
    if (response.ok) {
      showSuccess('CUSIP Mapping Deleted', `Mapping for ${cusip} has been deleted`)
      await fetchUnmappedCusipsCount()
    } else {
      const error = await response.json()
      showError('Delete Failed', error.error || 'Failed to delete CUSIP mapping')
    }
  } catch (error) {
    showError('Delete Failed', 'Failed to delete CUSIP mapping')
  } finally {
    cusipLoading.value = false
  }
}

// Fetch unmapped CUSIPs count
async function fetchUnmappedCusipsCount() {
  try {
    // Add cache busting parameter
    const url = `/api/cusip-mappings/unmapped?_t=${Date.now()}`
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${tradesStore.token || localStorage.getItem('token')}`,
        'Cache-Control': 'no-cache'
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      const newCount = (data.data || []).length
      const oldCount = unmappedCusipsCount.value
      
      unmappedCusips.value = data.data || []
      unmappedCusipsCount.value = newCount
      
      // Log updates for debugging
      if (newCount !== oldCount) {
        console.log(`[CUSIP POLLING] Count updated: ${oldCount} → ${newCount}`)
      } else {
        console.log(`[CUSIP POLLING] Count unchanged: ${newCount}`)
      }
    } else {
      console.error('[CUSIP POLLING] API error:', response.status, response.statusText)
    }
  } catch (error) {
    console.error('Error fetching unmapped CUSIPs:', error)
  }
}

// Handle mapping created from modal
function handleMappingCreated() {
  showUnmappedModal.value = false
  fetchUnmappedCusipsCount()
}

// Handle resolution started - start polling for updates
function handleResolutionStarted(data) {
  console.log(`[CUSIP POLLING] Resolution started for ${data.total} CUSIPs - starting polling every 3 seconds`)

  let pollCount = 0

  // Start polling every 3 seconds to update the count
  const pollInterval = setInterval(async () => {
    pollCount++
    console.log(`[CUSIP POLLING] Poll #${pollCount} - checking for updates...`)

    await fetchUnmappedCusipsCount()

    // Stop polling if no more unmapped CUSIPs
    if (unmappedCusipsCount.value === 0) {
      clearInterval(pollInterval)
      console.log(`[CUSIP POLLING] Polling stopped after ${pollCount} polls - all CUSIPs resolved!`)
    }
  }, 3000)

  // Stop polling after 5 minutes regardless (safety net)
  setTimeout(() => {
    clearInterval(pollInterval)
    console.log(`[CUSIP POLLING] Polling stopped after 5 minutes timeout (${pollCount} polls completed)`)
  }, 5 * 60 * 1000)
}

// Poll import status for achievements
function pollImportStatus(importId) {
  const poll = async () => {
    try {
      suppressCelebrations(15000)
      const statusRes = await api.get(`/trades/import/status/${importId}`)
      const importLog = statusRes.data.importLog
      const status = importLog?.status

      if (status === 'completed' || status === 'failed') {
        // Show import results modal with diagnostics
        const errorDetails = importLog?.error_details || {}
        const diagnostics = errorDetails.diagnostics || null
        const tradesImported = importLog?.trades_imported || 0
        const duplicatesSkipped = errorDetails.duplicates || 0
        const failedTrades = errorDetails.failedTrades || []

        // Show results modal if we have diagnostics or notable stats
        if (diagnostics || tradesImported > 0 || duplicatesSkipped > 0 || failedTrades.length > 0) {
          importResultsData.value = {
            tradesImported,
            duplicatesSkipped,
            diagnostics,
            failedTrades,
            achievements: []
          }
          showImportResultsModal.value = true
        }

        // Show actionable help when 0 trades imported
        if (tradesImported === 0 && duplicatesSkipped === 0) {
          track('import_zero_trades', {
            broker: selectedBroker.value,
            detected_broker: diagnostics?.detectedBroker || 'unknown'
          })
          const brokerName = selectedBroker.value || 'selected'
          const isSpecificBroker = selectedBroker.value && selectedBroker.value !== 'auto' && selectedBroker.value !== 'generic'
          const suggestions = [
            isSpecificBroker
              ? `Try using Auto-Detect instead of the "${brokerName}" format`
              : 'Try selecting your specific broker format instead of Auto-Detect',
            'Make sure your file contains actual trade data, not just an account summary or positions',
            'Verify the file is a .csv file (not .xlsx or .xls)',
            'Check that the file was exported from the correct section of your broker platform'
          ]
          showImportantWarning(
            'No Trades Imported',
            `The import completed but no trades were found.\n\nSuggestions:\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
            {
              confirmText: 'OK',
              linkUrl: 'https://docs.tradetally.io/usage/importing-trades/#supported-brokers',
              linkText: 'View Documentation'
            }
          )
        }

        if (status === 'completed') {
          // Keep import results primary. Read achievement notifications that were
          // persisted during import instead of relying on a second award pass.
          try {
            suppressCelebrations(30000)
            await api.post('/gamification/achievements/check')

            const { notifications, achievements } = await getImportAchievementNotifications()
            const count = notifications.length
            if (count > 0) {
              importResultsData.value = {
                ...importResultsData.value,
                achievements
              }

              const { title, message } = formatAchievementToast(notifications, achievements)
              addUnreadNotifications(count, notifications.slice(0, 10))
              window.dispatchEvent(new CustomEvent('notifications-updated', {
                detail: {
                  unreadDelta: count,
                  notifications: notifications.slice(0, 10)
                }
              }))

              showSuccess(
                title,
                message,
                {
                  duration: 10000,
                  actions: [
                    {
                      label: 'View Notifications',
                      onClick: () => router.push({ name: 'notifications' })
                    },
                    {
                      label: 'Open Analytics',
                      style: 'primary',
                      onClick: () => router.push({ name: 'metrics' })
                    }
                  ]
                }
              )
            }
          } catch (achievementError) {
            console.warn('Achievement check after import failed:', achievementError?.message || achievementError)
          }
        }
        return
      }
    } catch (_) {}
    setTimeout(poll, 2000)
  }
  poll()
}

// Fetch custom CSV mappings
async function fetchCustomMappings() {
  try {
    const response = await api.get('/csv-mappings')
    if (response.data.success) {
      customMappings.value = response.data.data || []
      console.log('[CSV MAPPINGS] Loaded custom mappings:', customMappings.value.length)
    }
  } catch (err) {
    console.error('Error fetching custom mappings:', err)
  }
}

// Fetch import requirements (account selection)
async function fetchImportRequirements() {
  try {
    const response = await api.get('/trades/import/requirements')
    requiresAccountSelection.value = response.data.requiresAccountSelection
    accounts.value = response.data.accounts || []
    console.log('[IMPORT] Requirements loaded:', {
      requiresAccountSelection: requiresAccountSelection.value,
      accountCount: accounts.value.length
    })
    // Pre-select primary account if exists
    const primary = accounts.value.find(a => a.isPrimary)
    if (primary) {
      selectedAccountId.value = primary.id
    }
  } catch (err) {
    console.error('Error fetching import requirements:', err)
  }
}

// Confirm delete mapping
function confirmDeleteMapping(mapping) {
  console.log('[DELETE MAPPING] Confirming delete for:', mapping)
  mappingToDelete.value = mapping
  showDeleteMappingModal.value = true
  console.log('[DELETE MAPPING] showDeleteMappingModal set to:', showDeleteMappingModal.value)
  console.log('[DELETE MAPPING] mappingToDelete set to:', mappingToDelete.value)
}

// Cancel delete mapping
function cancelDeleteMapping() {
  console.log('[DELETE MAPPING] Cancelled')
  mappingToDelete.value = null
  showDeleteMappingModal.value = false
}

// Delete a custom CSV mapping
async function deleteMapping() {
  console.log('[DELETE MAPPING] deleteMapping() function called')
  console.log('[DELETE MAPPING] mappingToDelete.value:', mappingToDelete.value)

  if (!mappingToDelete.value) {
    console.error('[DELETE MAPPING] No mapping to delete')
    return
  }

  const mapping = mappingToDelete.value
  console.log('[DELETE MAPPING] Deleting mapping:', mapping.id, mapping.mapping_name)
  deletingMappingId.value = mapping.id

  try {
    console.log('[DELETE MAPPING] Making API call to /csv-mappings/' + mapping.id)
    const response = await api.delete(`/csv-mappings/${mapping.id}`)
    console.log('[DELETE MAPPING] API response:', response.data)

    if (response.data.success) {
      showSuccess('Importer Deleted', `"${mapping.mapping_name}" has been deleted`)
      console.log('[DELETE MAPPING] Fetching updated mappings list')
      await fetchCustomMappings()

      // If the deleted mapping was selected, reset to auto-detect
      if (selectedBroker.value === `custom:${mapping.id}`) {
        console.log('[DELETE MAPPING] Deleted mapping was selected, resetting to auto')
        selectedBroker.value = 'auto'
      }
    } else {
      console.error('[DELETE MAPPING] API returned success: false')
      showError('Delete Failed', 'Server returned unsuccessful response')
    }
  } catch (err) {
    console.error('[DELETE MAPPING] Error deleting mapping:', err)
    console.error('[DELETE MAPPING] Error response:', err.response)
    showError('Delete Failed', err.response?.data?.error || 'Failed to delete importer')
  } finally {
    deletingMappingId.value = null
    cancelDeleteMapping()
  }
}

// Handle CSV mapping saved - now trigger the actual import
async function handleMappingSaved(mapping) {
  console.log('[CSV MAPPING] Mapping saved:', mapping)
  showSuccess(
    'Mapping Saved',
    'Your CSV column mapping has been saved. Starting import...'
  )

  // Close the modal
  showMappingModal.value = false

  // Refresh the list of custom mappings
  await fetchCustomMappings()

  // Now actually import using the saved mapping
  if (!currentMappingFile.value) {
    showError('Import Error', 'No file selected for import')
    return
  }

  loading.value = true
  error.value = null
  importStage.value = 'Uploading and processing with custom mapping...'

  try {
    // Import with the mapping ID (convert "none" to null)
    const accountIdToSend = selectedAccountId.value === 'none' ? null : selectedAccountId.value
    const result = await tradesStore.importTrades(currentMappingFile.value, 'generic', mapping.id, accountIdToSend)
    console.log('Import result:', result)
    importStage.value = 'Processing trades...'
    showSuccess('Import Started', `Import has been queued. Import ID: ${result.importId}`)

    // Save broker preference
    localStorage.setItem('lastSelectedBroker', 'generic')

    // Clear the file reference
    currentMappingFile.value = null
    csvHeaders.value = []

    // Refresh import history
    fetchImportHistory()
    startImportHistoryPolling()

    // Poll for completion (for achievements)
    pollImportStatus(result.importId)
  } catch (err) {
    console.error('Import error after mapping:', err)
    const errorMessage = err.response?.data?.error || err.message || 'Import failed'
    error.value = errorMessage
    showError('Import Failed', error.value)
  } finally {
    loading.value = false
    importStage.value = ''
  }
}

// Fetch trial info for the import limit modal
async function fetchTrialInfo() {
  try {
    const response = await api.get('/billing/subscription')
    trialInfo.value = response.data.data?.trial || null
    hasUsedTrial.value = response.data.data?.has_used_trial || false
  } catch (err) {
    // Billing might not be available (self-hosted), that's ok
    console.log('[IMPORT] Could not fetch trial info:', err.message)
  }
}

// Start 14-day trial from the import limit modal
async function startTrial() {
  try {
    startingTrial.value = true
    console.log('[IMPORT] Starting 14-day trial...')
    console.log('[IMPORT] Current user tier before trial:', authStore.user?.tier)

    const response = await api.post('/billing/trial')
    console.log('[IMPORT] Trial API response:', response.data)

    if (response.data.success) {
      console.log('[IMPORT] Trial started successfully, refreshing user data...')

      // Refresh user data to get new tier - await the full refresh
      const updatedUser = await authStore.fetchUser()
      console.log('[IMPORT] Updated user from fetchUser:', updatedUser)
      console.log('[IMPORT] authStore.user after fetchUser:', authStore.user)
      console.log('[IMPORT] User tier after fetchUser:', authStore.user?.tier)

      // Double-check by fetching subscription info directly
      try {
        const subResponse = await api.get('/billing/subscription')
        console.log('[IMPORT] Subscription check response:', subResponse.data)
        const trialActive = subResponse.data.data?.trial?.active
        console.log('[IMPORT] Trial active from subscription check:', trialActive)
      } catch (subErr) {
        console.log('[IMPORT] Could not verify subscription:', subErr.message)
      }

      // Also refresh trial info for the modal
      await fetchTrialInfo()

      showCurrencyProModal.value = false

      // Show success modal and continue import when user clicks OK
      const fileToImport = selectedFile.value
      showSuccessModal('Trial Activated', '14-day Pro trial started! You now have unlimited batch imports.', {
        confirmText: 'Continue Import',
        onConfirm: () => {
          clearModalAlert()
          if (fileToImport) {
            console.log('[IMPORT] Re-triggering import with file:', fileToImport.name)
            nextTick().then(() => handleImport())
          }
        }
      })
    } else {
      console.error('[IMPORT] Trial API returned success: false')
      showError('Trial Failed', 'Failed to start trial. Please try again or contact support.')
    }
  } catch (err) {
    console.error('[IMPORT] Error starting trial:', err)
    const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Failed to start trial. Please try again.'
    showError('Trial Failed', errorMessage)
  } finally {
    startingTrial.value = false
  }
}

// Keep select-all checkbox indeterminate state in sync
watch(selectedImportIds, (ids) => {
  if (selectAllCheckbox.value) {
    const isIndeterminate = ids.size > 0 && ids.size < importHistory.value.length
    selectAllCheckbox.value.indeterminate = isIndeterminate
  }
}, { deep: true })

let importHistoryInterval = null

onMounted(() => {
  // Load saved broker preference
  const savedBroker = localStorage.getItem('lastSelectedBroker')
  if (savedBroker) {
    selectedBroker.value = savedBroker
  }

  fetchImportRequirements()
  if (savedBroker?.startsWith('custom:')) {
    fetchCustomMappings()
  } else {
    runWhenIdle(() => fetchCustomMappings())
  }

  // Stagger deferred calls so they don't all block the main thread at once
  runWhenIdle(() => fetchImportHistory())
  runWhenIdle(() => fetchUnmappedCusipsCount(), 2500)
  runWhenIdle(() => fetchTrialInfo(), 3500)
})

onBeforeUnmount(() => {
  stopImportHistoryPolling()
})
</script>
