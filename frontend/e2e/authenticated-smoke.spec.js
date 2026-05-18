import { expect, test } from '@playwright/test'

const smokeRoutes = [
  { path: '/dashboard', label: 'dashboard' },
  { path: '/trades', label: 'trades' },
  { path: '/import', label: 'import' }
]

for (const route of smokeRoutes) {
  test(`authenticated smoke renders ${route.label}`, async ({ page }) => {
    await page.goto(route.path)
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator('#app')).toBeVisible()
    await expect(page.getByText('Sign in to your account')).toHaveCount(0)
  })
}
