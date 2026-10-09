<template>
  <section class="card" aria-labelledby="analysis-instructions-title" :aria-busy="loading">
    <div class="card-body">
      <h3 id="analysis-instructions-title" class="text-lg font-medium text-gray-900 dark:text-white mb-2">Analysis instructions</h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Personalize trade reviews and performance analysis. Describe your chart colours, trading rules, or areas to focus on. These instructions apply to new analyses and their follow-up conversations.
      </p>
      <div v-if="initialLoading" class="flex justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
      <form v-else @submit.prevent="save">
        <label for="ai-analysis-instructions" class="label">Your instructions</label>
        <textarea id="ai-analysis-instructions" v-model="ai_analysis_instructions" rows="7" maxlength="6000" class="input w-full" :disabled="loading || !loaded" aria-describedby="analysis-instructions-help" placeholder="Yellow lines indicate support; purple lines indicate resistance. Focus on entry timing and whether I followed my plan."></textarea>
        <div class="flex flex-wrap justify-between gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
          <p id="analysis-instructions-help">The standard analysis structure and trade data remain part of every review.</p>
          <span>{{ ai_analysis_instructions.length }} / 6,000</span>
        </div>
        <p v-if="error" role="alert" class="text-sm text-red-600 dark:text-red-400 mt-3">{{ error }}</p>
        <div class="flex items-center gap-3 mt-4">
          <button type="submit" class="btn-primary" :disabled="loading || !loaded">{{ loading ? 'Saving...' : 'Save instructions' }}</button>
          <button type="button" class="btn-secondary" :disabled="loading || !loaded" @click="clear">Clear instructions</button>
          <button v-if="!loaded" type="button" class="btn-secondary" @click="load">Retry</button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import { useNotification } from '@/composables/useNotification'

const { showSuccess } = useNotification()
const ai_analysis_instructions = ref('')
const loading = ref(false)
const initialLoading = ref(true)
const loaded = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const response = await api.get('/settings/ai-analysis')
    ai_analysis_instructions.value = response.data.ai_analysis_instructions || ''
    loaded.value = true
  } catch (err) {
    error.value = err.response?.data?.error || 'Could not load analysis instructions.'
  } finally {
    initialLoading.value = false
    loading.value = false
  }
}

async function save() {
  loading.value = true
  error.value = ''
  try {
    const response = await api.put('/settings/ai-analysis', { ai_analysis_instructions: ai_analysis_instructions.value })
    ai_analysis_instructions.value = response.data.ai_analysis_instructions
    showSuccess('Instructions saved', 'New analyses will use your saved instructions.')
  } catch (err) {
    error.value = err.response?.data?.error || 'Could not save analysis instructions.'
  } finally {
    loading.value = false
  }
}

async function clear() {
  const previous = ai_analysis_instructions.value
  ai_analysis_instructions.value = ''
  await save()
  if (error.value) ai_analysis_instructions.value = previous
}

onMounted(load)
</script>
