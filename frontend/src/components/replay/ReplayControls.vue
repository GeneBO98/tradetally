<template>
  <div class="flex flex-wrap items-center gap-3">
    <button
      @click="$emit('toggle')"
      class="btn-primary flex items-center"
      :title="playing ? 'Pause (Space)' : 'Play (Space)'"
    >
      <svg v-if="!playing" class="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
        <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.34-5.89a1.5 1.5 0 000-2.54L6.3 2.84z" />
      </svg>
      <svg v-else class="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
        <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
      </svg>
      {{ playing ? 'Pause' : (atEnd ? 'Replay' : 'Play') }}
    </button>

    <div class="flex items-center space-x-1">
      <button
        @click="$emit('step-back')"
        class="btn-secondary btn-sm"
        title="Step back (Left arrow)"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        @click="$emit('step-forward')"
        class="btn-secondary btn-sm"
        title="Step forward (Right arrow)"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <div class="flex items-center space-x-1">
      <button
        v-for="option in speedOptions"
        :key="option"
        @click="$emit('set-speed', option)"
        class="segment"
        :class="speed === option ? 'segment-active' : ''"
      >
        {{ option }}x
      </button>
    </div>

    <input
      type="range"
      class="flex-1 min-w-[160px] accent-primary-600"
      :min="0"
      :max="Math.max(0, barCount - 1)"
      :value="cursor"
      @input="$emit('seek', Number($event.target.value))"
    />

    <div class="flex items-center space-x-2">
      <button @click="$emit('jump-to-entry')" class="btn-secondary btn-sm">
        Entry
      </button>
      <button @click="$emit('jump-to-exit')" class="btn-secondary btn-sm">
        Exit
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  playing: { type: Boolean, required: true },
  atEnd: { type: Boolean, default: false },
  speed: { type: Number, required: true },
  speedOptions: { type: Array, required: true },
  cursor: { type: Number, required: true },
  barCount: { type: Number, required: true }
})

defineEmits(['toggle', 'step-back', 'step-forward', 'set-speed', 'seek', 'jump-to-entry', 'jump-to-exit'])
</script>
