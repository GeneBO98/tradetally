export function validConfirmationInterval(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 15 && value <= 1440 && value % 15 === 0
}

export function formatConfirmationInterval(value = 15) {
  const minutes = validConfirmationInterval(value) ? value : 15
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`
  return `${minutes} minutes`
}
