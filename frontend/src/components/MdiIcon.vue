<template>
  <svg 
    :width="size" 
    :height="size" 
    viewBox="0 0 24 24"
    :class="classes"
  >
    <path :d="iconPath" />
  </svg>
</template>

<script>
export default {
  name: 'MdiIcon',
  props: {
    icon: {
      type: String,
      required: true
    },
    size: {
      type: [String, Number],
      default: 24
    },
    color: {
      type: String,
      default: 'currentColor'
    },
    classes: {
      type: String,
      default: ''
    }
  },
  computed: {
    iconPath() {
      return this.icon
    }
  }
}
</script>

<style scoped>
svg {
  fill: currentColor;
  display: inline-block;
  vertical-align: middle;
}
</style>