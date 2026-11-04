import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { installDialogBehavior } from './dialogBehavior'

// MutationObserver callbacks run as microtasks; give slower CI runners a
// generous margin beyond that.
function flush() { return new Promise(r => setTimeout(r, 80)) }

describe('dialogBehavior', () => {
  let stop
  beforeEach(() => { document.body.innerHTML = '<button id="opener">open</button>'; stop = installDialogBehavior(document.body) })
  afterEach(() => { stop(); document.body.innerHTML = ''; document.body.style.overflow = '' })

  it('locks scroll, moves focus in, and closes on Escape via the close control', async () => {
    document.getElementById('opener').focus()
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = '<div class="modal-panel"><h3>Title</h3><input id="first"><button id="cancel">Cancel</button></div>'
    document.body.appendChild(overlay)
    await flush()
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement.id).toBe('first')
    let closed = false
    document.getElementById('cancel').addEventListener('click', () => { closed = true; overlay.remove() })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(closed).toBe(true)
    await flush()
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement.id).toBe('opener')
  })

  it('leaves BaseModal-managed overlays alone', async () => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.setAttribute('data-dialog-managed', '')
    overlay.innerHTML = '<div class="modal-panel"><button>Cancel</button></div>'
    document.body.appendChild(overlay)
    await flush()
    expect(document.body.style.overflow).toBe('')
  })
})
