import { ref } from 'vue'

const notification = ref(null)

export function useNotification() {
  function showNotification(type, title, message = '') {
    notification.value = { type, title, message }
  }

  function showSuccess(title, message) {
    showNotification('success', title, message)
  }

  function showError(title, message) {
    showNotification('error', title, message)
  }

  function showWarning(title, message) {
    showNotification('warning', title, message)
  }

  function clearNotification() {
    notification.value = null
  }

  return {
    notification,
    showNotification,
    showSuccess,
    showError,
    showWarning,
    clearNotification
  }
}