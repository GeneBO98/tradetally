// Guards the What's-new tour registry. It validates the tours that exist; it
// cannot detect a feature that shipped without one, so adding a tour is still
// part of shipping a user-facing feature (see the header of featureTours.js).
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { FEATURE_TOURS, stepsForUser, isTourLive } from './featureTours'

const SRC = join(__dirname, '..')
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(vue|js)$/.test(name) && !/\.test\.js$/.test(name)) out.push(full)
  }
  return out
}
const sourceText = walk(SRC).map(f => readFileSync(f, 'utf8')).join('\n')
const DATE = /^\d{4}-\d{2}-\d{2}$/
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/

describe('feature tour registry', () => {
  it('has unique ids that the API accepts', () => {
    const ids = FEATURE_TOURS.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(ID)
  })

  it('gives every tour a release date, title, summary and at least one step', () => {
    for (const tour of FEATURE_TOURS) {
      expect(tour.releasedAt, tour.id).toMatch(DATE)
      if (tour.showUntil) {
        expect(tour.showUntil, tour.id).toMatch(DATE)
        expect(tour.showUntil > tour.releasedAt, tour.id).toBe(true)
      }
      expect(tour.title, tour.id).toBeTruthy()
      expect(tour.summary, tour.id).toBeTruthy()
      expect(tour.steps.length, tour.id).toBeGreaterThan(0)
    }
  })

  it('gives every step a title, body, a page to open and a real target', () => {
    for (const tour of FEATURE_TOURS) {
      const stepIds = tour.steps.map(s => s.id)
      expect(new Set(stepIds).size, tour.id).toBe(stepIds.length)
      for (const step of tour.steps) {
        const label = `${tour.id}/${step.id}`
        expect(step.title, label).toBeTruthy()
        expect(step.body, label).toBeTruthy()
        expect(Boolean(step.route) || typeof step.resolveRoute === 'function', label).toBe(true)
        expect(['all', 'pro', 'free', undefined]).toContain(step.audience)
        if (step.target) {
          expect(step.target, label).toMatch(ID)
          expect(sourceText.includes(`data-tour="${step.target}"`), `${label}: no element has data-tour="${step.target}"`).toBe(true)
        }
      }
    }
  })

  it('filters steps by audience', () => {
    const tour = { steps: [{ id: 'a' }, { id: 'b', audience: 'pro' }, { id: 'c', audience: 'free' }] }
    expect(stepsForUser(tour, { isPro: true }).map(s => s.id)).toEqual(['a', 'b'])
    expect(stepsForUser(tour, { isPro: false }).map(s => s.id)).toEqual(['a', 'c'])
  })

  it('keeps tours live from release until an optional end date', () => {
    expect(isTourLive({ releasedAt: '2026-11-25' }, '2026-11-24')).toBe(false)
    expect(isTourLive({ releasedAt: '2026-11-25' }, '2030-01-01')).toBe(true)
    expect(isTourLive({ releasedAt: '2026-11-25', showUntil: '2026-12-31' }, '2027-01-01')).toBe(false)
  })
})
