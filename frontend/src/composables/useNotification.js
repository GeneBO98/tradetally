import { ref } from 'vue'

const notification = ref(null)
const modalAlert = ref(null)

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

  // New method for critical errors that need immediate attention
  function showCriticalError(title, message, options = {}) {
    modalAlert.value = { 
      type: 'error', 
      title, 
      message,
      confirmText: options.confirmText || 'OK',
      onConfirm: options.onConfirm || clearModalAlert
    }
  }

  // New method for important warnings that need user acknowledgment
  function showImportantWarning(title, message, options = {}) {
    modalAlert.value = { 
      type: 'warning', 
      title, 
      message,
      confirmText: options.confirmText || 'OK',
      cancelText: options.cancelText,
      onConfirm: options.onConfirm || clearModalAlert,
      onCancel: options.onCancel || clearModalAlert
    }
  }

  // New method for confirmation dialogs
  function showConfirmation(title, message, onConfirm, onCancel = null) {
    modalAlert.value = {
      type: 'confirm',
      title,
      message,
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      onConfirm: () => {
        clearModalAlert()
        onConfirm()
      },
      onCancel: () => {
        clearModalAlert()
        if (onCancel) onCancel()
      }
    }
  }

  // Danger confirmation for destructive actions (delete, etc.)
  function showDangerConfirmation(title, message, onConfirm, options = {}) {
    modalAlert.value = {
      type: 'error',
      title,
      message,
      confirmText: options.confirmText || 'Delete',
      cancelText: options.cancelText || 'Cancel',
      onConfirm: () => {
        clearModalAlert()
        onConfirm()
      },
      onCancel: () => {
        clearModalAlert()
        if (options.onCancel) options.onCancel()
      }
    }
  }

  // New method for success modals
  function showSuccessModal(title, message, options = {}) {
    modalAlert.value = {
      type: 'success',
      title,
      message,
      confirmText: options.confirmText || 'OK',
      onConfirm: options.onConfirm || clearModalAlert
    }
  }

  function clearNotification() {
    notification.value = null
  }

  function clearModalAlert() {
    modalAlert.value = null
  }

  return {
    notification,
    modalAlert,
    showNotification,
    showSuccess,
    showError,
    showWarning,
    showCriticalError,
    showImportantWarning,
    showConfirmation,
    showDangerConfirmation,
    showSuccessModal,
    clearNotification,
    clearModalAlert
  }
}