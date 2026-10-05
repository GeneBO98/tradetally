// Synthesized celebration chimes (no audio assets).
//
// Ringer behavior: Web Audio is mixed as "ambient" audio, and on Safari 16.4+
// we set navigator.audioSession.type = 'ambient' explicitly. Ambient audio is
// silenced by the iOS ring/silent switch, so users with the ringer off hear
// nothing. Desktop and Android browsers expose no ringer state; there the
// chimes simply follow system volume / mute.

let ctx = null
let unlockBound = false

const NOTE = {
  C5: 523.25, E5: 659.25, G5: 783.99, A5: 880.0,
  C6: 1046.5, E6: 1318.51, G6: 1567.98, C7: 2093.0
}

function getContext() {
  if (typeof window === 'undefined') return null
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return null
  if (!ctx) {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'ambient'
    } catch {
      // Older Safari exposes audioSession read-only; ambient is already the default
    }
    ctx = new AudioCtx()
  }
  return ctx
}

// Browsers only let audio start after a user gesture. Resume the context on the
// first interaction so celebrations that arrive later (SSE, imports) can play.
export function primeCelebrationAudio() {
  if (unlockBound || typeof window === 'undefined') return
  unlockBound = true
  const unlock = () => {
    const c = getContext()
    if (c && c.state !== 'running') c.resume().catch(() => {})
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

function withRunningContext(fn) {
  if (typeof document !== 'undefined' && document.hidden) return
  const c = getContext()
  if (!c) return
  if (c.state === 'running') {
    fn(c)
    return
  }
  c.resume()
    .then(() => { if (c.state === 'running') fn(c) })
    .catch(() => {})
}

function createOutput(c, volume = 0.5) {
  const master = c.createGain()
  master.gain.value = volume
  const comp = c.createDynamicsCompressor()
  master.connect(comp).connect(c.destination)
  return master
}

// Bell-like note: sine body plus a quieter octave partial that decays faster
function bell(c, out, freq, start, { duration = 0.45, gain = 0.3, type = 'sine' } = {}) {
  const partials = [
    { ratio: 1, g: gain, d: duration, t: type },
    { ratio: 2, g: gain * 0.28, d: duration * 0.55, t: 'sine' },
    { ratio: 3, g: gain * 0.08, d: duration * 0.3, t: 'sine' }
  ]
  for (const p of partials) {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = p.t
    osc.frequency.setValueAtTime(freq * p.ratio, start)
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(p.g, start + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, start + p.d)
    osc.connect(g).connect(out)
    osc.start(start)
    osc.stop(start + p.d + 0.05)
  }
}

// Quick upward-swept blip, like a bubble pop
function blip(c, out, freq, start, gain = 0.16) {
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, start)
  osc.frequency.exponentialRampToValueAtTime(freq * 2, start + 0.07)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(gain, start + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.12)
  osc.connect(g).connect(out)
  osc.start(start)
  osc.stop(start + 0.15)
}

// High random twinkles layered on top of the big moments
function shimmer(c, out, start, count = 8) {
  const pool = [NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C7]
  for (let i = 0; i < count; i++) {
    const f = pool[Math.floor(Math.random() * pool.length)]
    bell(c, out, f, start + i * 0.045 + Math.random() * 0.02, { duration: 0.25, gain: 0.05 })
  }
}

const ACHIEVEMENT_ARPEGGIOS = {
  common:    [NOTE.G5, NOTE.C6],
  uncommon:  [NOTE.G5, NOTE.C6],
  rare:      [NOTE.E5, NOTE.G5, NOTE.C6],
  epic:      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6],
  legendary: [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6]
}

export function playAchievementChime(rarity = 'common') {
  withRunningContext(c => {
    const out = createOutput(c)
    const notes = ACHIEVEMENT_ARPEGGIOS[rarity] || ACHIEVEMENT_ARPEGGIOS.common
    const t0 = c.currentTime + 0.01
    notes.forEach((f, i) => {
      const last = i === notes.length - 1
      bell(c, out, f, t0 + i * 0.085, { duration: last ? 0.7 : 0.3, gain: last ? 0.3 : 0.22 })
    })
    if (rarity === 'epic' || rarity === 'legendary') {
      shimmer(c, out, t0 + notes.length * 0.085, rarity === 'legendary' ? 10 : 6)
    }
  })
}

// Card landing pop; index steps the pitch up so a cascade climbs
export function playPop(index = 0) {
  withRunningContext(c => {
    const out = createOutput(c, 0.4)
    blip(c, out, 520 * Math.pow(2, (index * 2) / 12), c.currentTime + 0.005)
  })
}

export function playLevelUpFanfare() {
  withRunningContext(c => {
    const out = createOutput(c, 0.55)
    const t0 = c.currentTime + 0.01
    ;[NOTE.C5, NOTE.E5, NOTE.G5].forEach((f, i) => {
      bell(c, out, f, t0 + i * 0.1, { duration: 0.3, gain: 0.2, type: 'triangle' })
    })
    // Sustained major chord on the landing beat
    const chordAt = t0 + 0.32
    ;[NOTE.C6, NOTE.E6, NOTE.G6].forEach(f => {
      bell(c, out, f, chordAt, { duration: 1.1, gain: 0.16, type: 'triangle' })
    })
    bell(c, out, NOTE.C5, chordAt, { duration: 1.1, gain: 0.14 })
    shimmer(c, out, chordAt + 0.1, 12)
  })
}
