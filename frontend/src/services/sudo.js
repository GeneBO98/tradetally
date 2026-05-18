import api from '@/services/api'

function secondsFromExpiresIn(expiresIn = '5m') {
  const value = String(expiresIn || '5m').trim()
  const match = value.match(/^(\d+)([smhd])?$/i)
  if (!match) return 300

  const amount = Number(match[1])
  const unit = (match[2] || 's').toLowerCase()
  if (unit === 'm') return amount * 60
  if (unit === 'h') return amount * 60 * 60
  if (unit === 'd') return amount * 24 * 60 * 60
  return amount
}

export async function requestSudoToken({ password, twoFactorCode = '' }) {
  const response = await api.post('/auth/sudo', {
    password,
    twoFactorCode
  })
  return {
    sudoToken: response.data.sudoToken,
    expiresAt: Date.now() + (secondsFromExpiresIn(response.data.expiresIn) * 1000)
  }
}

export function sudoHeaders(sudoToken) {
  return {
    headers: {
      'X-Sudo-Token': sudoToken
    }
  }
}
