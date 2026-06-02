<template>
  <footer class="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div class="flex flex-col items-center justify-center gap-4">
        <div class="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
          <a
            href="https://tradetally.io/docs"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <svg class="w-4 h-4 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span class="hidden sm:inline">Documentation</span>
            <span class="sm:hidden">Docs</span>
          </a>
          <span>&bull;</span>
          <button
            @click="$emit('show-support')"
            class="inline-flex items-center hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
          >
            <svg class="w-4 h-4 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span class="hidden sm:inline">Contact Support</span>
            <span class="sm:hidden">Support</span>
          </button>
          <span>&bull;</span>
          <a
            href="https://tradetally.io/forum"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <svg class="w-4 h-4 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
            <span class="hidden sm:inline">Community Forum</span>
            <span class="sm:hidden">Forum</span>
          </a>
          <span>&bull;</span>
          <a
            href="https://tradetally.io/blog"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <svg class="w-4 h-4 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
            <span class="hidden sm:inline">Blog &amp; Newsletter</span>
            <span class="sm:hidden">Blog</span>
          </a>
          <span>&bull;</span>
          <a
            href="https://x.com/TradeTallyIO"
            target="_blank"
            rel="me noopener noreferrer"
            class="inline-flex items-center hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            aria-label="Follow TradeTally on X"
          >
            <svg class="w-4 h-4 sm:mr-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18.244 2H21.5l-7.11 8.128L22.75 22h-6.544l-5.126-7.13L4.84 22H1.58l7.605-8.693L1.25 2h6.71l4.634 6.457L18.244 2Zm-1.141 18.05h1.804L6.978 3.844H5.043L17.103 20.05Z" />
            </svg>
            <span class="hidden sm:inline">Follow on X</span>
            <span class="sm:hidden">X</span>
          </a>
          <span>&bull;</span>
          <a
            href="https://github.com/GeneBO98/tradetally"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <svg class="w-4 h-4 sm:mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clip-rule="evenodd" />
            </svg>
            <span class="hidden sm:inline">View on GitHub</span>
            <span class="sm:hidden">GitHub</span>
          </a>
          <span>&bull;</span>
          <router-link
            to="/privacy"
            class="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <span class="hidden sm:inline">Privacy Policy</span>
            <span class="sm:hidden">Privacy</span>
          </router-link>
          <span>&bull;</span>
          <VersionDisplay />
        </div>
        <a
          href="https://www.betterlaunch.co"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex justify-center"
        >
          <img
            src="https://www.betterlaunch.co/badge-dark.svg"
            alt="Featured on Better Launch"
            class="h-auto w-[200px]"
          />
        </a>
      </div>
    </div>
  </footer>
</template>

<script setup>
import VersionDisplay from '@/components/common/VersionDisplay.vue'

defineEmits(['show-support'])
</script>
