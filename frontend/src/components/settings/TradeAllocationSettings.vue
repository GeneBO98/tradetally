<template>
  <section class="card">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-4 p-6 text-left"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">Optional accounting tools</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Additional tools for specialized recordkeeping workflows.
        </p>
      </div>
      <ChevronDownIcon
        class="h-5 w-5 flex-shrink-0 text-gray-400 transition-transform"
        :class="{ 'rotate-180': expanded }"
      />
    </button>

    <div v-if="expanded" class="border-t border-gray-200 px-6 py-6 dark:border-gray-700">
      <div class="flex items-start justify-between gap-6">
        <div class="max-w-2xl">
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Trade allocations</h4>
          <p class="mt-1.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            Divide a trade proportionally across private accounting groups. This does not alter
            brokerage records, legal ownership, tax lots, or your existing tags.
          </p>
        </div>
        <button
          type="button"
          class="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2"
          :class="enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'"
          role="switch"
          :aria-checked="enabled"
          :disabled="savingFeature || loading"
          @click="toggleFeature"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
            :class="enabled ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <div v-if="error" class="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
        {{ error }}
      </div>

      <div v-if="enabled" class="mt-6 border-t border-gray-200 pt-6 dark:border-gray-700">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Allocation groups</h4>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Create at least two groups before allocating a trade.
            </p>
          </div>
          <router-link
            v-if="groups.length > 0"
            to="/metrics/allocations"
            class="btn-secondary inline-flex items-center justify-center gap-2"
          >
            <ChartBarIcon class="h-4 w-4" />
            View allocation report
          </router-link>
        </div>

        <div v-if="loadingGroups" class="flex justify-center py-8">
          <div class="h-7 w-7 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
        </div>

        <div v-else class="mt-5 space-y-3">
          <div
            v-for="group in groups"
            :key="group.id"
            class="flex flex-col gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700 sm:flex-row sm:items-center"
          >
            <label class="relative h-9 w-9 flex-shrink-0 cursor-pointer" title="Change group color">
              <span
                class="block h-9 w-9 rounded-md border border-gray-300 dark:border-gray-600"
                :style="{ backgroundColor: group.color }"
              />
              <input
                v-model="group.color"
                type="color"
                class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <input
              v-model="group.name"
              type="text"
              maxlength="80"
              class="input min-w-0 flex-1"
              aria-label="Allocation group name"
            />
            <span class="text-xs text-gray-500 dark:text-gray-400">
              {{ group.trade_count }} {{ group.trade_count === 1 ? 'trade' : 'trades' }}
            </span>
            <button type="button" class="btn-secondary" @click="saveGroup(group)">Save</button>
            <button
              type="button"
              class="rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              @click="archiveGroup(group)"
            >
              Archive
            </button>
          </div>

          <form class="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/60" @submit.prevent="createGroup">
            <label for="allocation-group-name" class="label">New group</label>
            <div class="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="allocation-group-name"
                v-model="newGroup.name"
                type="text"
                maxlength="80"
                placeholder="Core"
                class="input min-w-0 flex-1"
              />
              <input
                v-model="newGroup.color"
                type="color"
                class="h-10 w-12 cursor-pointer rounded-md border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-700"
                title="Group color"
              />
              <button type="submit" class="btn-primary inline-flex items-center justify-center gap-2" :disabled="creatingGroup || !newGroup.name.trim()">
                <PlusIcon class="h-4 w-4" />
                {{ creatingGroup ? 'Adding...' : 'Add group' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ChartBarIcon, ChevronDownIcon, PlusIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const expanded = ref(false)
const enabled = ref(false)
const loading = ref(true)
const savingFeature = ref(false)
const loadingGroups = ref(false)
const creatingGroup = ref(false)
const groups = ref([])
const error = ref('')
const newGroup = reactive({ name: '', color: '#64748B' })

function errorMessage(err, fallback) {
  return err?.response?.data?.error || err?.response?.data?.message || fallback
}

async function loadFeature() {
  loading.value = true
  try {
    const response = await api.get('/settings')
    enabled.value = response.data?.settings?.tradeAllocationsEnabled === true
    if (enabled.value) await loadGroups()
  } catch (err) {
    error.value = errorMessage(err, 'Unable to load optional accounting tools')
  } finally {
    loading.value = false
  }
}

async function toggleFeature() {
  if (savingFeature.value) return
  savingFeature.value = true
  error.value = ''
  const nextValue = !enabled.value
  try {
    await api.put('/settings', { tradeAllocationsEnabled: nextValue })
    enabled.value = nextValue
    if (nextValue) await loadGroups()
  } catch (err) {
    error.value = errorMessage(err, 'Unable to update trade allocations')
  } finally {
    savingFeature.value = false
  }
}

async function loadGroups() {
  loadingGroups.value = true
  try {
    const response = await api.get('/trade-allocations/groups')
    groups.value = response.data.groups || []
  } catch (err) {
    error.value = errorMessage(err, 'Unable to load allocation groups')
  } finally {
    loadingGroups.value = false
  }
}

async function createGroup() {
  if (!newGroup.name.trim() || creatingGroup.value) return
  creatingGroup.value = true
  error.value = ''
  try {
    await api.post('/trade-allocations/groups', {
      name: newGroup.name.trim(),
      color: newGroup.color
    })
    newGroup.name = ''
    await loadGroups()
  } catch (err) {
    error.value = errorMessage(err, 'Unable to create allocation group')
  } finally {
    creatingGroup.value = false
  }
}

async function saveGroup(group) {
  error.value = ''
  try {
    await api.put(`/trade-allocations/groups/${group.id}`, {
      name: group.name.trim(),
      color: group.color
    })
    await loadGroups()
  } catch (err) {
    error.value = errorMessage(err, 'Unable to update allocation group')
  }
}

async function archiveGroup(group) {
  if (!window.confirm(`Archive “${group.name}”? Existing allocation history will be preserved.`)) return
  error.value = ''
  try {
    await api.delete(`/trade-allocations/groups/${group.id}`)
    await loadGroups()
  } catch (err) {
    error.value = errorMessage(err, 'Unable to archive allocation group')
  }
}

onMounted(loadFeature)
</script>
