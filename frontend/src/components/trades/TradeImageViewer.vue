<template>
  <Teleport to="body">
    <div
      ref="dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="title_id"
      class="fixed inset-0 z-[100] flex flex-col bg-black/90 text-white"
      @keydown="handle_keydown"
    >
      <div class="flex shrink-0 items-center gap-3 border-b border-white/20 bg-gray-900 px-4 py-3">
        <h2 :id="title_id" class="heading-sub min-w-0 flex-1 truncate" :title="image.file_name">
          {{ image.file_name || 'Trade image' }}
        </h2>
        <button
          type="button"
          :disabled="!image_url || image_failed"
          :aria-pressed="actual_size"
          class="btn-ghost btn-sm disabled:opacity-50"
          @click="actual_size = !actual_size"
        >
          {{ actual_size ? 'Fit to screen' : 'Actual size' }}
        </button>
        <button
          ref="close_button"
          type="button"
          class="btn-ghost btn-sm"
          aria-label="Close image preview"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
      <div
        class="min-h-0 min-w-0 flex-1 overflow-auto p-2 sm:p-4"
        :class="actual_size ? '' : 'flex items-center justify-center'"
        @click.self="emit('close')"
      >
        <p v-if="image_failed" role="alert" class="m-auto text-sm">Failed to load image.</p>
        <div v-else-if="!image_url" role="status" class="m-auto text-sm">Loading image...</div>
        <img
          v-else
          :src="image_url"
          :alt="image.file_name || 'Trade image'"
          :class="actual_size ? 'mx-auto block h-auto w-auto max-w-none' : 'h-full w-full object-contain'"
          @error="load_failed = true"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { useAuthedImage } from '@/composables/useAuthedImage'

const props = defineProps({
  image: { type: Object, required: true },
  src: { type: String, default: '' }
})
const emit = defineEmits(['close'])
const title_id = useId()
const dialog = ref(null)
const close_button = ref(null)
const actual_size = ref(false)
const load_failed = ref(false)
// Detail previews already have a blob URL. Table links load only the image opened.
const authed_image = useAuthedImage(() => props.src ? [] : [props.image])
const image_url = computed(() => props.src || authed_image.urlFor(props.image))
const image_failed = computed(() => load_failed.value || authed_image.hasError(props.image))
let previous_focus
let previous_overflow

function handle_keydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('close')
  } else if (event.key === 'Tab') {
    const buttons = [...dialog.value.querySelectorAll('button:not([disabled])')]
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
}

onMounted(() => {
  previous_focus = document.activeElement
  previous_overflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  close_button.value.focus()
})

onBeforeUnmount(() => {
  document.body.style.overflow = previous_overflow
  previous_focus?.focus?.()
})
</script>
