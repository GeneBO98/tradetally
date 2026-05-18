import { expect, test as setup } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.join(__dirname, '.auth/user.json')
const fixtureFile = path.join(__dirname, '.auth/trade-management-fixture.json')

setup('authenticated storage state', async ({ page, request }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true })

  const fixtureResponse = await request.post('http://127.0.0.1:3001/api/test-support/e2e/trade-management-fixture')
  expect(fixtureResponse.ok()).toBeTruthy()
  const fixture = await fixtureResponse.json()
  fs.writeFileSync(fixtureFile, JSON.stringify(fixture, null, 2))

  await page.context().addCookies([{
    name: 'token',
    value: fixture.token,
    domain: '127.0.0.1',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
  }])

  await page.goto('/')
  await page.evaluate(token => {
    window.localStorage.setItem('token', token)
  }, fixture.token)
  await page.context().storageState({ path: authFile })
})
