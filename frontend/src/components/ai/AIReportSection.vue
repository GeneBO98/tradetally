<template>
  <div class="ai-report-card">
    <!-- Card Header -->
    <div class="ai-report-card-header">
      <div class="ai-report-card-header-content">
        <div class="ai-report-icon-wrapper">
          <component :is="iconComponent" class="ai-report-icon" />
        </div>
        <h2 class="ai-report-card-title">{{ section.title }}</h2>
      </div>
    </div>

    <!-- Card Body -->
    <div class="ai-report-card-body">
      <div class="ai-section-content" v-html="parsedContent"></div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { parseSectionContent } from '@/utils/aiReportParser'
import {
  ChartBarIcon,
  ShieldCheckIcon,
  LightBulbIcon,
  BuildingOfficeIcon,
  ArrowRightCircleIcon,
  DocumentTextIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  BanknotesIcon,
  ArrowsRightLeftIcon,
  ClipboardDocumentListIcon
} from '@heroicons/vue/24/outline'

const props = defineProps({
  section: {
    type: Object,
    required: true,
    validator: (value) => {
      return value.title && typeof value.content === 'string'
    }
  }
})

// Map icon names to components
const iconMap = {
  ChartBarIcon,
  ShieldCheckIcon,
  LightBulbIcon,
  BuildingOfficeIcon,
  ArrowRightCircleIcon,
  DocumentTextIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  BanknotesIcon,
  ArrowsRightLeftIcon,
  ClipboardDocumentListIcon
}

const iconComponent = computed(() => {
  return iconMap[props.section.icon] || DocumentTextIcon
})

const parsedContent = computed(() => {
  return parseSectionContent(props.section.content)
})
</script>
