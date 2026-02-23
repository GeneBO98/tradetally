import { onMounted, onUnmounted } from 'vue'

/**
 * Scroll-triggered reveal animations and subtle parallax.
 *
 * Reveal: Elements with `data-reveal` fade/slide up when entering the viewport
 * and reverse when leaving. Supports staggered delays:
 *   <section data-reveal>...</section>
 *   <section data-reveal="delay-1">...</section>
 *   <section data-reveal="delay-2">...</section>
 *
 * Parallax: Elements with `data-parallax` shift vertically at a slower rate
 * than the scroll, creating subtle depth. Use on images/screenshots.
 *   <img data-parallax />              (default speed: -0.08)
 *   <img data-parallax="-0.12" />      (custom speed, negative = slower)
 */
export function useScrollReveal() {
  let observer = null
  let rafId = null
  let parallaxElements = []

  function onScroll() {
    rafId = requestAnimationFrame(() => {
      const scrollY = window.scrollY

      for (let i = 0; i < parallaxElements.length; i++) {
        const { el, speed } = parallaxElements[i]
        const rect = el.getBoundingClientRect()
        const windowH = window.innerHeight

        // Only apply parallax when element is in or near viewport
        if (rect.bottom < -200 || rect.top > windowH + 200) continue

        // Calculate offset relative to the element's center being at viewport center
        const centerOffset = rect.top + rect.height / 2 - windowH / 2
        const translate = centerOffset * speed

        el.style.transform = `translateY(${translate}px)`
      }
    })
  }

  onMounted(() => {
    // Set up reveal observer (toggles both directions)
    const revealEls = document.querySelectorAll('[data-reveal]')
    if (revealEls.length) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed')
          } else {
            entry.target.classList.remove('revealed')
          }
        })
      }, {
        threshold: 0.08,
        rootMargin: '0px 0px -40px 0px'
      })

      revealEls.forEach((el) => {
        el.classList.add('reveal-hidden')
        // Immediately reveal elements already in viewport
        const rect = el.getBoundingClientRect()
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          el.classList.add('revealed')
        }
        observer.observe(el)
      })
    }

    // Set up parallax
    const pEls = document.querySelectorAll('[data-parallax]')
    if (pEls.length) {
      parallaxElements = Array.from(pEls).map((el) => ({
        el,
        speed: parseFloat(el.getAttribute('data-parallax')) || -0.08
      }))
      // Use will-change for GPU acceleration
      parallaxElements.forEach(({ el }) => {
        el.style.willChange = 'transform'
      })
      window.addEventListener('scroll', onScroll, { passive: true })
      onScroll() // initial position
    }
  })

  onUnmounted(() => {
    if (observer) {
      observer.disconnect()
    }
    if (parallaxElements.length) {
      window.removeEventListener('scroll', onScroll)
      if (rafId) cancelAnimationFrame(rafId)
      // Clean up styles
      parallaxElements.forEach(({ el }) => {
        el.style.transform = ''
        el.style.willChange = ''
      })
      parallaxElements = []
    }
  })
}
