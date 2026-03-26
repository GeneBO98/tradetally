<template>
  <div class="content-wrapper py-8">
    <div class="max-w-xl mx-auto">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Leave a Review</h1>
      <p class="text-gray-500 dark:text-gray-400 mb-8">
        Your feedback helps other traders discover TradeTally. Even a sentence or two goes a long way.
      </p>

      <!-- Success state -->
      <div v-if="submitted" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
          <CheckCircleIcon class="h-6 w-6 text-green-600 dark:text-green-400" />
        </div>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Thanks for your review!</h2>
        <p class="text-gray-500 dark:text-gray-400">
          Your review has been submitted and will appear on our homepage once approved.
        </p>
        <router-link to="/dashboard" class="inline-block mt-6 text-primary-600 hover:text-primary-700 font-medium">
          Back to Dashboard
        </router-link>
      </div>

      <!-- Form -->
      <form v-else @submit.prevent="submitReview" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        <!-- Star Rating -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Rating</label>
          <div class="flex gap-1">
            <button
              v-for="star in 5"
              :key="star"
              type="button"
              @click="form.rating = star"
              @mouseenter="hoverRating = star"
              @mouseleave="hoverRating = 0"
              class="p-1 focus:outline-none transition-transform hover:scale-110"
            >
              <StarIcon
                class="h-8 w-8 transition-colors"
                :class="(hoverRating || form.rating) >= star
                  ? 'text-yellow-400 fill-yellow-400'
                  : 'text-gray-300 dark:text-gray-600'"
              />
            </button>
          </div>
          <p v-if="errors.rating" class="mt-1 text-sm text-red-600">{{ errors.rating }}</p>
        </div>

        <!-- Review Text -->
        <div>
          <label for="review-body" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Your Review</label>
          <textarea
            id="review-body"
            v-model="form.body"
            rows="4"
            maxlength="2000"
            placeholder="What's been most helpful about TradeTally?"
            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-3 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder-gray-400 dark:placeholder-gray-500"
          ></textarea>
          <div class="flex justify-between mt-1">
            <p v-if="errors.body" class="text-sm text-red-600">{{ errors.body }}</p>
            <span v-else></span>
            <span class="text-xs text-gray-400">{{ form.body.length }}/2000</span>
          </div>
        </div>

        <!-- Display Name -->
        <div>
          <label for="display-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Display Name <span class="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="display-name"
            v-model="form.display_name"
            type="text"
            maxlength="100"
            placeholder="How you'd like to be shown (e.g. first name, initials)"
            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-3 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder-gray-400 dark:placeholder-gray-500"
          />
          <p class="mt-1 text-xs text-gray-400">If left blank, your username will be used.</p>
        </div>

        <!-- Existing review notice -->
        <div v-if="existingReview" class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p class="text-sm text-yellow-700 dark:text-yellow-300">
            You already submitted a review. Submitting again will replace your previous one.
          </p>
        </div>

        <!-- Submit -->
        <div class="flex items-center justify-end gap-3">
          <router-link to="/dashboard" class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
            Cancel
          </router-link>
          <button
            type="submit"
            :disabled="submitting"
            class="px-6 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span v-if="submitting">Submitting...</span>
            <span v-else>Submit Review</span>
          </button>
        </div>

        <p v-if="errors.submit" class="text-sm text-red-600 text-center">{{ errors.submit }}</p>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { StarIcon, CheckCircleIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const form = reactive({
  rating: 0,
  body: '',
  display_name: ''
})

const hoverRating = ref(0)
const submitting = ref(false)
const submitted = ref(false)
const existingReview = ref(null)
const errors = reactive({
  rating: '',
  body: '',
  submit: ''
})

onMounted(async () => {
  try {
    const { data } = await api.get('/testimonials/mine')
    if (data) {
      existingReview.value = data
      form.rating = data.rating
      form.body = data.body
      form.display_name = data.display_name || ''
    }
  } catch {
    // No existing review, that's fine
  }
})

function validate() {
  errors.rating = ''
  errors.body = ''
  errors.submit = ''

  if (!form.rating) {
    errors.rating = 'Please select a rating'
    return false
  }
  if (!form.body.trim()) {
    errors.body = 'Please write a short review'
    return false
  }
  return true
}

async function submitReview() {
  if (!validate()) return

  submitting.value = true
  errors.submit = ''

  try {
    await api.post('/testimonials', {
      rating: form.rating,
      body: form.body.trim(),
      display_name: form.display_name.trim() || null
    })
    submitted.value = true
  } catch (err) {
    errors.submit = err.response?.data?.error || 'Failed to submit review. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>
