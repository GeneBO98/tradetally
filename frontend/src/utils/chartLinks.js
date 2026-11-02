export function isYouTubeLink(link) {
  try {
    const url = new URL(link)
    return ['http:', 'https:'].includes(url.protocol) &&
      /(^|\.)youtube\.com$|^youtu\.be$/i.test(url.hostname)
  } catch {
    return false
  }
}
