<template>
  <div class="max-w-[65%] mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                <option value="auto">Auto-Detect</option>
                <option value="generic">Generic CSV</option>
                <option value="lightspeed">Lightspeed Trader</option>
                <option value="schwab">Charles Schwab</option>
                <option value="thinkorswim">ThinkorSwim</option>
                <option value="ibkr">Interactive Brokers</option>
                <option value="etrade">E*TRADE</option>
                <option value="papermoney">PaperMoney</option>
                <option value="tradingview">TradingView</option>
              </select>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Choose the format that matches your CSV file structure, or use Auto-Detect.
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
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Supported CSV Formats</h3>
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
          
          <div v-show="showFormats" class="space-y-6">
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
              <h4 class="font-medium text-gray-900 dark:text-white">ThinkorSwim</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export from ThinkorSwim's "Account Statement" section. Only processes trade (TRD) records.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                DATE,TIME,TYPE,DESCRIPTION,Commissions & Fees,Misc Fees<br>
                01/15/2024,09:30:00,TRD,"BOT +100 AAPL @150.25",1.00,0.00<br>
                01/15/2024,10:45:00,TRD,"SOLD -100 AAPL @155.50",1.00,0.00
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Required columns:</strong> DATE, TIME, TYPE (must be "TRD"), DESCRIPTION (BOT/SOLD format). Optional: Commissions & Fees, Misc Fees
              </p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">Interactive Brokers</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Export from IBKR's "Reports" > "Trade Confirmation" section.
              </p>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-xs font-mono overflow-x-auto">
                Symbol,DateTime,Quantity,Price,Commission,Fees<br>
                AAPL,2024-01-15 09:30:00,100,150.25,1.00,0.00<br>
                AAPL,2024-01-15 10:45:00,-100,155.50,1.00,0.00
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <strong>Required columns:</strong> Symbol, DateTime, Quantity (positive=buy, negative=sell), Price. Optional: Commission, Fees
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
          </div>
        </div>
      </div>


      <!-- Import History -->
      <div v-if="importHistory.length > 0" class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              Import History
              <span v-if="pagination.total > 0" class="text-sm font-normal text-gray-500 dark:text-gray-400">
                ({{ importHistory.length }} of {{ pagination.total }})
              </span>
            </h3>
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

      <!-- Logs Modal -->
      <div v-if="showLogs" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-11/12 max-w-4xl h-3/4 flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Import Logs</h3>
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
                      <span v-if="!logPagination.showAll && logPagination.filteredOut > 0" class="text-xs text-blue-600 dark:text-blue-400">
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

      <!-- CUSIP Management -->
      <div class="card">
        <div class="card-body">
          <div class="flex items-start justify-between mb-4">
            <div>
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                CUSIP Symbol Mappings
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Some brokers export trades with CUSIP codes instead of ticker symbols. Manage how these codes are mapped to ticker symbols for better organization and filtering.
              </p>
            </div>
            <div class="flex items-center space-x-2 ml-4">
              <button
                @click="showAllMappingsModal = true"
                class="btn-secondary text-sm"
              >
                <Cog6ToothIcon class="h-5 w-5 mr-2" />
                Manage All
              </button>
              <button
                v-if="unmappedCusipsCount > 0"
                @click="showUnmappedModal = true"
                class="btn-yellow text-sm"
              >
                <ExclamationTriangleIcon class="h-5 w-5 mr-2" />
                {{ unmappedCusipsCount }} Unmapped
              </button>
            </div>
          </div>
          
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
            Delete Import
          </h3>
          <div class="mt-2 px-7 py-3">
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Are you sure you want to delete this import and all associated trades?
            </p>
            <div v-if="deleteImportData" class="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md text-left">
              <p class="text-sm font-medium text-gray-900 dark:text-white">{{ deleteImportData.file_name }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {{ formatDate(deleteImportData.created_at) }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ deleteImportData.trades_imported }} trades will be deleted
              </p>
            </div>
            <p class="text-xs text-red-600 dark:text-red-400 mt-2 font-medium">
              This action cannot be undone.
            </p>
          </div>
          <div class="flex gap-3 justify-center mt-4">
            <button
              @click="showDeleteModal = false"
              class="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-base font-medium rounded-md shadow-sm hover:bg-gray-400 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300"
              :disabled="deleting"
            >
              Cancel
            </button>
            <button
              @click="confirmDelete"
              class="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
              :disabled="deleting"
            >
              <span v-if="deleting">Deleting...</span>
              <span v-else>Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

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
        <div class="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
          <router-link
            to="/pricing"
            class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:col-start-2 sm:text-sm"
            @click="showCurrencyProModal = false"
          >
            Upgrade to Pro
          </router-link>
          <button
            type="button"
            class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:col-start-1 sm:text-sm"
            @click="showCurrencyProModal = false"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useTradesStore } from '@/stores/trades'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'
import { format } from 'date-fns'
import { ArrowUpTrayIcon, XMarkIcon, ExclamationTriangleIcon, Cog6ToothIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'
import UnmappedCusipsModal from '@/components/cusip/UnmappedCusipsModal.vue'
import AllCusipMappingsModal from '@/components/cusip/AllCusipMappingsModal.vue'
import { usePriceAlertNotifications } from '@/composables/usePriceAlertNotifications'

const tradesStore = useTradesStore()
const authStore = useAuthStore()
const { showSuccess, showError } = useNotification()
const { celebrationQueue } = usePriceAlertNotifications()

const loading = ref(false)
const error = ref(null)
const selectedBroker = ref('auto')
const selectedFile = ref(null)
const showCurrencyProModal = ref(false)
const currencyProMessage = ref('')
const fileInput = ref(null)
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
// Removed cusipMappings ref since it's no longer displayed in the UI
const unmappedCusipsCount = ref(0)
const unmappedCusips = ref([])
const showUnmappedModal = ref(false)
const showAllMappingsModal = ref(false)
const allMappings = ref([])
const allMappingsLoading = ref(false)

// Delete confirmation modal
const showDeleteModal = ref(false)
const deleteImportId = ref(null)
const deleteImportData = ref(null)

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
    // Pre-check: Count rows and check tier limits before uploading
    const tradeCount = await countCSVRows(selectedFile.value)
    console.log(`[IMPORT] Detected ${tradeCount} trades in CSV file`)

    // Check tier limits for free users
    const userTier = authStore.user?.tier || 'free'
    const FREE_TIER_IMPORT_LIMIT = 100

    if (userTier === 'free' && tradeCount > FREE_TIER_IMPORT_LIMIT) {
      console.log(`[IMPORT] Free tier user attempting to import ${tradeCount} trades (limit: ${FREE_TIER_IMPORT_LIMIT})`)
      loading.value = false
      showCurrencyProModal.value = true
      currencyProMessage.value = `Free tier is limited to ${FREE_TIER_IMPORT_LIMIT} trades per import. You are attempting to import ${tradeCount} trades. Please upgrade to Pro for unlimited batch imports, or split your import into smaller batches.`
      return
    }

    console.log(`[IMPORT] Tier check passed (${userTier}), proceeding with import`)

    const result = await tradesStore.importTrades(selectedFile.value, selectedBroker.value)
    console.log('Import result:', result)
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

    // Poll import status until completed, then trigger achievement check as fallback
    try {
      const importId = result.importId
      const poll = async () => {
        try {
          const statusRes = await api.get(`/trades/import/status/${importId}`)
          const status = statusRes.data.importLog?.status
          if (status === 'completed' || status === 'failed') {
            if (status === 'completed') {
              // Fallback achievement check + local celebration for non-SSE users
              try {
                // Get stats before
                const before = await api.get('/gamification/dashboard')
                const beforeStats = before.data?.data?.stats || {}
                const beforeXP = beforeStats.experience_points || 0
                const beforeLevel = beforeStats.level || 1
                const beforeMin = beforeStats.level_progress?.current_level_min_xp || 0
                const beforeNext = beforeStats.level_progress?.next_level_min_xp || 100

                const checkRes = await api.post('/gamification/achievements/check')
                const newAchievements = checkRes.data?.data?.newAchievements || []
                const count = newAchievements.length
                if (count > 0) {
                  // Queue each achievement for overlay
                  newAchievements.forEach(a => {
                    celebrationQueue.value.push({ type: 'achievement', payload: { achievement: a } })
                  })
                  // Fetch stats after to compute XP delta and show progress animation
                  const after = await api.get('/gamification/dashboard')
                  const afterStats = after.data?.data?.stats || {}
                  const afterXP = afterStats.experience_points || beforeXP
                  const afterLevel = afterStats.level || beforeLevel
                  const afterMin = afterStats.level_progress?.current_level_min_xp || beforeMin
                  const afterNext = afterStats.level_progress?.next_level_min_xp || beforeNext
                  const deltaXP = Math.max(0, afterXP - beforeXP)
                  celebrationQueue.value.push({
                    type: 'xp_update',
                    payload: {
                      oldXP: beforeXP,
                      newXP: afterXP,
                      deltaXP,
                      oldLevel: beforeLevel,
                      newLevel: afterLevel,
                      currentLevelMinXPBefore: beforeMin,
                      nextLevelMinXPBefore: beforeNext,
                      currentLevelMinXPAfter: afterMin,
                      nextLevelMinXPAfter: afterNext
                    }
                  })
                  if (afterLevel > beforeLevel) {
                    celebrationQueue.value.push({ type: 'level_up', payload: { oldLevel: beforeLevel, newLevel: afterLevel } })
                  }
                  showSuccess(`New Achievements!`, `${count} unlocked just now`)
                }
              } catch (_) {}
            }
            return
          }
        } catch (_) {}
        setTimeout(poll, 2000)
      }
      poll()
    } catch (_) {}
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
    else {
      error.value = errorMessage
      showError('Import Failed', error.value)
    }
  } finally {
    loading.value = false
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
  } catch (error) {
    console.error('Failed to fetch import history:', error)
  }
}

function loadMoreHistory() {
  if (pagination.value.hasMore) {
    fetchImportHistory(pagination.value.page + 1)
  }
}

function deleteImport(importId) {
  // Find the import data to show in modal
  const importData = importHistory.value.find(imp => imp.id === importId)
  
  deleteImportId.value = importId
  deleteImportData.value = importData
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!deleteImportId.value) return

  deleting.value = true
  
  try {
    await api.delete(`/trades/import/${deleteImportId.value}`)
    showSuccess('Import Deleted', 'Import and associated trades have been deleted')
    await fetchImportHistory()
    showDeleteModal.value = false
  } catch (error) {
    showError('Delete Failed', error.response?.data?.error || 'Failed to delete import')
  } finally {
    deleting.value = false
    deleteImportId.value = null
    deleteImportData.value = null
  }
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
  if (!logSearchQuery.value || !logContent.value) {
    return logContent.value
  }
  
  try {
    const query = logSearchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(${query})`, 'gi')
    return logContent.value.replace(regex, '<mark class="bg-yellow-300 dark:bg-yellow-600 text-black dark:text-white">$1</mark>')
  } catch (error) {
    return logContent.value
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

onMounted(() => {
  // Load saved broker preference
  const savedBroker = localStorage.getItem('lastSelectedBroker')
  if (savedBroker) {
    selectedBroker.value = savedBroker
  }

  fetchImportHistory()
  fetchUnmappedCusipsCount()
  setInterval(fetchImportHistory, 5000)
})
</script>