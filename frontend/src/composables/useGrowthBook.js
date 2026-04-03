import { computed } from 'vue'
import {
  growthbook,
  initialized,
  isGrowthBookConfigured,
  ready,
  refreshGrowthBook,
  version
} from '@/services/growthbook'

function touchVersion() {
  return version.value
}

export function useGrowthBook() {
  const isOn = (featureKey) => {
    touchVersion()
    return growthbook?.isOn(featureKey) ?? false
  }

  const isOff = (featureKey) => {
    touchVersion()
    return growthbook?.isOff(featureKey) ?? true
  }

  const getFeatureValue = (featureKey, fallbackValue) => {
    touchVersion()
    return growthbook?.getFeatureValue(featureKey, fallbackValue) ?? fallbackValue
  }

  const evalFeature = (featureKey) => {
    touchVersion()
    return growthbook?.evalFeature(featureKey) ?? {
      value: null,
      source: 'unknownFeature',
      on: false,
      off: true,
      ruleId: ''
    }
  }

  return {
    growthbook,
    isConfigured: computed(() => isGrowthBookConfigured()),
    isInitialized: computed(() => initialized.value),
    isReady: computed(() => ready.value),
    isOn,
    isOff,
    getFeatureValue,
    evalFeature,
    refresh: refreshGrowthBook
  }
}
