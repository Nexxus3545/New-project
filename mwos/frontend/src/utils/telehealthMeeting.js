export function safeGoogleMeetUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || !/^https:\/\/meet\.google\.com\//i.test(value.trim())) return ''
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.hostname !== 'meet.google.com' || url.username || url.password || url.port || !/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(url.pathname)) return ''
    return `https://meet.google.com/${url.pathname.split('/')[1]}`
  } catch { return '' }
}

export const canJoinTelehealth = (session) => ['scheduled', 'active'].includes(session?.status) && Boolean(safeGoogleMeetUrl(session?.meeting_url))
