<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Manage your account settings and preferences.
      </p>
    </div>

    <div class="space-y-8">
      <!-- Profile Settings -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Profile Information</h3>
          <form @submit.prevent="updateProfile" class="space-y-6">
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label for="fullName" class="label">Full Name</label>
                <input
                  id="fullName"
                  v-model="profileForm.fullName"
                  type="text"
                  class="input"
                  placeholder="John Doe"
                />
              </div>
              
              <div>
                <label for="username" class="label">Username</label>
                <input
                  id="username"
                  v-model="profileForm.username"
                  type="text"
                  disabled
                  class="input bg-gray-50 dark:bg-gray-700"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Username cannot be changed.
                </p>
              </div>
              
              <div>
                <label for="email" class="label">Email</label>
                <input
                  id="email"
                  v-model="profileForm.email"
                  type="email"
                  :disabled="!twoFactorStatus.enabled"
                  :class="twoFactorStatus.enabled ? 'input' : 'input bg-gray-50 dark:bg-gray-700'"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  <span v-if="twoFactorStatus.enabled">
                    Email can be changed when 2FA is enabled.
                  </span>
                  <span v-else>
                    Enable 2FA to change your email address.
                  </span>
                </p>
              </div>
              
              <div>
                <label for="timezone" class="label">Timezone</label>
                <select id="timezone" v-model="profileForm.timezone" class="input">
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                </select>
              </div>
            </div>

            <div class="flex justify-end">
              <button
                type="submit"
                :disabled="profileLoading"
                class="btn-primary"
              >
                <span v-if="profileLoading">Updating...</span>
                <span v-else>Update Profile</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Two-Factor Authentication -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Two-Factor Authentication</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Add an extra layer of security to your account with two-factor authentication.
          </p>
          
          <div v-if="twoFactorStatus.enabled" class="space-y-4">
            <!-- 2FA is enabled -->
            <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div class="flex items-center">
                <svg class="w-5 h-5 text-green-600 dark:text-green-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div>
                  <h4 class="text-sm font-medium text-green-800 dark:text-green-300">2FA is enabled</h4>
                  <p class="text-sm text-green-700 dark:text-green-400 mt-1">
                    Your account is protected with two-factor authentication.
                    {{ twoFactorStatus.backupCodesRemaining }} backup codes remaining.
                  </p>
                </div>
              </div>
            </div>
            
            <div class="flex space-x-3">
              <button
                @click="disable2FA"
                :disabled="twoFactorLoading"
                class="btn-danger"
              >
                <span v-if="twoFactorLoading">Disabling...</span>
                <span v-else>Disable 2FA</span>
              </button>
            </div>
          </div>
          
          <div v-else class="space-y-4">
            <!-- 2FA is not enabled -->
            <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div class="flex items-center">
                <svg class="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                </svg>
                <div>
                  <h4 class="text-sm font-medium text-yellow-800 dark:text-yellow-300">2FA is not enabled</h4>
                  <p class="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                    Enhance your account security by enabling two-factor authentication.
                  </p>
                </div>
              </div>
            </div>
            
            <button
              @click="setup2FA"
              :disabled="twoFactorLoading"
              class="btn-primary"
            >
              <span v-if="twoFactorLoading">Setting up...</span>
              <span v-else>Enable 2FA</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 2FA Setup Modal -->
      <div v-if="show2FASetup" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div class="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white dark:bg-gray-800">
          <div class="mt-3">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Set Up Two-Factor Authentication</h3>
            
            <div class="space-y-6">
              <!-- Step 1: Scan QR Code -->
              <div>
                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Step 1: Scan QR Code</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </p>
                <div class="flex justify-center mb-4">
                  <img :src="qrCodeUrl" alt="2FA QR Code" class="border rounded-lg" />
                </div>
                <div class="text-center">
                  <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Or enter this code manually:</p>
                  <code class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded break-all">{{ setupSecret }}</code>
                </div>
              </div>

              <!-- Step 2: Enter Verification Code -->
              <div>
                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Step 2: Enter Verification Code</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Enter the 6-digit code from your authenticator app
                </p>
                <input
                  v-model="verificationCode"
                  type="text"
                  maxlength="6"
                  placeholder="000000"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-center text-lg tracking-widest"
                />
              </div>

              <!-- Backup Codes -->
              <div>
                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Backup Codes</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Save these backup codes in a secure place. You can use them to access your account if you lose your authenticator device.
                </p>
                <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-md max-h-32 overflow-y-auto">
                  <div class="grid grid-cols-2 gap-2">
                    <code
                      v-for="code in backupCodes"
                      :key="code"
                      class="text-xs bg-white dark:bg-gray-800 px-2 py-1 rounded text-center"
                    >
                      {{ code }}
                    </code>
                  </div>
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="flex justify-end space-x-3">
                <button
                  type="button"
                  @click="cancel2FASetup"
                  class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  @click="enable2FA"
                  :disabled="twoFactorLoading || !verificationCode"
                  class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span v-if="twoFactorLoading">Enabling...</span>
                  <span v-else>Enable 2FA</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- API Key Management -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">API Keys</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Generate API keys to access your TradeTally data programmatically. Keep your keys secure and don't share them.
          </p>

          <!-- API Keys List -->
          <div v-if="apiKeys.length > 0" class="mb-6">
            <div class="space-y-4">
              <div v-for="apiKey in apiKeys" :key="apiKey.id" 
                   class="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div class="flex-1">
                  <div class="flex items-center space-x-3">
                    <h4 class="text-sm font-medium text-gray-900 dark:text-white">{{ apiKey.name }}</h4>
                    <span v-if="!apiKey.isActive" 
                          class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
                      Inactive
                    </span>
                    <span v-else-if="apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()" 
                          class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                      Expired
                    </span>
                  </div>
                  <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>{{ apiKey.keyPrefix }}...</span>
                    <span class="mx-2">•</span>
                    <span>{{ apiKey.permissions.join(', ') }}</span>
                    <span v-if="apiKey.lastUsedAt" class="mx-2">•</span>
                    <span v-if="apiKey.lastUsedAt">Last used {{ formatDate(apiKey.lastUsedAt) }}</span>
                    <span v-else class="mx-2">• Never used</span>
                    <span v-if="apiKey.expiresAt" class="mx-2">•</span>
                    <span v-if="apiKey.expiresAt">Expires {{ formatDate(apiKey.expiresAt) }}</span>
                  </div>
                </div>
                <div class="flex items-center space-x-2">
                  <button @click="toggleApiKey(apiKey)" 
                          :disabled="apiKeysLoading"
                          class="btn-secondary text-xs py-1 px-2">
                    {{ apiKey.isActive ? 'Deactivate' : 'Activate' }}
                  </button>
                  <button @click="deleteApiKey(apiKey)" 
                          :disabled="apiKeysLoading"
                          class="btn-danger text-xs py-1 px-2">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="text-center py-8">
            <p class="text-sm text-gray-500 dark:text-gray-400">No API keys created yet.</p>
          </div>

          <!-- Create API Key Button -->
          <div class="flex justify-end">
            <button @click="showCreateApiKeyModal = true" 
                    :disabled="apiKeysLoading"
                    class="btn-primary">
              Create API Key
            </button>
          </div>
        </div>
      </div>

      <!-- Preferences -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Preferences</h3>
          <form @submit.prevent="updateSettings" class="space-y-6">
            <div class="space-y-4">
              <div class="flex items-start">
                <div class="flex items-center h-5">
                  <input
                    id="emailNotifications"
                    v-model="settingsForm.emailNotifications"
                    type="checkbox"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </div>
                <div class="ml-3 text-sm">
                  <label for="emailNotifications" class="font-medium text-gray-700 dark:text-gray-300">
                    Email Notifications
                  </label>
                  <p class="text-gray-500 dark:text-gray-400">
                    Receive email notifications for trade imports and reminders.
                  </p>
                </div>
              </div>

              <div class="flex items-start">
                <div class="flex items-center h-5">
                  <input
                    id="publicProfile"
                    v-model="settingsForm.publicProfile"
                    type="checkbox"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </div>
                <div class="ml-3 text-sm">
                  <label for="publicProfile" class="font-medium text-gray-700 dark:text-gray-300">
                    Public Profile
                  </label>
                  <p class="text-gray-500 dark:text-gray-400">
                    Allow others to see your trades that you've marked as public. Individual trades must still be marked as public to appear.
                  </p>
                </div>
              </div>


              <div>
                <label for="defaultTags" class="label">Default Tags</label>
                <input
                  id="defaultTags"
                  v-model="defaultTagsInput"
                  type="text"
                  class="input"
                  placeholder="momentum, scalping, earnings"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Comma-separated tags that will be pre-filled when creating new trades.
                </p>
              </div>
            </div>

            <div class="flex justify-end">
              <button
                type="submit"
                :disabled="settingsLoading"
                class="btn-primary"
              >
                <span v-if="settingsLoading">Updating...</span>
                <span v-else>Update Settings</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Account Equity -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Account Equity</h3>
          
          <form @submit.prevent="updateAccountEquity">
            <div class="mb-6">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Current Account Equity
              </label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span class="text-gray-500 dark:text-gray-400">$</span>
                </div>
                <input
                  v-model="accountEquity"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter your current account equity"
                  class="block w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
                This will be used to calculate your K Ratio and track equity changes over time.
              </p>
            </div>

            <div class="flex items-center justify-between">
              <div class="text-sm text-gray-500 dark:text-gray-400">
                Last updated: {{ lastEquityUpdate || 'Never' }}
              </div>
              <button
                type="submit"
                :disabled="loadingEquity"
                class="btn-primary"
              >
                {{ loadingEquity ? 'Updating...' : 'Update Equity' }}
              </button>
            </div>
          </form>

          <!-- Equity History Link -->
          <div class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <router-link
              to="/equity-history"
              class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
            >
              View Equity History →
            </router-link>
          </div>
        </div>
      </div>

      <!-- Tags Management -->
      <div class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Manage Tags</h3>
            <button @click="showAddTag = true" class="btn-primary">
              Add Tag
            </button>
          </div>

          <div v-if="tags.length === 0" class="text-center py-4 text-gray-500 dark:text-gray-400">
            No tags created yet
          </div>

          <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="tag in tags"
              :key="tag.id"
              class="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div class="flex items-center space-x-3">
                <div
                  class="w-4 h-4 rounded-full"
                  :style="{ backgroundColor: tag.color }"
                ></div>
                <span class="text-sm font-medium text-gray-900 dark:text-white">{{ tag.name }}</span>
              </div>
              <button
                @click="deleteTag(tag.id)"
                class="text-red-600 hover:text-red-500"
              >
                <XMarkIcon class="h-4 w-4" />
              </button>
            </div>
          </div>

          <!-- Add Tag Modal -->
          <div v-if="showAddTag" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
              <div class="mt-3">
                <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Add New Tag</h3>
                <form @submit.prevent="addTag" class="space-y-4">
                  <div>
                    <label for="tagName" class="label">Tag Name</label>
                    <input
                      id="tagName"
                      v-model="newTag.name"
                      type="text"
                      required
                      class="input"
                      placeholder="Enter tag name"
                    />
                  </div>
                  <div>
                    <label for="tagColor" class="label">Color</label>
                    <input
                      id="tagColor"
                      v-model="newTag.color"
                      type="color"
                      class="input h-10"
                    />
                  </div>
                  <div class="flex justify-end space-x-3">
                    <button
                      type="button"
                      @click="showAddTag = false"
                      class="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button type="submit" class="btn-primary">
                      Add Tag
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Data Export/Import -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Data Export & Import</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Export all your TradeTally data or import from a previous TradeTally export.
          </p>
          
          <div class="space-y-6">
            <!-- Export Section -->
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <h4 class="text-md font-medium text-gray-900 dark:text-white mb-3">Export Your Data</h4>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Download all your trades, tags, settings, and trading profile as a JSON file. This export can be re-imported into any TradeTally instance.
              </p>
              <button
                @click="exportData"
                :disabled="exportLoading"
                class="btn-primary"
              >
                <span v-if="exportLoading">Exporting...</span>
                <span v-else>Export All Data</span>
              </button>
            </div>
            
            <!-- Import Section -->
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <h4 class="text-md font-medium text-gray-900 dark:text-white mb-3">Import TradeTally Data</h4>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Import data from a TradeTally export file. This will merge with your existing data.
              </p>
              <div class="space-y-4">
                <div>
                  <input
                    ref="importFileInput"
                    type="file"
                    accept=".json"
                    @change="handleImportFile"
                    class="hidden"
                  />
                  <button
                    @click="$refs.importFileInput.click()"
                    class="btn-secondary"
                  >
                    Select Import File
                  </button>
                  <span v-if="importFile" class="ml-3 text-sm text-gray-600 dark:text-gray-400">
                    {{ importFile.name }}
                  </span>
                </div>
                
                <div v-if="importFile" class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p class="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Important:</strong> This will add trades and merge settings. Existing data will not be deleted.
                  </p>
                </div>
                
                <button
                  v-if="importFile"
                  @click="importData"
                  :disabled="importLoading"
                  class="btn-primary"
                >
                  <span v-if="importLoading">Importing...</span>
                  <span v-else>Import Data</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Trading Profile -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Trading Profile</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Customize your trading preferences to get more personalized AI analytics and recommendations.
          </p>
          
          <form @submit.prevent="updateTradingProfile" class="space-y-8">
            <!-- General Trading Information -->
            <div>
              <h4 class="text-md font-medium text-gray-900 dark:text-white mb-4">General Information</h4>
              <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <!-- Risk Tolerance -->
                <div>
                  <label for="riskTolerance" class="label">Risk Tolerance</label>
                  <select id="riskTolerance" v-model="tradingProfileForm.riskTolerance" class="input">
                    <option value="conservative">Conservative</option>
                    <option value="moderate">Moderate</option>
                    <option value="aggressive">Aggressive</option>
                  </select>
                </div>

                <!-- Experience Level -->
                <div>
                  <label for="experienceLevel" class="label">Experience Level</label>
                  <select id="experienceLevel" v-model="tradingProfileForm.experienceLevel" class="input">
                    <option value="beginner">Beginner (0-1 years)</option>
                    <option value="intermediate">Intermediate (1-3 years)</option>
                    <option value="advanced">Advanced (3-5 years)</option>
                    <option value="expert">Expert (5+ years)</option>
                  </select>
                </div>

                <!-- Average Position Size -->
                <div>
                  <label for="averagePositionSize" class="label">Average Position Size</label>
                  <select id="averagePositionSize" v-model="tradingProfileForm.averagePositionSize" class="input">
                    <option value="small">Small ($100 - $1,000)</option>
                    <option value="medium">Medium ($1,000 - $10,000)</option>
                    <option value="large">Large ($10,000+)</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Trading Preferences -->
            <div>
              <h4 class="text-md font-medium text-gray-900 dark:text-white mb-4">Trading Preferences</h4>
              <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <!-- Trading Strategies -->
                <div>
                  <label class="label">Trading Strategies</label>
                  <div class="space-y-2 mt-2">
                    <div v-for="strategy in strategyOptions" :key="strategy" class="flex items-center">
                      <input
                        :id="`strategy-${strategy}`"
                        v-model="tradingProfileForm.tradingStrategies"
                        :value="strategy"
                        type="checkbox"
                        class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label :for="`strategy-${strategy}`" class="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        {{ strategy }}
                      </label>
                    </div>
                  </div>
                </div>

                <!-- Trading Styles -->
                <div>
                  <label class="label">Trading Styles</label>
                  <div class="space-y-2 mt-2">
                    <div v-for="style in styleOptions" :key="style" class="flex items-center">
                      <input
                        :id="`style-${style}`"
                        v-model="tradingProfileForm.tradingStyles"
                        :value="style"
                        type="checkbox"
                        class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label :for="`style-${style}`" class="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        {{ style }}
                      </label>
                    </div>
                  </div>
                </div>

                <!-- Primary Markets -->
                <div>
                  <label class="label">Primary Markets</label>
                  <div class="space-y-2 mt-2">
                    <div v-for="market in marketOptions" :key="market" class="flex items-center">
                      <input
                        :id="`market-${market}`"
                        v-model="tradingProfileForm.primaryMarkets"
                        :value="market"
                        type="checkbox"
                        class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label :for="`market-${market}`" class="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        {{ market }}
                      </label>
                    </div>
                  </div>
                </div>

                <!-- Trading Goals -->
                <div>
                  <label class="label">Trading Goals</label>
                  <div class="space-y-2 mt-2">
                    <div v-for="goal in goalOptions" :key="goal" class="flex items-center">
                      <input
                        :id="`goal-${goal}`"
                        v-model="tradingProfileForm.tradingGoals"
                        :value="goal"
                        type="checkbox"
                        class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label :for="`goal-${goal}`" class="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        {{ goal }}
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Sector Preferences -->
            <div>
              <h4 class="text-md font-medium text-gray-900 dark:text-white mb-4">Sector Preferences</h4>
              <div class="grid grid-cols-1 gap-6">
                <!-- Preferred Sectors -->
                <div>
                  <label class="label">Preferred Sectors</label>
                  <div class="grid grid-cols-2 gap-2 mt-2 sm:grid-cols-3 lg:grid-cols-4">
                    <div v-for="sector in sectorOptions" :key="sector" class="flex items-center">
                      <input
                        :id="`sector-${sector}`"
                        v-model="tradingProfileForm.preferredSectors"
                        :value="sector"
                        type="checkbox"
                        class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label :for="`sector-${sector}`" class="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        {{ sector }}
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex justify-end">
              <button
                type="submit"
                :disabled="tradingProfileLoading"
                class="btn-primary"
              >
                <span v-if="tradingProfileLoading">Updating...</span>
                <span v-else>Update Trading Profile</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Change Password -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Change Password</h3>
          <form @submit.prevent="changePassword" class="space-y-6">
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label for="currentPassword" class="label">Current Password</label>
                <input
                  id="currentPassword"
                  v-model="passwordForm.currentPassword"
                  type="password"
                  required
                  class="input"
                />
              </div>
              <div></div>
              <div>
                <label for="newPassword" class="label">New Password</label>
                <input
                  id="newPassword"
                  v-model="passwordForm.newPassword"
                  type="password"
                  required
                  class="input"
                />
              </div>
              <div>
                <label for="confirmPassword" class="label">Confirm New Password</label>
                <input
                  id="confirmPassword"
                  v-model="passwordForm.confirmPassword"
                  type="password"
                  required
                  class="input"
                />
              </div>
            </div>

            <div v-if="passwordError" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <p class="text-sm text-red-800 dark:text-red-400">{{ passwordError }}</p>
            </div>

            <div class="flex justify-end">
              <button
                type="submit"
                :disabled="passwordLoading"
                class="btn-primary"
              >
                <span v-if="passwordLoading">Changing...</span>
                <span v-else>Change Password</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Create API Key Modal -->
    <div v-if="showCreateApiKeyModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
        <div class="mt-3">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Create API Key</h3>
          
          <form @submit.prevent="createApiKey" class="space-y-4">
            <div>
              <label for="apiKeyName" class="label">Name</label>
              <input
                id="apiKeyName"
                v-model="createApiKeyForm.name"
                type="text"
                required
                class="input"
                placeholder="My API Key"
              />
            </div>

            <div>
              <label for="apiKeyPermissions" class="label">Permissions</label>
              <div class="space-y-2">
                <div class="flex items-center">
                  <input
                    id="permRead"
                    v-model="createApiKeyForm.permissions"
                    type="checkbox"
                    value="read"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label for="permRead" class="ml-2 block text-sm text-gray-900 dark:text-white">
                    Read - View trades and analytics
                  </label>
                </div>
                <div class="flex items-center">
                  <input
                    id="permWrite"
                    v-model="createApiKeyForm.permissions"
                    type="checkbox"
                    value="write"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label for="permWrite" class="ml-2 block text-sm text-gray-900 dark:text-white">
                    Write - Create and modify trades
                  </label>
                </div>
                <div v-if="authStore.user?.role === 'admin'" class="flex items-center">
                  <input
                    id="permAdmin"
                    v-model="createApiKeyForm.permissions"
                    type="checkbox"
                    value="admin"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label for="permAdmin" class="ml-2 block text-sm text-gray-900 dark:text-white">
                    Admin - Full administrative access
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label for="apiKeyExpiry" class="label">Expires in (days)</label>
              <select
                id="apiKeyExpiry"
                v-model="createApiKeyForm.expiresIn"
                class="input"
              >
                <option :value="null">Never</option>
                <option :value="30">30 days</option>
                <option :value="90">90 days</option>
                <option :value="180">180 days</option>
                <option :value="365">1 year</option>
              </select>
            </div>

            <div class="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                @click="closeCreateApiKeyModal"
                class="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="createApiKeyLoading || createApiKeyForm.permissions.length === 0"
                class="btn-primary"
              >
                <span v-if="createApiKeyLoading">Creating...</span>
                <span v-else>Create API Key</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- API Key Created Modal -->
    <div v-if="showApiKeyCreatedModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
        <div class="mt-3">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">API Key Created</h3>
          
          <div class="space-y-4">
            <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
              <p class="text-sm text-yellow-800 dark:text-yellow-400">
                <strong>Important:</strong> This is the only time you'll see this key. Copy it now and store it securely.
              </p>
            </div>

            <div>
              <label class="label">API Key</label>
              <div class="flex">
                <input
                  :value="createdApiKey.key"
                  readonly
                  class="input font-mono text-xs flex-1"
                />
                <button
                  @click="copyApiKey"
                  class="ml-2 btn-secondary text-xs px-3"
                >
                  Copy
                </button>
              </div>
            </div>

            <div class="text-sm text-gray-600 dark:text-gray-400">
              <p><strong>Name:</strong> {{ createdApiKey.name }}</p>
              <p><strong>Permissions:</strong> {{ createdApiKey.permissions.join(', ') }}</p>
              <p v-if="createdApiKey.expiresAt"><strong>Expires:</strong> {{ formatDate(createdApiKey.expiresAt) }}</p>
            </div>

            <div class="flex justify-end pt-4">
              <button
                @click="closeApiKeyCreatedModal"
                class="btn-primary"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'
import { XMarkIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const authStore = useAuthStore()
const { showSuccess, showError } = useNotification()

const profileLoading = ref(false)
const settingsLoading = ref(false)
const passwordLoading = ref(false)
const tradingProfileLoading = ref(false)
const loadingEquity = ref(false)
const passwordError = ref(null)
const showAddTag = ref(false)
const twoFactorLoading = ref(false)
const show2FASetup = ref(false)
const qrCodeUrl = ref('')
const setupSecret = ref('')
const backupCodes = ref([])
const verificationCode = ref('')
const exportLoading = ref(false)
const importLoading = ref(false)
const importFile = ref(null)
const importFileInput = ref(null)

// API Keys
const apiKeys = ref([])
const apiKeysLoading = ref(false)
const showCreateApiKeyModal = ref(false)
const showApiKeyCreatedModal = ref(false)
const createApiKeyLoading = ref(false)
const createdApiKey = ref(null)

const twoFactorStatus = ref({
  enabled: false,
  backupCodesRemaining: 0
})

const profileForm = ref({
  fullName: '',
  username: '',
  email: '',
  timezone: 'UTC'
})

const settingsForm = ref({
  emailNotifications: true,
  publicProfile: false
})

const defaultTagsInput = ref('')
const accountEquity = ref('')
const lastEquityUpdate = ref(null)

const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const tags = ref([])

const newTag = ref({
  name: '',
  color: '#3B82F6'
})

const tradingProfileForm = ref({
  tradingStrategies: [],
  tradingStyles: [],
  riskTolerance: 'moderate',
  primaryMarkets: [],
  experienceLevel: 'intermediate',
  averagePositionSize: 'medium',
  tradingGoals: [],
  preferredSectors: []
})

// Trading profile options
const strategyOptions = [
  'Breakouts', 'Earnings Plays', 'Momentum Trading', 'Scalping',
  'Gap Trading', 'Mean Reversion', 'Technical Analysis', 'Fundamental Analysis',
  'Options Trading', 'News Trading', 'Support/Resistance', 'Trend Following'
]

const styleOptions = [
  'Day Trading', 'Swing Trading', 'Position Trading', 'Long-term Investing',
  'Short-term Trading', 'Intraday Trading'
]

const marketOptions = [
  'US Stocks', 'International Stocks', 'ETFs', 'Options', 'Futures',
  'Forex', 'Crypto', 'Commodities', 'Bonds'
]

const goalOptions = [
  'Income Generation', 'Capital Appreciation', 'Risk Management',
  'Portfolio Diversification', 'Learning & Education', 'Quick Profits',
  'Steady Growth', 'Beat Market'
]

const sectorOptions = [
  'Technology', 'Healthcare', 'Financials', 'Consumer Discretionary',
  'Consumer Staples', 'Energy', 'Industrials', 'Materials',
  'Utilities', 'Real Estate', 'Communication Services'
]

const createApiKeyForm = ref({
  name: '',
  permissions: ['read'],
  expiresIn: null
})

async function updateProfile() {
  profileLoading.value = true
  
  try {
    const payload = {
      fullName: profileForm.value.fullName,
      timezone: profileForm.value.timezone
    }
    
    // Only include email if 2FA is enabled and email has changed
    if (twoFactorStatus.value.enabled && profileForm.value.email !== authStore.user?.email) {
      payload.email = profileForm.value.email
    }
    
    await api.put('/users/profile', payload)
    
    if (payload.email) {
      showSuccess('Success', 'Profile updated successfully. Please check your new email for verification.')
    } else {
      showSuccess('Success', 'Profile updated successfully')
    }
    
    await authStore.fetchUser()
  } catch (error) {
    showError('Error', error.response?.data?.error || 'Failed to update profile')
  } finally {
    profileLoading.value = false
  }
}

async function updateSettings() {
  settingsLoading.value = true
  
  try {
    const payload = {
      ...settingsForm.value,
      defaultTags: defaultTagsInput.value 
        ? defaultTagsInput.value.split(',').map(tag => tag.trim()).filter(Boolean)
        : []
    }
    
    await api.put('/settings', payload)
    showSuccess('Success', 'Settings updated successfully')
  } catch (error) {
    showError('Error', 'Failed to update settings')
  } finally {
    settingsLoading.value = false
  }
}

async function changePassword() {
  passwordError.value = null
  
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    passwordError.value = 'New passwords do not match'
    return
  }
  
  if (passwordForm.value.newPassword.length < 6) {
    passwordError.value = 'New password must be at least 6 characters long'
    return
  }
  
  passwordLoading.value = true
  
  try {
    await api.put('/users/password', {
      currentPassword: passwordForm.value.currentPassword,
      newPassword: passwordForm.value.newPassword
    })
    
    showSuccess('Success', 'Password changed successfully')
    passwordForm.value = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    }
  } catch (error) {
    passwordError.value = error.response?.data?.error || 'Failed to change password'
  } finally {
    passwordLoading.value = false
  }
}

async function fetchTags() {
  try {
    const response = await api.get('/settings/tags')
    tags.value = response.data.tags
  } catch (error) {
    console.error('Failed to fetch tags:', error)
  }
}

async function addTag() {
  try {
    await api.post('/settings/tags', newTag.value)
    showSuccess('Success', 'Tag added successfully')
    newTag.value = { name: '', color: '#3B82F6' }
    showAddTag.value = false
    fetchTags()
  } catch (error) {
    showError('Error', 'Failed to add tag')
  }
}

async function deleteTag(tagId) {
  if (!confirm('Are you sure you want to delete this tag?')) return
  
  try {
    await api.delete(`/settings/tags/${tagId}`)
    showSuccess('Success', 'Tag deleted successfully')
    fetchTags()
  } catch (error) {
    showError('Error', 'Failed to delete tag')
  }
}

async function updateTradingProfile() {
  tradingProfileLoading.value = true
  
  try {
    await api.put('/settings/trading-profile', tradingProfileForm.value)
    showSuccess('Success', 'Trading profile updated successfully')
  } catch (error) {
    showError('Error', 'Failed to update trading profile')
  } finally {
    tradingProfileLoading.value = false
  }
}

async function fetchTradingProfile() {
  try {
    const response = await api.get('/settings/trading-profile')
    const profile = response.data.tradingProfile
    
    tradingProfileForm.value = {
      tradingStrategies: profile.tradingStrategies || [],
      tradingStyles: profile.tradingStyles || [],
      riskTolerance: profile.riskTolerance || 'moderate',
      primaryMarkets: profile.primaryMarkets || [],
      experienceLevel: profile.experienceLevel || 'intermediate',
      averagePositionSize: profile.averagePositionSize || 'medium',
      tradingGoals: profile.tradingGoals || [],
      preferredSectors: profile.preferredSectors || []
    }
  } catch (error) {
    console.error('Failed to fetch trading profile:', error)
  }
}

async function loadData() {
  try {
    const [userResponse, settingsResponse] = await Promise.all([
      api.get('/users/profile'),
      api.get('/settings')
    ])
    
    const user = userResponse.data.user
    const settings = settingsResponse.data.settings
    
    profileForm.value = {
      fullName: user.full_name || '',
      username: user.username,
      email: user.email,
      timezone: user.timezone || 'UTC'
    }
    
    settingsForm.value = {
      emailNotifications: settings.email_notifications ?? true,
      publicProfile: settings.public_profile ?? false
    }
    
    defaultTagsInput.value = settings.default_tags ? settings.default_tags.join(', ') : ''
    accountEquity.value = settings.account_equity || ''
    lastEquityUpdate.value = settings.account_equity ? 'Recently' : null
    
    fetchTags()
    fetchTradingProfile()
  } catch (error) {
    showError('Error', 'Failed to load settings')
  }
}

async function updateAccountEquity() {
  if (!accountEquity.value) {
    showError('Error', 'Please enter your account equity')
    return
  }

  loadingEquity.value = true
  
  try {
    await api.put('/equity/current', {
      accountEquity: parseFloat(accountEquity.value)
    })
    
    showSuccess('Success', 'Account equity updated successfully')
    lastEquityUpdate.value = 'Just now'
  } catch (error) {
    showError('Error', 'Failed to update account equity')
  } finally {
    loadingEquity.value = false
  }
}

// 2FA Functions
async function fetch2FAStatus() {
  try {
    const response = await api.get('/2fa/status')
    twoFactorStatus.value = response.data
  } catch (error) {
    console.error('Failed to fetch 2FA status:', error)
  }
}

async function setup2FA() {
  twoFactorLoading.value = true
  
  try {
    const response = await api.post('/2fa/setup')
    show2FASetup.value = true
    qrCodeUrl.value = response.data.qrCode
    setupSecret.value = response.data.secret
    backupCodes.value = response.data.backupCodes || []
  } catch (error) {
    showError('Error', 'Failed to set up 2FA')
  } finally {
    twoFactorLoading.value = false
  }
}

async function enable2FA() {
  if (!verificationCode.value) {
    showError('Error', 'Please enter the verification code')
    return
  }
  
  twoFactorLoading.value = true
  
  try {
    await api.post('/2fa/enable', {
      secret: setupSecret.value,
      token: verificationCode.value,
      backupCodes: backupCodes.value
    })
    
    showSuccess('Success', '2FA has been enabled successfully')
    show2FASetup.value = false
    verificationCode.value = ''
    await fetch2FAStatus()
  } catch (error) {
    showError('Error', error.response?.data?.error || 'Failed to enable 2FA')
  } finally {
    twoFactorLoading.value = false
  }
}

async function disable2FA() {
  // TODO: Implement 2FA disable with password + 2FA verification
  showError('Coming Soon', '2FA disable will be implemented next')
}

function cancel2FASetup() {
  show2FASetup.value = false
  verificationCode.value = ''
  qrCodeUrl.value = ''
  setupSecret.value = ''
  backupCodes.value = []
}

async function exportData() {
  exportLoading.value = true
  
  try {
    const response = await api.get('/settings/export', { responseType: 'blob' })
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0]
    link.download = `tradetally-export-${timestamp}.json`
    
    // Trigger download
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    
    showSuccess('Success', 'Data exported successfully')
  } catch (error) {
    showError('Error', 'Failed to export data')
  } finally {
    exportLoading.value = false
  }
}

function handleImportFile(event) {
  const file = event.target.files[0]
  if (file) {
    importFile.value = file
  }
}

async function importData() {
  if (!importFile.value) {
    showError('Error', 'Please select a file to import')
    return
  }
  
  importLoading.value = true
  
  try {
    const formData = new FormData()
    formData.append('file', importFile.value)
    
    const response = await api.post('/settings/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    
    const result = response.data
    const message = `Data imported successfully! Added ${result.tradesAdded} trades, ${result.tagsAdded} tags` + 
                   (result.equityAdded ? `, and ${result.equityAdded} equity records` : '') + '.'
    showSuccess('Success', message)
    
    // Clear import file and refresh data
    importFile.value = null
    importFileInput.value.value = ''
    await loadData()
    
  } catch (error) {
    showError('Error', error.response?.data?.error || 'Failed to import data')
  } finally {
    importLoading.value = false
  }
}

// API Key Management Functions
async function fetchApiKeys() {
  try {
    apiKeysLoading.value = true
    const response = await api.get('/api-keys')
    apiKeys.value = response.data.apiKeys
  } catch (error) {
    showError('Error', 'Failed to load API keys')
  } finally {
    apiKeysLoading.value = false
  }
}

function closeCreateApiKeyModal() {
  showCreateApiKeyModal.value = false
  createApiKeyForm.value = {
    name: '',
    permissions: ['read'],
    expiresIn: null
  }
}

async function createApiKey() {
  try {
    createApiKeyLoading.value = true
    const response = await api.post('/api-keys', createApiKeyForm.value)
    
    createdApiKey.value = response.data.apiKey
    showCreateApiKeyModal.value = false
    showApiKeyCreatedModal.value = true
    
    // Refresh the API keys list
    await fetchApiKeys()
    
    showSuccess('Success', 'API key created successfully')
  } catch (error) {
    showError('Error', error.response?.data?.error || 'Failed to create API key')
  } finally {
    createApiKeyLoading.value = false
  }
}

function closeApiKeyCreatedModal() {
  showApiKeyCreatedModal.value = false
  createdApiKey.value = null
  // Reset the form
  createApiKeyForm.value = {
    name: '',
    permissions: ['read'],
    expiresIn: null
  }
}

async function copyApiKey() {
  try {
    await navigator.clipboard.writeText(createdApiKey.value.key)
    showSuccess('Success', 'API key copied to clipboard')
  } catch (error) {
    showError('Error', 'Failed to copy API key')
  }
}

async function toggleApiKey(apiKey) {
  try {
    apiKeysLoading.value = true
    await api.put(`/api-keys/${apiKey.id}`, {
      isActive: !apiKey.isActive
    })
    
    // Refresh the API keys list
    await fetchApiKeys()
    
    showSuccess('Success', `API key ${apiKey.isActive ? 'deactivated' : 'activated'}`)
  } catch (error) {
    showError('Error', error.response?.data?.error || 'Failed to update API key')
  } finally {
    apiKeysLoading.value = false
  }
}

async function deleteApiKey(apiKey) {
  if (!confirm(`Are you sure you want to delete the API key "${apiKey.name}"? This action cannot be undone.`)) {
    return
  }
  
  try {
    apiKeysLoading.value = true
    await api.delete(`/api-keys/${apiKey.id}`)
    
    // Refresh the API keys list
    await fetchApiKeys()
    
    showSuccess('Success', 'API key deleted successfully')
  } catch (error) {
    showError('Error', error.response?.data?.error || 'Failed to delete API key')
  } finally {
    apiKeysLoading.value = false
  }
}

function formatDate(dateString) {
  if (!dateString) return 'Never'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

onMounted(() => {
  loadData()
  fetch2FAStatus()
  fetchApiKeys()
})
</script>