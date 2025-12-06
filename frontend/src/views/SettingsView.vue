<template>
  <div class="max-w-[65%] mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">App Settings</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Configure your application preferences and AI provider settings.
      </p>
    </div>

    <!-- Tabs Navigation -->
    <div class="border-b border-gray-200 dark:border-gray-700 mb-8">
      <nav class="-mb-px flex space-x-8" aria-label="Tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            activeTab === tab.id
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300',
            'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors'
          ]"
        >
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- Tab Content -->
    <div class="space-y-8">
      <!-- General Tab -->
      <template v-if="activeTab === 'general'">
        <!-- Analytics Preferences -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Analytics Preferences</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Customize how your trading analytics are calculated and displayed.
            </p>

            <form @submit.prevent="updateAnalyticsSettings" class="space-y-6">
              <div>
                <label for="statisticsCalculation" class="label">Statistics Calculation Method</label>
                <select
                  id="statisticsCalculation"
                  v-model="analyticsForm.statisticsCalculation"
                  class="input"
                >
                  <option value="average">Average (Mean)</option>
                  <option value="median">Median</option>
                </select>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Choose whether to use averages or medians for calculations like Average P&L, Average Win, Average Loss, etc.
                  Medians are less affected by outliers and may provide a more representative view of typical performance.
                  <span class="block mt-2 text-blue-600 dark:text-blue-400 font-medium">
                    Note: Changes take effect immediately and will update labels throughout the application.
                  </span>
                </p>
              </div>

              <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div class="flex-1">
                  <label for="autoCloseExpiredOptions" class="block text-sm font-medium text-gray-900 dark:text-white">
                    Auto-Close Expired Options
                  </label>
                  <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Automatically close expired options positions with appropriate P&L (Long: -100%, Short: +100%).
                    The system checks hourly for expired options.
                  </p>
                </div>
                <div class="ml-4 flex-shrink-0">
                  <button
                    type="button"
                    @click="analyticsForm.autoCloseExpiredOptions = !analyticsForm.autoCloseExpiredOptions"
                    :class="[
                      analyticsForm.autoCloseExpiredOptions ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700',
                      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2'
                    ]"
                    role="switch"
                    :aria-checked="analyticsForm.autoCloseExpiredOptions"
                  >
                    <span
                      :class="[
                        analyticsForm.autoCloseExpiredOptions ? 'translate-x-5' : 'translate-x-0',
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                      ]"
                    />
                  </button>
                </div>
              </div>

              <div>
                <label for="defaultStopLoss" class="label">Default Stop Loss Percentage</label>
                <div class="mt-1 relative rounded-md shadow-sm">
                  <input
                    type="number"
                    id="defaultStopLoss"
                    v-model.number="analyticsForm.defaultStopLossPercent"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="0"
                    class="input pr-12"
                  />
                  <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <span class="text-gray-500 dark:text-gray-400">%</span>
                  </div>
                </div>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Automatically apply this stop loss percentage to all new and imported trades. Leave empty to not set a default.
                  For long positions, the stop loss will be below entry price. For short positions, it will be above entry price.
                  <span class="block mt-2 text-blue-600 dark:text-blue-400 font-medium">
                    Example: 2% stop loss on a $100 long entry = $98 stop loss price
                  </span>
                </p>
              </div>

              <div class="flex justify-end">
                <button
                  type="submit"
                  :disabled="analyticsLoading"
                  class="btn-primary"
                >
                  <span v-if="analyticsLoading" class="flex items-center">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </span>
                  <span v-else>Save Analytics Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Privacy Settings -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Privacy Settings</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Control who can see your trading activity and profile information.
            </p>

            <form @submit.prevent="updatePrivacySettings" class="space-y-6">
              <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div class="flex-1">
                  <label for="publicProfile" class="block text-sm font-medium text-gray-900 dark:text-white">
                    Public Profile
                  </label>
                  <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Allow others to view your public trades. When enabled, trades marked as "public" will be visible to all users.
                    Your username and avatar will also be visible on public trades.
                  </p>
                </div>
                <div class="ml-4 flex-shrink-0">
                  <button
                    type="button"
                    @click="privacyForm.publicProfile = !privacyForm.publicProfile"
                    :class="[
                      privacyForm.publicProfile ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700',
                      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2'
                    ]"
                    role="switch"
                    :aria-checked="privacyForm.publicProfile"
                  >
                    <span
                      :class="[
                        privacyForm.publicProfile ? 'translate-x-5' : 'translate-x-0',
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                      ]"
                    />
                  </button>
                </div>
              </div>

              <div class="flex justify-end">
                <button
                  type="submit"
                  :disabled="privacyLoading"
                  class="btn-primary"
                >
                  <span v-if="privacyLoading" class="flex items-center">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </span>
                  <span v-else>Save Privacy Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- API Documentation -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">API Documentation</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Access comprehensive API documentation for integrating with TradeTally programmatically.
            </p>

            <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="flex-1">
                <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-2">Interactive API Explorer</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  Browse all available API endpoints, test requests, and view response schemas using our Swagger documentation.
                </p>
              </div>
              <a
                :href="getApiDocsUrl()"
                target="_blank"
                rel="noopener noreferrer"
                class="btn-primary flex-shrink-0 ml-4"
              >
                <MdiIcon :icon="apiIcon" :size="16" class="mr-2" />
                Open API Docs
              </a>
            </div>
          </div>
        </div>
      </template>

      <!-- AI & Integrations Tab -->
      <template v-if="activeTab === 'ai'">
        <!-- AI Provider Settings -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">AI Provider Settings</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Configure which AI provider to use for analytics recommendations and CUSIP lookups.
              <span v-if="authStore.user?.role === 'admin'" class="block mt-2 text-blue-600 dark:text-blue-400 font-medium">
                Note: As an admin, you can also configure default settings for all users below.
              </span>
              <span v-else class="block mt-2 text-blue-600 dark:text-blue-400 font-medium">
                Note: If you leave these settings empty, admin-configured defaults will be used.
              </span>
            </p>

            <form @submit.prevent="updateAISettings" class="space-y-6">
              <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label for="aiProvider" class="label">AI Provider</label>
                  <select
                    id="aiProvider"
                    v-model="aiForm.provider"
                    class="input"
                    @change="onProviderChange"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="claude">Anthropic Claude</option>
                    <option value="openai">OpenAI</option>
                    <option value="ollama">Ollama</option>
                    <option value="lmstudio">LM Studio</option>
                    <option value="perplexity">Perplexity AI</option>
                    <option value="local">Local/Custom</option>
                  </select>
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Choose your preferred AI provider for analytics and CUSIP resolution.
                  </p>
                </div>

                <div>
                  <label for="aiModel" class="label">Model (Optional)</label>
                  <input
                    id="aiModel"
                    v-model="aiForm.model"
                    type="text"
                    class="input"
                    :placeholder="getModelPlaceholder()"
                  />
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Specific model to use. Leave blank for default.
                  </p>
                </div>
              </div>

              <div v-if="aiForm.provider === 'local' || aiForm.provider === 'ollama' || aiForm.provider === 'lmstudio'">
                <label for="aiUrl" class="label">API URL</label>
                <input
                  id="aiUrl"
                  v-model="aiForm.url"
                  type="url"
                  class="input"
                  :placeholder="aiForm.provider === 'ollama' ? 'http://localhost:11434' : aiForm.provider === 'lmstudio' ? 'http://localhost:1234' : 'http://localhost:8000'"
                  required
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {{ aiForm.provider === 'ollama' ? 'Ollama server URL' : 'Custom AI API endpoint URL' }}
                </p>
              </div>

              <div v-if="aiForm.provider !== 'local'">
                <label for="aiApiKey" class="label">API Key</label>
                <input
                  id="aiApiKey"
                  v-model="aiForm.apiKey"
                  type="password"
                  class="input"
                  :placeholder="getApiKeyPlaceholder()"
                  :required="!['ollama', 'lmstudio'].includes(aiForm.provider)"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {{ getApiKeyHelp() }}
                </p>
              </div>

              <div class="flex justify-end">
                <button
                  type="submit"
                  :disabled="aiLoading"
                  class="btn-primary"
                >
                  <span v-if="aiLoading" class="flex items-center">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </span>
                  <span v-else>Save AI Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Admin AI Provider Settings -->
        <div v-if="authStore.user?.role === 'admin'" class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Admin AI Provider Settings</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Configure default AI provider settings for all users. Users can override these settings for their own accounts.
            </p>

            <form @submit.prevent="updateAdminAISettings" class="space-y-6">
              <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label for="adminAiProvider" class="label">Default AI Provider</label>
                  <select
                    id="adminAiProvider"
                    v-model="adminAiForm.provider"
                    class="input"
                    @change="onAdminProviderChange"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="claude">Anthropic Claude</option>
                    <option value="openai">OpenAI</option>
                    <option value="ollama">Ollama</option>
                    <option value="lmstudio">LM Studio</option>
                    <option value="perplexity">Perplexity AI</option>
                    <option value="local">Local/Custom</option>
                  </select>
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Default AI provider for all users (unless they override it).
                  </p>
                </div>

                <div>
                  <label for="adminAiModel" class="label">Default Model (Optional)</label>
                  <input
                    id="adminAiModel"
                    v-model="adminAiForm.model"
                    type="text"
                    class="input"
                    :placeholder="getAdminModelPlaceholder()"
                  />
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Default model to use. Leave blank for provider default.
                  </p>
                </div>
              </div>

              <div v-if="adminAiForm.provider === 'local' || adminAiForm.provider === 'ollama' || adminAiForm.provider === 'lmstudio'">
                <label for="adminAiUrl" class="label">Default API URL</label>
                <input
                  id="adminAiUrl"
                  v-model="adminAiForm.url"
                  type="url"
                  class="input"
                  :placeholder="adminAiForm.provider === 'ollama' ? 'http://localhost:11434' : adminAiForm.provider === 'lmstudio' ? 'http://localhost:1234' : 'http://localhost:8000'"
                  required
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Default {{ adminAiForm.provider === 'ollama' ? 'Ollama server URL' : 'custom AI API endpoint URL' }} for all users.
                </p>
              </div>

              <div v-if="adminAiForm.provider !== 'local'">
                <label for="adminAiApiKey" class="label">Default API Key</label>
                <input
                  id="adminAiApiKey"
                  v-model="adminAiForm.apiKey"
                  type="password"
                  class="input"
                  :placeholder="getAdminApiKeyPlaceholder()"
                  :required="!['ollama', 'lmstudio'].includes(adminAiForm.provider)"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {{ getAdminApiKeyHelp() }}
                </p>
              </div>

              <div class="flex justify-end">
                <button
                  type="submit"
                  :disabled="adminAiLoading"
                  class="btn-primary"
                >
                  <span v-if="adminAiLoading" class="flex items-center">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </span>
                  <span v-else>Save Admin AI Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </template>

      <!-- Trading Tab -->
      <template v-if="activeTab === 'trading'">
        <!-- Quality Grading Weights -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Quality Grading Weights</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Customize how much each metric contributes to your trade quality score.
              Weights must sum to 100%. Quality scores are calculated based on news sentiment, gap from previous close, relative volume, float, and price range.
            </p>

            <form @submit.prevent="updateQualityWeights" class="space-y-6">
              <!-- Weight Sliders -->
              <div class="space-y-6">
                <!-- News Sentiment Weight -->
                <div>
                  <div class="flex justify-between items-center mb-2">
                    <label for="newsWeight" class="label text-sm">News Sentiment</label>
                    <span class="text-sm font-medium text-gray-900 dark:text-white">{{ qualityWeightsForm.news }}%</span>
                  </div>
                  <input
                    id="newsWeight"
                    v-model.number="qualityWeightsForm.news"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Weight for news sentiment analysis (bullish/bearish market sentiment)
                  </p>
                </div>

                <!-- Gap Weight -->
                <div>
                  <div class="flex justify-between items-center mb-2">
                    <label for="gapWeight" class="label text-sm">Gap from Previous Close</label>
                    <span class="text-sm font-medium text-gray-900 dark:text-white">{{ qualityWeightsForm.gap }}%</span>
                  </div>
                  <input
                    id="gapWeight"
                    v-model.number="qualityWeightsForm.gap"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Weight for gap percentage from previous day's close
                  </p>
                </div>

                <!-- Relative Volume Weight -->
                <div>
                  <div class="flex justify-between items-center mb-2">
                    <label for="relativeVolumeWeight" class="label text-sm">Relative Volume</label>
                    <span class="text-sm font-medium text-gray-900 dark:text-white">{{ qualityWeightsForm.relativeVolume }}%</span>
                  </div>
                  <input
                    id="relativeVolumeWeight"
                    v-model.number="qualityWeightsForm.relativeVolume"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Weight for volume compared to 10-day average
                  </p>
                </div>

                <!-- Float Weight -->
                <div>
                  <div class="flex justify-between items-center mb-2">
                    <label for="floatWeight" class="label text-sm">Float (Shares Outstanding)</label>
                    <span class="text-sm font-medium text-gray-900 dark:text-white">{{ qualityWeightsForm.float }}%</span>
                  </div>
                  <input
                    id="floatWeight"
                    v-model.number="qualityWeightsForm.float"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Weight for number of shares outstanding (lower float is better)
                  </p>
                </div>

                <!-- Price Range Weight -->
                <div>
                  <div class="flex justify-between items-center mb-2">
                    <label for="priceRangeWeight" class="label text-sm">Price Range</label>
                    <span class="text-sm font-medium text-gray-900 dark:text-white">{{ qualityWeightsForm.priceRange }}%</span>
                  </div>
                  <input
                    id="priceRangeWeight"
                    v-model.number="qualityWeightsForm.priceRange"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Weight for stock price range ($2-20 is ideal)
                  </p>
                </div>
              </div>

              <!-- Total Display -->
              <div class="p-4 rounded-md" :class="weightsTotal === 100 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'">
                <div class="flex justify-between items-center">
                  <span class="text-sm font-medium" :class="weightsTotal === 100 ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'">
                    Total Weight:
                  </span>
                  <span class="text-lg font-bold" :class="weightsTotal === 100 ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'">
                    {{ weightsTotal }}%
                  </span>
                </div>
                <p v-if="weightsTotal !== 100" class="text-xs text-red-600 dark:text-red-400 mt-1">
                  Weights must sum to exactly 100%
                </p>
              </div>

              <div class="flex justify-end space-x-3">
                <button
                  type="button"
                  @click="resetQualityWeights"
                  class="btn-secondary"
                >
                  Reset to Defaults
                </button>
                <button
                  type="submit"
                  :disabled="qualityWeightsLoading || weightsTotal !== 100"
                  class="btn-primary"
                >
                  <span v-if="qualityWeightsLoading" class="flex items-center">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </span>
                  <span v-else>Update Quality Weights</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Trade Import Settings -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Trade Import Settings</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Configure how executions are grouped when importing trades from broker CSV files.
            </p>

            <form @submit.prevent="updateTradeImportSettings" class="space-y-6">
              <!-- Trade Grouping Toggle -->
              <div class="flex items-start">
                <div class="flex items-center h-5">
                  <input
                    id="enableTradeGrouping"
                    v-model="tradeImportForm.enableTradeGrouping"
                    type="checkbox"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </div>
                <div class="ml-3">
                  <label for="enableTradeGrouping" class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enable Trade Grouping
                  </label>
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    When enabled, multiple executions within the specified time gap will be grouped into a single trade.
                    This is useful for scaling in/out of positions.
                  </p>
                </div>
              </div>

              <!-- Time Gap Setting -->
              <div v-if="tradeImportForm.enableTradeGrouping">
                <label for="tradeGroupingTimeGap" class="label">Time Gap for Grouping (minutes)</label>
                <input
                  id="tradeGroupingTimeGap"
                  v-model.number="tradeImportForm.tradeGroupingTimeGapMinutes"
                  type="number"
                  min="1"
                  max="1440"
                  class="input"
                  placeholder="60"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Maximum time gap (in minutes) between executions to group them into the same trade.
                  Default is 60 minutes (1 hour), following TradeSviz industry standard.
                </p>
              </div>

              <div class="flex justify-end">
                <button
                  type="submit"
                  :disabled="tradeImportLoading"
                  class="btn-primary"
                >
                  <span v-if="tradeImportLoading" class="flex items-center">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </span>
                  <span v-else>Update Import Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Broker Commission Settings -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Broker Commission & Fee Settings</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Configure default commission and fee rates for brokers that don't include this data in their CSV exports (e.g., Tradovate).
              These rates will be automatically applied during import.
            </p>

            <!-- Existing Broker Settings -->
            <div v-if="brokerFeeSettings.length > 0" class="mb-6 space-y-3">
              <div
                v-for="setting in brokerFeeSettings"
                :key="setting.id"
                class="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div class="flex-1">
                  <div class="flex items-center space-x-2">
                    <span class="text-sm font-medium text-gray-900 dark:text-white capitalize">{{ setting.broker }}</span>
                    <span v-if="setting.instrument" class="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                      {{ setting.instrument }}
                    </span>
                    <span v-else class="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded">
                      All Instruments
                    </span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">
                      Total: ${{ calculateTotalFees(setting).toFixed(6) }}/contract/side
                    </span>
                  </div>
                  <div class="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <span v-if="setting.commissionPerContract > 0">Commission: ${{ setting.commissionPerContract }}/contract</span>
                    <span v-if="setting.commissionPerSide > 0">Per Side: ${{ setting.commissionPerSide }}</span>
                    <span v-if="setting.exchangeFeePerContract > 0">Exchange: ${{ setting.exchangeFeePerContract }}/contract</span>
                    <span v-if="setting.nfaFeePerContract > 0">NFA: ${{ setting.nfaFeePerContract }}/contract</span>
                    <span v-if="setting.clearingFeePerContract > 0">Clearing: ${{ setting.clearingFeePerContract }}/contract</span>
                    <span v-if="setting.platformFeePerContract > 0">Platform: ${{ setting.platformFeePerContract }}/contract</span>
                  </div>
                  <p v-if="setting.notes" class="mt-1 text-xs text-gray-500 dark:text-gray-400 italic">{{ setting.notes }}</p>
                </div>
                <div class="flex items-center space-x-2 ml-4">
                  <button
                    @click="editBrokerFee(setting)"
                    class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    title="Edit"
                  >
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    @click="deleteBrokerFee(setting.id)"
                    class="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    title="Delete"
                  >
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Add/Edit Broker Fee Form -->
            <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-4">
                {{ editingBrokerFee ? 'Edit Broker Fees' : 'Add Broker Fees' }}
              </h4>

              <form @submit.prevent="saveBrokerFee" class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label for="brokerName" class="label">Broker</label>
                    <select
                      id="brokerName"
                      v-model="brokerFeeForm.broker"
                      class="input"
                      :disabled="editingBrokerFee"
                    >
                      <option value="">Select a broker</option>
                      <option value="tradeovate">Tradovate</option>
                      <option value="ninjatrader">NinjaTrader</option>
                      <option value="thinkorswim">ThinkorSwim</option>
                      <option value="ibkr">Interactive Brokers</option>
                      <option value="schwab">Charles Schwab</option>
                      <option value="lightspeed">Lightspeed</option>
                      <option value="webull">Webull</option>
                      <option value="etrade">E*TRADE</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label for="instrument" class="label">Instrument (optional)</label>
                    <input
                      type="text"
                      id="instrument"
                      v-model="brokerFeeForm.instrument"
                      class="input uppercase"
                      :disabled="editingBrokerFee"
                      placeholder="e.g., MES, NQ, ES (leave blank for all)"
                    />
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Leave blank to set default fees for all instruments with this broker
                    </p>
                  </div>

                  <div>
                    <label for="commissionPerContract" class="label">Commission per Contract</label>
                    <div class="relative">
                      <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400">$</span>
                      <input
                        type="number"
                        id="commissionPerContract"
                        v-model.number="brokerFeeForm.commissionPerContract"
                        step="0.000001"
                        min="0"
                        class="input pl-7"
                      />
                    </div>
                  </div>

                  <div>
                    <label for="exchangeFee" class="label">Exchange Fee per Contract</label>
                    <div class="relative">
                      <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400">$</span>
                      <input
                        type="number"
                        id="exchangeFee"
                        v-model.number="brokerFeeForm.exchangeFeePerContract"
                        step="0.000001"
                        min="0"
                        class="input pl-7"
                      />
                    </div>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">CME, CBOT, etc.</p>
                  </div>

                  <div>
                    <label for="nfaFee" class="label">NFA Fee per Contract</label>
                    <div class="relative">
                      <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400">$</span>
                      <input
                        type="number"
                        id="nfaFee"
                        v-model.number="brokerFeeForm.nfaFeePerContract"
                        step="0.000001"
                        min="0"
                        class="input pl-7"
                      />
                    </div>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Typically $0.02/contract</p>
                  </div>

                  <div>
                    <label for="clearingFee" class="label">Clearing Fee per Contract</label>
                    <div class="relative">
                      <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400">$</span>
                      <input
                        type="number"
                        id="clearingFee"
                        v-model.number="brokerFeeForm.clearingFeePerContract"
                        step="0.000001"
                        min="0"
                        class="input pl-7"
                      />
                    </div>
                  </div>

                  <div>
                    <label for="platformFee" class="label">Platform Fee per Contract</label>
                    <div class="relative">
                      <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400">$</span>
                      <input
                        type="number"
                        id="platformFee"
                        v-model.number="brokerFeeForm.platformFeePerContract"
                        step="0.000001"
                        min="0"
                        class="input pl-7"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label for="feeNotes" class="label">Notes (optional)</label>
                  <input
                    type="text"
                    id="feeNotes"
                    v-model="brokerFeeForm.notes"
                    class="input"
                    placeholder="e.g., Micro E-mini rates, updated Jan 2025"
                  />
                </div>

                <!-- Total Preview -->
                <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                  <div class="flex justify-between items-center">
                    <span class="text-sm text-blue-800 dark:text-blue-200">Total fees per contract per side:</span>
                    <span class="text-lg font-bold text-blue-900 dark:text-blue-100">
                      ${{ calculateTotalFees(brokerFeeForm).toFixed(6) }}
                    </span>
                  </div>
                  <p class="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    For a round-trip trade, total fees = ${{ (calculateTotalFees(brokerFeeForm) * 2).toFixed(6) }} per contract
                  </p>
                </div>

                <div class="flex justify-end space-x-3">
                  <button
                    v-if="editingBrokerFee"
                    type="button"
                    @click="cancelEditBrokerFee"
                    class="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    :disabled="!brokerFeeForm.broker || brokerFeeLoading"
                    class="btn-primary"
                  >
                    <span v-if="brokerFeeLoading" class="flex items-center">
                      <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </span>
                    <span v-else>{{ editingBrokerFee ? 'Update' : 'Add' }} Broker Fees</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <!-- Trade Enrichment -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Trade Enrichment</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Enrich your existing trades with additional data and analytics. This process runs in the background and may take a few minutes depending on the number of trades.
            </p>

            <div class="flex items-start justify-between">
              <div class="flex-1">
                <p class="text-sm font-medium text-gray-900 dark:text-white">
                  Comprehensive Trade Enrichment
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Enriches trades with:
                </p>
                <ul class="text-xs text-gray-500 dark:text-gray-400 mt-2 space-y-1 ml-4 list-disc">
                  <li>News events and sentiment analysis</li>
                  <li>Quality grading based on stock metrics (float, volume, price range, gap, sentiment)</li>
                </ul>
              </div>
              <button
                @click="enrichTrades"
                :disabled="enrichmentLoading"
                class="btn-primary ml-4 flex-shrink-0"
              >
                <span v-if="enrichmentLoading" class="flex items-center">
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Processing...
                </span>
                <span v-else>Enrich Trades</span>
              </button>
            </div>

            <div v-if="enrichmentMessage" class="mt-4 p-3 rounded-md" :class="enrichmentSuccess ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'">
              <p class="text-sm">{{ enrichmentMessage }}</p>
            </div>
          </div>
        </div>
      </template>

      <!-- Data Management Tab -->
      <template v-if="activeTab === 'data'">
        <!-- Data Export & Import -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Data Export & Import</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Export all your trading data, settings, and trading profile as a JSON file. You can also import previously exported data.
            </p>

            <div class="space-y-6">
              <!-- Export Section -->
              <div class="flex items-start space-x-4">
                <div class="flex-1">
                  <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Export Your Data</h4>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Download a complete backup of your TradeTally data including trades, diary entries, playbook entries, settings, tags, and equity history.
                  </p>
                </div>
                <button
                  @click="exportUserData"
                  :disabled="exportLoading"
                  class="btn-primary flex-shrink-0"
                >
                  <span v-if="exportLoading" class="flex items-center">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Preparing Export...
                  </span>
                  <span v-else class="flex items-center">
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    Export All Data
                  </span>
                </button>
              </div>

              <!-- CSV Export Section -->
              <div class="flex items-start space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700">
                <div class="flex-1">
                  <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Export Trades to CSV</h4>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Export all your trades to a CSV file with generic headers compatible with Excel, Google Sheets, and other trading journals. Exports all trades with full details.
                  </p>
                </div>
                <button
                  @click="exportTradesToCSV"
                  :disabled="csvExportLoading"
                  class="btn-secondary flex-shrink-0"
                >
                  <span v-if="csvExportLoading" class="flex items-center">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                    Exporting...
                  </span>
                  <span v-else class="flex items-center">
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    Export Trades CSV
                  </span>
                </button>
              </div>

              <!-- Import Section -->
              <div class="flex items-start space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700">
                <div class="flex-1">
                  <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Import Data</h4>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Import previously exported TradeTally data. This will merge with your existing data without duplicating trades.
                  </p>
                </div>
                <div class="flex-shrink-0">
                  <input
                    ref="fileInput"
                    type="file"
                    accept=".json,application/json"
                    @change="handleFileSelect"
                    class="hidden"
                  />
                  <button
                    @click="$refs.fileInput.click()"
                    class="btn-secondary"
                  >
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path>
                    </svg>
                    Choose File
                  </button>
                </div>
              </div>

              <!-- Selected File and Import Button -->
              <div v-if="selectedFile" class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <span class="text-sm text-gray-600 dark:text-gray-400 truncate mr-4">
                  Selected: {{ selectedFile.name }}
                </span>
                <button
                  @click="importUserData"
                  :disabled="importLoading"
                  class="btn-primary flex-shrink-0"
                >
                  <span v-if="importLoading" class="flex items-center">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Importing...
                  </span>
                  <span v-else class="flex items-center">
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                    </svg>
                    Import Data
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- System Logs Tab (Admin Only) -->
      <template v-if="activeTab === 'admin' && authStore.user?.role === 'admin'">
        <LogsViewer />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'
import api from '@/services/api'
import MdiIcon from '@/components/MdiIcon.vue'
import { mdiApi } from '@mdi/js'
import LogsViewer from '@/components/admin/LogsViewer.vue'

const authStore = useAuthStore()
const { showSuccess, showError } = useNotification()

// Icons
const apiIcon = mdiApi

// Active tab
const activeTab = ref('general')

// Tabs configuration
const tabs = computed(() => {
  const baseTabs = [
    { id: 'general', label: 'General' },
    { id: 'ai', label: 'AI & Integrations' },
    { id: 'trading', label: 'Trading' },
    { id: 'data', label: 'Data Management' }
  ]

  // Add System Logs tab for admin users
  if (authStore.user?.role === 'admin') {
    baseTabs.push({ id: 'admin', label: 'System Logs' })
  }

  return baseTabs
})

// AI Provider Settings
const aiForm = ref({
  provider: 'gemini',
  apiKey: '',
  url: '',
  model: ''
})

const aiLoading = ref(false)

// Analytics Settings
const analyticsForm = ref({
  statisticsCalculation: 'average',
  autoCloseExpiredOptions: true,
  defaultStopLossPercent: null
})

const analyticsLoading = ref(false)

// Privacy Settings
const privacyForm = ref({
  publicProfile: false
})
const privacyLoading = ref(false)

// Trade Import Settings
const tradeImportForm = ref({
  enableTradeGrouping: true,
  tradeGroupingTimeGapMinutes: 60
})
const tradeImportLoading = ref(false)

// Broker Fee Settings
const brokerFeeSettings = ref([])
const brokerFeeForm = ref({
  broker: '',
  instrument: '',
  commissionPerContract: 0,
  commissionPerSide: 0,
  exchangeFeePerContract: 0,
  nfaFeePerContract: 0.02,
  clearingFeePerContract: 0,
  platformFeePerContract: 0,
  notes: ''
})
const brokerFeeLoading = ref(false)
const editingBrokerFee = ref(null)

// Quality Weights Settings
const qualityWeightsForm = ref({
  news: 30,
  gap: 20,
  relativeVolume: 20,
  float: 15,
  priceRange: 15
})
const qualityWeightsLoading = ref(false)

// Computed property for total weights
const weightsTotal = computed(() => {
  return qualityWeightsForm.value.news +
         qualityWeightsForm.value.gap +
         qualityWeightsForm.value.relativeVolume +
         qualityWeightsForm.value.float +
         qualityWeightsForm.value.priceRange
})

// Admin AI Settings
const adminAiForm = ref({
  provider: 'gemini',
  apiKey: '',
  url: '',
  model: ''
})
const adminAiLoading = ref(false)

// Export/Import Settings
const exportLoading = ref(false)
const csvExportLoading = ref(false)
const importLoading = ref(false)
const selectedFile = ref(null)

// Trade Enrichment
const enrichmentLoading = ref(false)
const enrichmentMessage = ref('')
const enrichmentSuccess = ref(false)

// Get API docs URL
function getApiDocsUrl() {
  // Check if we're in development and need to use a different port
  const currentUrl = window.location

  // If frontend is on port 5173 (Vite dev), backend is on port 3000
  if (currentUrl.port === '5173' || currentUrl.hostname === 'localhost') {
    return `http://localhost:3000/api-docs`
  }

  // Otherwise use the same origin
  return `${currentUrl.origin}/api-docs`
}



// AI Provider Functions
function getModelPlaceholder() {
  switch (aiForm.value.provider) {
    case 'gemini':
      return 'e.g., gemini-1.5-pro'
    case 'claude':
      return 'e.g., claude-3-5-sonnet'
    case 'openai':
      return 'e.g., gpt-4o'
    case 'ollama':
      return 'e.g., llama3.1'
    case 'lmstudio':
      return 'e.g., local-model (auto-detected)'
    case 'perplexity':
      return 'e.g., sonar'
    case 'local':
      return 'e.g., custom-model'
    default:
      return 'Model name'
  }
}

function getApiKeyPlaceholder() {
  switch (aiForm.value.provider) {
    case 'gemini':
      return 'AIza...'
    case 'claude':
      return 'sk-ant-...'
    case 'openai':
      return 'sk-...'
    case 'ollama':
      return 'Optional API key'
    case 'perplexity':
      return 'pplx-...'
    case 'lmstudio':
      return 'Optional API key'
    case 'local':
      return 'Enter API key'
    default:
      return 'Enter API key'
  }
}

function getApiKeyHelp() {
  switch (aiForm.value.provider) {
    case 'gemini':
      return 'Get your API key from Google AI Studio'
    case 'claude':
      return 'Get your API key from Anthropic Console'
    case 'openai':
      return 'Get your API key from OpenAI Dashboard'
    case 'ollama':
      return 'API key is optional for Ollama'
    case 'perplexity':
      return 'Get your API key from Perplexity AI Settings'
    case 'lmstudio':
      return 'API key is optional for LM Studio'
    case 'local':
      return 'Enter your custom API key if required'
    default:
      return 'Enter your API key'
  }
}

function onProviderChange() {
  // Clear URL and API key when provider changes
  aiForm.value.url = ''
  aiForm.value.apiKey = ''
  aiForm.value.model = ''
}

async function loadAISettings() {
  try {
    const response = await api.get('/settings/ai-provider')
    aiForm.value = {
      provider: response.data.aiProvider || 'gemini',
      apiKey: response.data.aiApiKey || '',
      url: response.data.aiApiUrl || '',
      model: response.data.aiModel || ''
    }
  } catch (error) {
    console.error('Failed to load AI settings:', error)
    showError('Error', 'Failed to load AI settings')
  }
}

async function updateAISettings() {
  aiLoading.value = true
  try {
    await api.put('/settings/ai-provider', {
      aiProvider: aiForm.value.provider,
      aiApiKey: aiForm.value.apiKey,
      aiApiUrl: aiForm.value.url,
      aiModel: aiForm.value.model
    })
    showSuccess('Success', 'AI provider settings updated successfully')
  } catch (error) {
    console.error('Failed to update AI settings:', error)
    showError('Error', error.response?.data?.error || 'Failed to update AI settings')
  } finally {
    aiLoading.value = false
  }
}

// Analytics Settings Functions
async function loadAnalyticsSettings() {
  try {
    const response = await api.get('/settings')
    analyticsForm.value = {
      statisticsCalculation: response.data.settings.statisticsCalculation || 'average',
      autoCloseExpiredOptions: response.data.settings.autoCloseExpiredOptions !== undefined
        ? response.data.settings.autoCloseExpiredOptions
        : true,
      defaultStopLossPercent: response.data.settings.defaultStopLossPercent || null
    }
  } catch (error) {
    console.error('Failed to load analytics settings:', error)
    // Default values if loading fails
    analyticsForm.value.statisticsCalculation = 'average'
    analyticsForm.value.autoCloseExpiredOptions = true
    analyticsForm.value.defaultStopLossPercent = null
  }
}

async function updateAnalyticsSettings() {
  analyticsLoading.value = true
  try {
    await api.put('/settings', {
      statisticsCalculation: analyticsForm.value.statisticsCalculation,
      autoCloseExpiredOptions: analyticsForm.value.autoCloseExpiredOptions,
      defaultStopLossPercent: analyticsForm.value.defaultStopLossPercent || null
    })
    showSuccess('Success', 'Analytics preferences updated successfully')
  } catch (error) {
    console.error('Failed to update analytics settings:', error)
    showError('Error', error.response?.data?.error || 'Failed to update analytics settings')
  } finally {
    analyticsLoading.value = false
  }
}

// Privacy Settings Functions
async function loadPrivacySettings() {
  try {
    const response = await api.get('/settings')
    const settings = response.data.settings

    privacyForm.value = {
      publicProfile: settings.publicProfile ?? false
    }
  } catch (error) {
    console.error('Failed to load privacy settings:', error)
    // Default to false if loading fails
    privacyForm.value.publicProfile = false
  }
}

async function updatePrivacySettings() {
  privacyLoading.value = true
  try {
    await api.put('/settings', {
      publicProfile: privacyForm.value.publicProfile
    })

    // Refresh user data to update settings in auth store
    await authStore.fetchUser()

    showSuccess('Success', 'Privacy settings updated successfully')
  } catch (error) {
    console.error('Failed to update privacy settings:', error)
    showError('Error', error.response?.data?.error || 'Failed to update privacy settings')
  } finally {
    privacyLoading.value = false
  }
}

// Trade Import Settings Functions
async function loadTradeImportSettings() {
  try {
    const response = await api.get('/settings')
    const settings = response.data.settings

    tradeImportForm.value = {
      enableTradeGrouping: settings.enableTradeGrouping ?? true,
      tradeGroupingTimeGapMinutes: settings.tradeGroupingTimeGapMinutes ?? 60
    }
  } catch (error) {
    console.error('Failed to load trade import settings:', error)
    // Default values if loading fails
    tradeImportForm.value.enableTradeGrouping = true
    tradeImportForm.value.tradeGroupingTimeGapMinutes = 60
  }
}

async function updateTradeImportSettings() {
  tradeImportLoading.value = true
  try {
    await api.put('/settings', {
      enableTradeGrouping: tradeImportForm.value.enableTradeGrouping,
      tradeGroupingTimeGapMinutes: tradeImportForm.value.tradeGroupingTimeGapMinutes
    })
    showSuccess('Success', 'Trade import settings updated successfully')
  } catch (error) {
    console.error('Failed to update trade import settings:', error)
    showError('Error', error.response?.data?.error || 'Failed to update trade import settings')
  } finally {
    tradeImportLoading.value = false
  }
}

// Broker Fee Settings Functions
async function loadBrokerFeeSettings() {
  try {
    const response = await api.get('/settings/broker-fees')
    if (response.data.success) {
      brokerFeeSettings.value = response.data.data
    }
  } catch (error) {
    console.error('Failed to load broker fee settings:', error)
  }
}

function calculateTotalFees(setting) {
  return (
    (parseFloat(setting.commissionPerContract) || 0) +
    (parseFloat(setting.commissionPerSide) || 0) +
    (parseFloat(setting.exchangeFeePerContract) || 0) +
    (parseFloat(setting.nfaFeePerContract) || 0) +
    (parseFloat(setting.clearingFeePerContract) || 0) +
    (parseFloat(setting.platformFeePerContract) || 0)
  )
}

function editBrokerFee(setting) {
  editingBrokerFee.value = setting.id
  brokerFeeForm.value = {
    broker: setting.broker,
    instrument: setting.instrument || '',
    commissionPerContract: setting.commissionPerContract || 0,
    commissionPerSide: setting.commissionPerSide || 0,
    exchangeFeePerContract: setting.exchangeFeePerContract || 0,
    nfaFeePerContract: setting.nfaFeePerContract || 0.02,
    clearingFeePerContract: setting.clearingFeePerContract || 0,
    platformFeePerContract: setting.platformFeePerContract || 0,
    notes: setting.notes || ''
  }
}

function cancelEditBrokerFee() {
  editingBrokerFee.value = null
  resetBrokerFeeForm()
}

function resetBrokerFeeForm() {
  brokerFeeForm.value = {
    broker: '',
    instrument: '',
    commissionPerContract: 0,
    commissionPerSide: 0,
    exchangeFeePerContract: 0,
    nfaFeePerContract: 0.02,
    clearingFeePerContract: 0,
    platformFeePerContract: 0,
    notes: ''
  }
}

async function saveBrokerFee() {
  if (!brokerFeeForm.value.broker) {
    showError('Error', 'Please select a broker')
    return
  }

  brokerFeeLoading.value = true
  try {
    await api.post('/settings/broker-fees', brokerFeeForm.value)
    showSuccess('Success', `Broker fee settings for ${brokerFeeForm.value.broker} saved successfully`)
    await loadBrokerFeeSettings()
    cancelEditBrokerFee()
  } catch (error) {
    console.error('Failed to save broker fee settings:', error)
    showError('Error', error.response?.data?.error || 'Failed to save broker fee settings')
  } finally {
    brokerFeeLoading.value = false
  }
}

async function deleteBrokerFee(id) {
  if (!confirm('Are you sure you want to delete this broker fee configuration?')) {
    return
  }

  try {
    await api.delete(`/settings/broker-fees/${id}`)
    showSuccess('Success', 'Broker fee settings deleted')
    await loadBrokerFeeSettings()
  } catch (error) {
    console.error('Failed to delete broker fee settings:', error)
    showError('Error', error.response?.data?.error || 'Failed to delete broker fee settings')
  }
}

// Quality Weights Functions
async function fetchQualityWeights() {
  try {
    const response = await api.get('/users/quality-weights')
    if (response.data && response.data.qualityWeights) {
      qualityWeightsForm.value = {
        news: response.data.qualityWeights.news,
        gap: response.data.qualityWeights.gap,
        relativeVolume: response.data.qualityWeights.relativeVolume,
        float: response.data.qualityWeights.float,
        priceRange: response.data.qualityWeights.priceRange
      }
    }
  } catch (error) {
    console.error('Failed to fetch quality weights:', error)
    // Don't show error to user, just use defaults
  }
}

async function updateQualityWeights() {
  qualityWeightsLoading.value = true
  try {
    await api.put('/users/quality-weights', {
      news: qualityWeightsForm.value.news,
      gap: qualityWeightsForm.value.gap,
      relativeVolume: qualityWeightsForm.value.relativeVolume,
      float: qualityWeightsForm.value.float,
      priceRange: qualityWeightsForm.value.priceRange
    })
    showSuccess('Success', 'Quality grading weights updated successfully')
  } catch (error) {
    console.error('Failed to update quality weights:', error)
    showError('Error', error.response?.data?.error || 'Failed to update quality weights')
  } finally {
    qualityWeightsLoading.value = false
  }
}

function resetQualityWeights() {
  qualityWeightsForm.value = {
    news: 30,
    gap: 20,
    relativeVolume: 20,
    float: 15,
    priceRange: 15
  }
}

// Admin AI Settings Functions
async function fetchAdminAISettings() {
  try {
    const response = await api.get('/settings/admin/ai')
    adminAiForm.value = {
      provider: response.data.aiProvider,
      apiKey: response.data.aiApiKey,
      url: response.data.aiApiUrl,
      model: response.data.aiModel
    }
  } catch (error) {
    console.error('Failed to fetch admin AI settings:', error)
    showError('Error', 'Failed to load admin AI settings')
  }
}

async function updateAdminAISettings() {
  adminAiLoading.value = true
  try {
    await api.put('/settings/admin/ai', {
      aiProvider: adminAiForm.value.provider,
      aiApiKey: adminAiForm.value.apiKey,
      aiApiUrl: adminAiForm.value.url,
      aiModel: adminAiForm.value.model
    })
    showSuccess('Success', 'Admin AI provider settings updated successfully')
  } catch (error) {
    console.error('Failed to update admin AI settings:', error)
    showError('Error', error.response?.data?.error || 'Failed to update admin AI settings')
  } finally {
    adminAiLoading.value = false
  }
}

function onAdminProviderChange() {
  // Clear API key and URL when provider changes
  adminAiForm.value.apiKey = ''
  adminAiForm.value.url = ''
  adminAiForm.value.model = ''
}

function getAdminModelPlaceholder() {
  switch (adminAiForm.value.provider) {
    case 'gemini':
      return 'gemini-1.5-flash'
    case 'claude':
      return 'claude-3-5-sonnet-20241022'
    case 'openai':
      return 'gpt-4o'
    case 'ollama':
      return 'llama3.1'
    case 'lmstudio':
      return 'local-model (auto-detected)'
    case 'perplexity':
      return 'sonar'
    case 'local':
      return 'custom-model'
    default:
      return 'Leave blank for default'
  }
}

function getAdminApiKeyPlaceholder() {
  switch (adminAiForm.value.provider) {
    case 'gemini':
      return 'Enter Google Gemini API key'
    case 'claude':
      return 'Enter Anthropic Claude API key'
    case 'openai':
      return 'Enter OpenAI API key'
    case 'ollama':
      return 'Optional: Enter Ollama API key'
    default:
      return 'Enter API key'
  }
}

function getAdminApiKeyHelp() {
  switch (adminAiForm.value.provider) {
    case 'gemini':
      return 'Get your free API key at: https://aistudio.google.com/app/apikey'
    case 'claude':
      return 'Get your API key at: https://console.anthropic.com/'
    case 'openai':
      return 'Get your API key at: https://platform.openai.com/api-keys'
    case 'ollama':
      return 'API key is optional for Ollama. Leave blank if not needed.'
    default:
      return 'API key for your chosen provider'
  }
}

// Export/Import Functions
async function exportUserData() {
  exportLoading.value = true
  try {
    const response = await api.get('/settings/export', {
      responseType: 'blob'
    })

    // Create a download link
    const blob = new Blob([response.data], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url

    // Generate filename with current date
    const today = new Date().toISOString().split('T')[0]
    link.download = `tradetally-export-${today}.json`

    // Trigger download
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    showSuccess('Export Complete', 'Your data has been exported successfully')
  } catch (error) {
    console.error('Export failed:', error)
    showError('Export Failed', error.response?.data?.error || 'Failed to export user data')
  } finally {
    exportLoading.value = false
  }
}

async function exportTradesToCSV() {
  csvExportLoading.value = true
  try {
    const response = await api.get('/trades/export/csv', {
      responseType: 'blob'
    })

    // Create download link
    const blob = new Blob([response.data], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url

    // Get filename from Content-Disposition header or use default
    const contentDisposition = response.headers['content-disposition']
    let filename = 'tradetally-export.csv'
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+)"/)
      if (match) filename = match[1]
    }

    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    showSuccess('Export Complete', 'Your trades have been exported to CSV successfully')
  } catch (error) {
    console.error('CSV export failed:', error)
    showError('Export Failed', error.response?.data?.error || 'Failed to export trades to CSV')
  } finally {
    csvExportLoading.value = false
  }
}

function handleFileSelect(event) {
  const file = event.target.files[0]
  if (file) {
    selectedFile.value = file
  }
}

async function importUserData() {
  if (!selectedFile.value) {
    showError('No File Selected', 'Please select a file to import')
    return
  }

  importLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)

    const response = await api.post('/settings/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

    const { tradesAdded, tagsAdded, equityAdded } = response.data
    showSuccess(
      'Import Complete',
      `Successfully imported ${tradesAdded} trades, ${tagsAdded} tags, and ${equityAdded} equity records`
    )

    // Clear the selected file
    selectedFile.value = null
    // Reset the file input
    const fileInput = document.querySelector('input[type="file"]')
    if (fileInput) fileInput.value = ''
  } catch (error) {
    console.error('Import failed:', error)
    showError('Import Failed', error.response?.data?.error || 'Failed to import user data')
  } finally {
    importLoading.value = false
  }
}

async function enrichTrades() {
  enrichmentLoading.value = true
  enrichmentMessage.value = ''
  enrichmentSuccess.value = false

  try {
    const response = await api.post('/users/enrich-trades')

    enrichmentSuccess.value = true
    enrichmentMessage.value = response.data.message

    if (response.data.tradesQueued > 0) {
      showSuccess(
        'Enrichment Started',
        `Processing ${response.data.tradesQueued} trades in the background. This may take a few minutes.`
      )
    } else {
      showSuccess('All Set', 'All your trades are already enriched with news data!')
    }
  } catch (error) {
    console.error('Enrichment failed:', error)
    enrichmentSuccess.value = false
    enrichmentMessage.value = error.response?.data?.error || 'Failed to start enrichment process'
    showError('Enrichment Failed', enrichmentMessage.value)
  } finally {
    enrichmentLoading.value = false
  }
}

onMounted(() => {
  loadAISettings()
  loadAnalyticsSettings()
  loadPrivacySettings()
  loadTradeImportSettings()
  loadBrokerFeeSettings()
  fetchQualityWeights()

  // Load admin AI settings if user is admin
  if (authStore.user?.role === 'admin') {
    fetchAdminAISettings()
  }
})
</script>
