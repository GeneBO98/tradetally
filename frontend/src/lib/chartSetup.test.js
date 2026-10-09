import { describe, it, expect } from 'vitest'
import { Chart } from './chartSetup'

// chartSetup registers only the Chart.js pieces the app actually renders.
// A missing registration produces a silently blank chart at runtime, so this
// test asserts every chart type, scale, element, and plugin used anywhere in
// the app resolves from the registry. Chart.registry.get*() throws when the
// item is not registered.

const CONTROLLERS_IN_USE = ['line', 'bar', 'scatter', 'doughnut']
const SCALES_IN_USE = ['category', 'linear']
const ELEMENTS_IN_USE = ['point', 'line', 'bar', 'arc']
const PLUGINS_IN_USE = ['tooltip', 'legend', 'filler', 'title']

describe('chartSetup selective registration', () => {
  it.each(CONTROLLERS_IN_USE)('registers the "%s" controller', (type) => {
    expect(() => Chart.registry.getController(type)).not.toThrow()
    expect(Chart.registry.controllers.get(type)).toBeTruthy()
  })

  it.each(SCALES_IN_USE)('registers the "%s" scale', (type) => {
    expect(() => Chart.registry.getScale(type)).not.toThrow()
  })

  it.each(ELEMENTS_IN_USE)('registers the "%s" element', (type) => {
    expect(() => Chart.registry.getElement(type)).not.toThrow()
  })

  it.each(PLUGINS_IN_USE)('registers the "%s" plugin', (id) => {
    expect(() => Chart.registry.getPlugin(id)).not.toThrow()
  })

  it('exposes the same Chart constructor as default and named export', async () => {
    const mod = await import('./chartSetup')
    expect(mod.default).toBe(mod.Chart)
  })
})
