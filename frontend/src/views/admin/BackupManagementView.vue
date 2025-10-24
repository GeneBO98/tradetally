<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
    <div class="max-w-[75%] mx-auto px-4 sm:px-6 lg:px-8">
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { format } from 'date-fns';
import api from '@/services/api';

const loading = ref(true);
const creatingBackup = ref(false);
const savingSettings = ref(false);
const cleaningUp = ref(false);
const successMessage = ref('');
const errorMessage = ref('');
const backups = ref([]);
const downloading = ref({});
const deleting = ref({});

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

// Format date
function formatDate(dateString) {
  if (!dateString) return 'Never';
  return format(new Date(dateString), 'MMM d, yyyy h:mm a');
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
