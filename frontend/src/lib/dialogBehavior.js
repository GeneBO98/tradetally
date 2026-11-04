/**
 * One behaviour contract for every dialog, including the hand-rolled ones.
 *
 * BaseModal implements focus trapping, Escape, body scroll lock and focus
 * restore itself. The other dialogs only share the `.modal-overlay` /
 * `.modal-panel` classes, so this module watches the DOM and gives any
 * overlay the same behaviour without per-file changes:
 *
 *  - body scroll is locked while an overlay is open
 *  - focus moves into the panel on open and returns to the opener on close
 *  - Tab cycles inside the panel
 *  - Escape activates the dialog's close control (aria-label="Close…" or a
 *    Close / Cancel / Dismiss button) so the component's own state updates
 */
const OVERLAY = '.modal-overlay, .modal-backdrop'
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const CLOSE_LABEL = /^(close|cancel|dismiss|done)$/i

const open = new Map() // overlay element -> { opener }
let scrollLocks = 0

function panelOf(overlay) {
  if (overlay.matches('.modal-panel')) return overlay
  const inside = overlay.querySelector('.modal-panel')
  if (inside) return inside
  // backdrop + sibling panel pattern
  return overlay.parentElement?.querySelector('.modal-panel') || overlay
}

function isManaged(overlay) {
  return overlay.hasAttribute('data-dialog-managed')
}

function lockScroll() {
  if (scrollLocks++ === 0) document.body.style.overflow = 'hidden'
}
function unlockScroll() {
  if (--scrollLocks <= 0) {
    scrollLocks = 0
    document.body.style.overflow = ''
  }
}

function closeControl(panel) {
  const labelled = panel.querySelector('button[aria-label^="Close"], button[aria-label^="close"]')
  if (labelled) return labelled
  return [...panel.querySelectorAll('button')].find(b => CLOSE_LABEL.test(b.textContent.trim()))
}

function onKeydown(event) {
  const entries = [...open.keys()].filter(el => el.isConnected)
  if (!entries.length) return
  const overlay = entries[entries.length - 1]
  const panel = panelOf(overlay)
  if (event.key === 'Escape') {
    const ctl = closeControl(panel)
    if (ctl) {
      event.stopPropagation()
      ctl.click()
    }
    return
  }
  if (event.key === 'Tab') {
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement)
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    } else if (!panel.contains(document.activeElement)) {
      event.preventDefault()
      first.focus()
    }
  }
}

function register(overlay) {
  if (open.has(overlay) || isManaged(overlay)) return
  const opener = document.activeElement
  open.set(overlay, { opener })
  lockScroll()
  const panel = panelOf(overlay)
  const focusIn = () => {
    if (!overlay.isConnected || !open.has(overlay)) return
    if (panel.contains(document.activeElement)) return
    const target = panel.querySelector(FOCUSABLE) || panel
    if (target === panel && !panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  }
  // Focus now when the panel already has content, and again after a frame
  // for components that render their controls asynchronously.
  focusIn()
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusIn)
}

function unregister(overlay) {
  const entry = open.get(overlay)
  if (!entry) return
  open.delete(overlay)
  unlockScroll()
  const { opener } = entry
  if (opener && opener.isConnected && typeof opener.focus === 'function') {
    opener.focus({ preventScroll: true })
  }
}

export function installDialogBehavior(root = document.body) {
  if (typeof MutationObserver === 'undefined' || !root) return () => {}
  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue
        if (node.matches(OVERLAY)) register(node)
        node.querySelectorAll?.(OVERLAY).forEach(register)
      }
      for (const node of m.removedNodes) {
        if (node.nodeType !== 1) continue
        if (node.matches(OVERLAY)) unregister(node)
        node.querySelectorAll?.(OVERLAY).forEach(unregister)
      }
    }
    // Overlays toggled with v-show stay in the DOM; drop any that are hidden.
    for (const el of [...open.keys()]) {
      if (!el.isConnected || getComputedStyle(el).display === 'none') unregister(el)
    }
  })
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
  root.querySelectorAll(OVERLAY).forEach(register)
  document.addEventListener('keydown', onKeydown, true)
  return () => {
    observer.disconnect()
    document.removeEventListener('keydown', onKeydown, true)
  }
}
