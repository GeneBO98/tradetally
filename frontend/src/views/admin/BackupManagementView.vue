<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
    <div class="content-wrapper">
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Backup Management</h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Configure automatic backups and manage full site exports
        </p>
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="flex justify-center items-center h-64">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>

      <div v-else class="space-y-6">
        <!-- Settings Card -->
        <div class="bg-white dark:bg-gray-800 shadow sm:rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">
              Backup Settings
            </h3>

            <!-- Success message -->
            <div v-if="successMessage" class="mb-4 rounded-md bg-green-50 dark:bg-green-900/20 p-4">
              <p class="text-sm text-green-800 dark:text-green-400">{{ successMessage }}</p>
            </div>

            <!-- Error message -->
            <div v-if="errorMessage" class="mb-4 rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <p class="text-sm text-red-800 dark:text-red-400">{{ errorMessage }}</p>
            </div>

            <div class="space-y-4">
              <!-- Enable/Disable Automatic Backups -->
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Automatic Backups
                  </label>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    Enable scheduled automatic backups of all site data
                  </p>
                </div>
                <button
                  @click="toggleBackups"
                  :disabled="savingSettings"
                  type="button"
                  :class="[
                    settings.enabled
                      ? 'bg-primary-600'
                      : 'bg-gray-200 dark:bg-gray-700',
                    'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
                  ]"
                >
                  <span
                    :class="[
                      settings.enabled ? 'translate-x-5' : 'translate-x-0',
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200'
                    ]"
                  />
                </button>
              </div>

              <!-- Schedule Selection -->
              <div v-if="settings.enabled">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Backup Schedule
                </label>
                <select
                  v-model="settings.schedule"
                  @change="saveSettings"
                  :disabled="savingSettings"
                  class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
                >
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily (2 AM)</option>
                  <option value="weekly">Weekly (Sunday 2 AM)</option>
                  <option value="monthly">Monthly (1st day, 2 AM)</option>
                </select>
              </div>

              <!-- Retention Days -->
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Retention Period (days)
                </label>
                <input
                  v-model.number="settings.retentionDays"
                  @blur="saveSettings"
                  type="number"
                  min="1"
                  max="365"
                  :disabled="savingSettings"
                  class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Backups older than this will be automatically deleted
                </p>
              </div>

              <!-- Last Backup Info -->
              <div v-if="settings.lastBackup" class="pt-4 border-t border-gray-200 dark:border-gray-700">
                <p class="text-sm text-gray-700 dark:text-gray-300">
                  Last automatic backup:
                  <span class="font-medium">{{ formatDate(settings.lastBackup) }}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Manual Backup Card -->
        <div class="bg-white dark:bg-gray-800 shadow sm:rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                  Manual Backup
                </h3>
                <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Create an immediate backup of all site data
                </p>
              </div>
              <button
                @click="createManualBackup"
                :disabled="creatingBackup"
                type="button"
                class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg v-if="creatingBackup" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ creatingBackup ? 'Creating...' : 'Create Backup Now' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Backup History -->
        <div class="bg-white dark:bg-gray-800 shadow sm:rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                Backup History
              </h3>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                {{ backups.length }} backup{{ backups.length !== 1 ? 's' : '' }}
              </div>
            </div>

            <div v-if="backups.length === 0" class="text-center py-12">
              <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No backups</h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Get started by creating your first backup
              </p>
            </div>

            <div v-else class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Filename
                    </th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Type
                    </th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Size
                    </th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Created
                    </th>
                    <th class="px-3 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  <tr v-for="backup in backups" :key="backup.id" class="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td class="px-3 py-3 text-sm text-gray-900 dark:text-white">
                      {{ backup.filename }}
                    </td>
                    <td class="px-3 py-3 whitespace-nowrap">
                      <span :class="[
                        backup.backupType === 'manual'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium'
                      ]">
                        {{ backup.backupType }}
                      </span>
                    </td>
                    <td class="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {{ formatFileSize(backup.fileSize) }}
                    </td>
                    <td class="px-3 py-3 whitespace-nowrap">
                      <span :class="[
                        backup.status === 'completed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : backup.status === 'failed'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium'
                      ]">
                        {{ backup.status }}
                      </span>
                    </td>
                    <td class="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {{ formatDate(backup.createdAt) }}
                    </td>
                    <td class="px-3 py-3 text-right text-sm font-medium space-x-2">
                      <button
                        v-if="backup.status === 'completed'"
                        @click="downloadBackup(backup.id, backup.filename)"
                        :disabled="downloading[backup.id]"
                        class="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300 disabled:opacity-50"
                      >
                        {{ downloading[backup.id] ? 'Downloading...' : 'Download' }}
                      </button>
                      <button
                        @click="deleteBackup(backup.id)"
                        :disabled="deleting[backup.id]"
                        class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                      >
                        {{ deleting[backup.id] ? 'Deleting...' : 'Delete' }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Restore from Backup Card -->
        <div class="bg-white dark:bg-gray-800 shadow sm:rounded-lg border-2 border-amber-200 dark:border-amber-800">
          <div class="px-4 py-5 sm:p-6">
            <div class="flex items-start">
              <div class="flex-shrink-0">
                <svg class="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div class="ml-3 flex-1">
                <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                  Restore from Backup
                </h3>
                <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Upload a backup file to restore site data. This will add missing data without deleting existing records.
                </p>
                <div class="mt-4">
                  <input
                    ref="restoreFileInput"
                    type="file"
                    accept=".json"
                    @change="handleRestoreFileSelect"
                    class="hidden"
                  />
                  <div class="flex items-center space-x-4">
                    <button
                      @click="$refs.restoreFileInput.click()"
                      :disabled="restoring"
                      type="button"
                      class="inline-flex items-center px-4 py-2 border border-amber-300 dark:border-amber-600 text-sm font-medium rounded-md text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg class="-ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Select Backup File
                    </button>
                    <span v-if="selectedRestoreFile" class="text-sm text-gray-600 dark:text-gray-400">
                      {{ selectedRestoreFile.name }} ({{ formatFileSize(selectedRestoreFile.size) }})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Cleanup Section -->
        <div class="bg-white dark:bg-gray-800 shadow sm:rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                  Cleanup Old Backups
                </h3>
                <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Manually delete backups older than the retention period
                </p>
              </div>
              <button
                @click="cleanupOldBackups"
                :disabled="cleaningUp"
                type="button"
                class="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg v-if="cleaningUp" class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ cleaningUp ? 'Cleaning...' : 'Run Cleanup' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Restore Confirmation Modal -->
    <div v-if="showRestoreModal" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <!-- Background overlay -->
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 transition-opacity" @click="showRestoreModal = false"></div>

        <!-- Modal panel -->
        <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div class="sm:flex sm:items-start">
            <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 sm:mx-0 sm:h-10 sm:w-10">
              <svg class="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
              <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
                Confirm Backup Restore
              </h3>
              <div class="mt-2">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  You are about to restore data from:
                </p>
                <p class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {{ selectedRestoreFile?.name }}
                </p>
                <!-- Overwrite option -->
                <div class="mt-4 flex items-start">
                  <div class="flex items-center h-5">
                    <input
                      id="overwrite-users"
                      v-model="overwriteUsers"
                      type="checkbox"
                      class="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded"
                    />
                  </div>
                  <div class="ml-3 text-sm">
                    <label for="overwrite-users" class="font-medium text-gray-700 dark:text-gray-300">
                      Overwrite matching users data
                    </label>
                    <p class="text-gray-500 dark:text-gray-400">
                      Update existing users with data from the backup (name, settings, etc.)
                    </p>
                  </div>
                </div>

                <div class="mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3">
                  <div class="flex">
                    <svg class="h-5 w-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                    </svg>
                    <div class="ml-3">
                      <h3 class="text-sm font-medium text-amber-800 dark:text-amber-300">Warning</h3>
                      <div class="mt-1 text-sm text-amber-700 dark:text-amber-400">
                        <ul class="list-disc list-inside space-y-1">
                          <li>This will restore users, trades, and other data from the backup</li>
                          <li v-if="!overwriteUsers">Existing records with the same ID will be skipped</li>
                          <li v-if="overwriteUsers" class="font-medium">Existing users will be UPDATED with backup data</li>
                          <li>New records from the backup will be added</li>
                          <li>This action may take several minutes for large backups</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
            <button
              @click="executeRestore"
              :disabled="restoring"
              type="button"
              class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg v-if="restoring" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {{ restoring ? 'Restoring...' : 'Restore Backup' }}
            </button>
            <button
              @click="cancelRestore"
              :disabled="restoring"
              type="button"
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '@/services/api';
import { useUserTimezone } from '@/composables/useUserTimezone';

const { formatDateTime: formatDateTimeTz } = useUserTimezone();

const loading = ref(true);
const creatingBackup = ref(false);
const savingSettings = ref(false);
const cleaningUp = ref(false);
const restoring = ref(false);
const successMessage = ref('');
const errorMessage = ref('');
const backups = ref([]);
const downloading = ref({});
const deleting = ref({});

// Restore state
const selectedRestoreFile = ref(null);
const showRestoreModal = ref(false);
const overwriteUsers = ref(false);

const settings = ref({
  enabled: false,
  schedule: 'daily',
  retentionDays: 30,
  lastBackup: null
});

// Fetch backup settings and history
async function loadData() {
  try {
    loading.value = true;
    errorMessage.value = '';

    const [settingsRes, backupsRes] = await Promise.all([
      api.get('/admin/backup/settings'),
      api.get('/admin/backup')
    ]);

    settings.value = {
      enabled: settingsRes.data.enabled,
      schedule: settingsRes.data.schedule,
      retentionDays: settingsRes.data.retention_days,
      lastBackup: settingsRes.data.last_backup
    };

    backups.value = backupsRes.data.backups.map(b => ({
      id: b.id,
      filename: b.filename,
      fileSize: b.file_size,
      backupType: b.backup_type,
      status: b.status,
      createdAt: b.created_at,
      errorMessage: b.error_message
    }));
  } catch (error) {
    console.error('Error loading backup data:', error);
    errorMessage.value = error.response?.data?.error || 'Failed to load backup data';
  } finally {
    loading.value = false;
  }
}

// Toggle automatic backups
async function toggleBackups() {
  settings.value.enabled = !settings.value.enabled;
  await saveSettings();
}

// Save backup settings
async function saveSettings() {
  try {
    savingSettings.value = true;
    successMessage.value = '';
    errorMessage.value = '';

    await api.put('/admin/backup/settings', {
      enabled: settings.value.enabled,
      schedule: settings.value.schedule,
      retention_days: settings.value.retentionDays
    });

    successMessage.value = 'Settings saved successfully';
    setTimeout(() => {
      successMessage.value = '';
    }, 3000);
  } catch (error) {
    console.error('Error saving settings:', error);
    errorMessage.value = error.response?.data?.error || 'Failed to save settings';
  } finally {
    savingSettings.value = false;
  }
}

// Create manual backup
async function createManualBackup() {
  try {
    creatingBackup.value = true;
    successMessage.value = '';
    errorMessage.value = '';

    const response = await api.post('/admin/backup');

    successMessage.value = `Backup created successfully: ${response.data.filename}`;
    setTimeout(() => {
      successMessage.value = '';
    }, 5000);

    // Reload backups list
    await loadData();
  } catch (error) {
    console.error('Error creating backup:', error);
    errorMessage.value = error.response?.data?.error || 'Failed to create backup';
  } finally {
    creatingBackup.value = false;
  }
}

// Download backup
async function downloadBackup(backupId, filename) {
  try {
    downloading.value[backupId] = true;

    const response = await api.get(`/admin/backup/${backupId}/download`, {
      responseType: 'blob'
    });

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading backup:', error);
    errorMessage.value = 'Failed to download backup';
  } finally {
    downloading.value[backupId] = false;
  }
}

// Delete backup
async function deleteBackup(backupId) {
  if (!confirm('Are you sure you want to delete this backup? This action cannot be undone.')) {
    return;
  }

  try {
    deleting.value[backupId] = true;

    await api.delete(`/admin/backup/${backupId}`);

    successMessage.value = 'Backup deleted successfully';
    setTimeout(() => {
      successMessage.value = '';
    }, 3000);

    // Remove from list
    backups.value = backups.value.filter(b => b.id !== backupId);
  } catch (error) {
    console.error('Error deleting backup:', error);
    errorMessage.value = error.response?.data?.error || 'Failed to delete backup';
  } finally {
    deleting.value[backupId] = false;
  }
}

// Cleanup old backups
async function cleanupOldBackups() {
  if (!confirm(`Delete backups older than ${settings.value.retentionDays} days?`)) {
    return;
  }

  try {
    cleaningUp.value = true;
    successMessage.value = '';
    errorMessage.value = '';

    const response = await api.post('/admin/backup/cleanup', {
      days: settings.value.retentionDays
    });

    successMessage.value = response.data.message;
    setTimeout(() => {
      successMessage.value = '';
    }, 5000);

    // Reload backups list
    await loadData();
  } catch (error) {
    console.error('Error cleaning up backups:', error);
    errorMessage.value = error.response?.data?.error || 'Failed to cleanup backups';
  } finally {
    cleaningUp.value = false;
  }
}

// Handle restore file selection
function handleRestoreFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    selectedRestoreFile.value = file;
    showRestoreModal.value = true;
  }
  // Reset the input so the same file can be selected again if needed
  event.target.value = '';
}

// Execute the restore
async function executeRestore() {
  if (!selectedRestoreFile.value) {
    errorMessage.value = 'No backup file selected';
    return;
  }

  try {
    restoring.value = true;
    successMessage.value = '';
    errorMessage.value = '';

    const formData = new FormData();
    formData.append('file', selectedRestoreFile.value);
    formData.append('overwriteUsers', overwriteUsers.value);

    const response = await api.post('/admin/backup/restore', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    // Build success message with details
    let message = response.data.message;
    if (response.data.results) {
      const results = response.data.results;
      const details = [];
      if (results.users?.added > 0) details.push(`${results.users.added} users`);
      if (results.users?.updated > 0) details.push(`${results.users.updated} users updated`);
      if (results.trades?.added > 0) details.push(`${results.trades.added} trades`);
      if (results.diaryEntries?.added > 0) details.push(`${results.diaryEntries.added} diary entries`);
      if (results.other?.added > 0) details.push(`${results.other.added} other records`);
      if (details.length > 0 && !message.includes('Restored:')) {
        message += ` - ${details.join(', ')}`;
      }
    }

    successMessage.value = message;
    showRestoreModal.value = false;
    selectedRestoreFile.value = null;
    overwriteUsers.value = false;

    // Reload data to reflect any changes
    await loadData();
  } catch (error) {
    console.error('Error restoring backup:', error);
    const hint = error.response?.data?.hint;
    const errorMsg = error.response?.data?.error || error.response?.data?.message || 'Restore failed';
    errorMessage.value = hint ? `${errorMsg} - ${hint}` : errorMsg;
  } finally {
    restoring.value = false;
  }
}

// Cancel restore
function cancelRestore() {
  showRestoreModal.value = false;
  selectedRestoreFile.value = null;
  overwriteUsers.value = false;
}

// Format date
function formatDate(dateString) {
  if (!dateString) return 'Never';
  return formatDateTimeTz(dateString);
}

// Format file size
function formatFileSize(bytes) {
  if (!bytes) return 'N/A';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

onMounted(() => {
  loadData();
});
</script>
