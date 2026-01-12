<template>
  <div class="ai-report">
    <template v-if="sections.length > 0">
      <AIReportSection
        v-for="(section, index) in sections"
        :key="index"
        :section="section"
      />
    </template>
    <div v-else class="ai-report-empty">
      <p>No content available</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import AIReportSection from './AIReportSection.vue'
import { parseMarkdownToSections } from '@/utils/aiReportParser'

const props = defineProps({
  content: {
    type: String,
    required: true
  }
})

const sections = computed(() => {
  return parseMarkdownToSections(props.content)
})
</script>
