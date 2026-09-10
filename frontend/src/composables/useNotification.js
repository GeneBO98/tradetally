import { ref } from 'vue'

const notification = ref(null)
const modalAlert = ref(null)

export function useNotification() {
  function showNotification(type, title, message = '', options = {}) {
    notification.value = {
      type,
      title,
      message,
      actions: options.actions || [],
      duration: options.duration
    }
  }

  function showSuccess(title, message, options = {}) {
    showNotification('success', title, message, options)
  }

  function showError(title, message, options = {}) {
    showNotification('error', title, message, options)
  }

  function showWarning(title, message, options = {}) {
    showNotification('warning', title, message, options)
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
      linkUrl: options.linkUrl,
      linkText: options.linkText,
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
      checkboxLabel: options.checkboxLabel || null,
      checkboxChecked: options.checkboxChecked === true,
      asyncConfirmation: options.asyncConfirmation === true,
      pendingText: options.pendingText || 'Working...',
      isSubmitting: false,
      onConfirm: () => {
        const checkboxChecked = modalAlert.value?.checkboxChecked === true
        if (!options.asyncConfirmation) {
          clearModalAlert()
          onConfirm(checkboxChecked)
          return
        }

        const currentAlert = modalAlert.value
        if (!currentAlert || currentAlert.isSubmitting) return

        currentAlert.isSubmitting = true
        Promise.resolve()
          .then(() => onConfirm(checkboxChecked))
          .then(result => {
            if (modalAlert.value !== currentAlert) return
            if (result === false) {
              currentAlert.isSubmitting = false
              return
            }
            clearModalAlert()
          })
          .catch(() => {
            if (modalAlert.value === currentAlert) {
              currentAlert.isSubmitting = false
            }
          })
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
