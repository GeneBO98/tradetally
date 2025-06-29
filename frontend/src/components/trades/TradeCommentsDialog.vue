<template>
  <Teleport to="body">
    <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto">
      <!-- Backdrop -->
      <div 
        class="fixed inset-0 bg-black bg-opacity-25 transition-opacity"
        @click="closeDialog"
      ></div>

      <!-- Modal -->
      <div class="flex min-h-full items-center justify-center p-4">
        <div 
          class="relative w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left shadow-xl transition-all"
          @click.stop
        >
          <!-- Title -->
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white flex items-center gap-2">
              <ChatBubbleLeftIcon class="h-5 w-5" />
              Comments
            </h3>
            <button
              @click="closeDialog"
              class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Comments List -->
          <div class="mt-4 max-h-96 overflow-y-auto">
            <div v-if="loading" class="text-center py-4">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            </div>

            <div v-else-if="comments.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
              No comments yet. Be the first to comment!
            </div>

            <div v-else class="space-y-4">
              <div
                v-for="comment in comments"
                :key="comment.id"
                class="flex space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div class="flex-shrink-0">
                  <div class="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center">
                    <span class="text-sm font-medium text-white">
                      {{ comment.username ? comment.username.charAt(0).toUpperCase() : 'U' }}
                    </span>
                  </div>
                </div>
                <div class="flex-1">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                      <span class="font-medium text-gray-900 dark:text-white">
                        {{ comment.username || 'Unknown User' }}
                      </span>
                      <span class="text-sm text-gray-500 dark:text-gray-400">
                        {{ formatDate(comment.created_at) }}
                        <span v-if="comment.edited_at" class="italic">(edited)</span>
                      </span>
                    </div>
                    <div v-if="comment.user_id === currentUserId" class="flex items-center space-x-2">
                      <button
                        @click="startEditComment(comment)"
                        class="text-xs text-gray-500 hover:text-primary-600 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        @click="deleteComment(comment.id)"
                        class="text-xs text-red-500 hover:text-red-700 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <!-- Edit form or comment text -->
                  <div v-if="editingCommentId === comment.id" class="mt-1">
                    <textarea
                      v-model="editCommentText"
                      rows="3"
                      class="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-600 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 px-3 py-2"
                      :disabled="submitting"
                      @keydown="handleEditKeydown"
                    ></textarea>
                    <div class="mt-2 flex justify-end space-x-2">
                      <button
                        @click="cancelEdit"
                        class="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        @click="saveEditComment(comment.id)"
                        :disabled="submitting || !editCommentText.trim()"
                        class="text-xs bg-primary-600 text-white px-3 py-1 rounded hover:bg-primary-700 disabled:opacity-50 transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                  <p v-else class="mt-1 text-gray-700 dark:text-gray-300">
                    {{ comment.comment }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Add Comment Form -->
          <div class="mt-6 border-t border-gray-200 dark:border-gray-600 pt-4">
            <form @submit.prevent="submitComment">
              <div>
                <label for="comment" class="sr-only">Add a comment</label>
                <textarea
                  id="comment"
                  v-model="newComment"
                  rows="3"
                  class="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 px-3 py-2"
                  placeholder="Add a comment..."
                  required
                  @keydown="handleCommentKeydown"
                ></textarea>
              </div>
              <div class="mt-3 flex justify-end">
                <button
                  type="submit"
                  :disabled="submitting || !newComment.trim()"
                  class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span v-if="submitting">Posting...</span>
                  <span v-else>Post Comment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, computed, nextTick } from 'vue'
import { ChatBubbleLeftIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'
import { useNotification } from '@/composables/useNotification'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  tradeId: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close', 'comment-added', 'comment-deleted'])

const { showError, showSuccess } = useNotification()
const authStore = useAuthStore()

const comments = ref([])
const newComment = ref('')
const loading = ref(false)
const submitting = ref(false)
const editingCommentId = ref(null)
const editCommentText = ref('')

const currentUserId = computed(() => authStore.user?.id)

function closeDialog() {
  emit('close')
}

async function loadComments() {
  if (!props.tradeId) return
  
  loading.value = true
  try {
    const response = await api.get(`/trades/${props.tradeId}/comments`)
    comments.value = response.data.comments || []
  } catch (error) {
    showError('Error', 'Failed to load comments')
  } finally {
    loading.value = false
  }
}

async function submitComment() {
  if (!newComment.value.trim()) return
  
  submitting.value = true
  try {
    const response = await api.post(`/trades/${props.tradeId}/comments`, {
      comment: newComment.value.trim()
    })
    
    comments.value.push(response.data.comment)
    newComment.value = ''
    showSuccess('Success', 'Comment added successfully')
    emit('comment-added')
  } catch (error) {
    showError('Error', 'Failed to add comment')
  } finally {
    submitting.value = false
  }
}

function startEditComment(comment) {
  editingCommentId.value = comment.id
  editCommentText.value = comment.comment
}

function cancelEdit() {
  editingCommentId.value = null
  editCommentText.value = ''
}

async function saveEditComment(commentId) {
  if (!editCommentText.value.trim()) return
  
  submitting.value = true
  try {
    const response = await api.put(`/trades/${props.tradeId}/comments/${commentId}`, {
      comment: editCommentText.value.trim()
    })
    
    // Update the comment in the list
    const index = comments.value.findIndex(c => c.id === commentId)
    if (index !== -1) {
      comments.value[index] = response.data.comment
    }
    
    editingCommentId.value = null
    editCommentText.value = ''
    showSuccess('Success', 'Comment updated successfully')
  } catch (error) {
    showError('Error', 'Failed to update comment')
  } finally {
    submitting.value = false
  }
}

async function deleteComment(commentId) {
  if (!confirm('Are you sure you want to delete this comment?')) return
  
  try {
    await api.delete(`/trades/${props.tradeId}/comments/${commentId}`)
    
    // Remove the comment from the list
    comments.value = comments.value.filter(c => c.id !== commentId)
    
    showSuccess('Success', 'Comment deleted successfully')
    emit('comment-deleted') // To update the comment count
  } catch (error) {
    showError('Error', 'Failed to delete comment')
  }
}

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function handleCommentKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submitComment()
  }
}

function handleEditKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    const commentId = editingCommentId.value
    if (commentId) {
      saveEditComment(commentId)
    }
  }
}

// Load comments when dialog opens or trade ID changes
watch([() => props.isOpen, () => props.tradeId], ([isOpen, tradeId]) => {
  if (isOpen && tradeId) {
    loadComments()
  }
}, { immediate: true })

// Handle escape key
function handleEscape(event) {
  if (event.key === 'Escape' && props.isOpen) {
    closeDialog()
  }
}

// Add escape key listener
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', handleEscape)
}
</script>