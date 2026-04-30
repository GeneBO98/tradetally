import { describe, expect, it, vi } from 'vitest'

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn()
  }
}))

vi.mock('@/services/api', () => ({
  default: api
}))

async function loadComposable() {
  vi.resetModules()
  return import('./useGlobalAccountFilter')
}

describe('useGlobalAccountFilter', () => {
  it('initializes from localStorage and persists account changes', async () => {
    localStorage.setItem('tradetally_global_account', ' 12345678 ')
    const { useGlobalAccountFilter } = await loadComposable()
    const filter = useGlobalAccountFilter()

    expect(filter.selectedAccount.value).toBe('12345678')
    expect(filter.selectedAccountLabel.value).toBe('****5678')

    filter.setAccount(' Schwab ')
    expect(filter.selectedAccount.value).toBe('Schwab')
    expect(localStorage.getItem('tradetally_global_account')).toBe('Schwab')

    filter.clearAccount()
    expect(filter.selectedAccount.value).toBe(null)
    expect(localStorage.getItem('tradetally_global_account')).toBe(null)
  })

  it('merges trade accounts and managed accounts into sorted selector options', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/trades/accounts') {
        return Promise.resolve({ data: { accounts: ['Z-9999', 'A-1111'] } })
      }
      if (url === '/accounts') {
        return Promise.resolve({
          data: {
            data: [
              { accountIdentifier: 'A-1111', accountName: 'Primary Account', isPrimary: true },
              { accountIdentifier: 'B-2222', accountName: 'Swing Account', isPrimary: false }
            ]
          }
        })
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })

    const { useGlobalAccountFilter } = await loadComposable()
    const filter = useGlobalAccountFilter()
    await filter.fetchAccounts()

    expect(filter.accounts.value).toEqual([
      { value: 'A-1111', label: 'Primary Account', secondaryLabel: '****1111', isPrimary: true },
      { value: 'B-2222', label: 'Swing Account', secondaryLabel: '****2222', isPrimary: false },
      { value: 'Z-9999', label: '****9999', secondaryLabel: null, isPrimary: false }
    ])
  })

  it('clears a stored account that no longer exists', async () => {
    localStorage.setItem('tradetally_global_account', 'OLD-1234')
    api.get.mockResolvedValue({ data: { accounts: [] } })

    const { useGlobalAccountFilter } = await loadComposable()
    const filter = useGlobalAccountFilter()
    await filter.fetchAccounts()

    expect(filter.selectedAccount.value).toBe(null)
    expect(localStorage.getItem('tradetally_global_account')).toBe(null)
  })
})
