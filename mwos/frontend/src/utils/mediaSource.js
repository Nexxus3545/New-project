export const CLINIC_FACEBOOK_PAGE = 'https://www.facebook.com/people/TMC-Copino-Birthing-Home/61575314979762/'

export const getMediaSource = (value) => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    const host = url.hostname.toLowerCase()
    if (['www.facebook.com', 'facebook.com', 'web.facebook.com', 'm.facebook.com'].includes(host)) {
      url.hostname = 'www.facebook.com'
      if (/\/videos\/\d+/.test(url.pathname) || (url.pathname === '/watch/' && /^\d+$/.test(url.searchParams.get('v') || ''))) {
        const embed = new URL('https://www.facebook.com/plugins/video.php')
        embed.searchParams.set('href', url.toString())
        embed.searchParams.set('show_text', 'false')
        return { kind: 'embed', provider: 'Facebook', url: url.toString(), embedUrl: embed.toString() }
      }
      return { kind: 'link', provider: 'Facebook', url: url.toString() }
    }
    if (['youtube.com', 'www.youtube.com', 'youtu.be'].includes(host)) {
      const id = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v')
      if (/^[A-Za-z0-9_-]{11}$/.test(id || '')) return {
        kind: 'embed', provider: 'YouTube', url: url.toString(), embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      }
      return { kind: 'link', provider: 'YouTube', url: url.toString() }
    }
    return { kind: /\.(mp4|webm|ogv|ogg)$/i.test(url.pathname) || url.pathname.startsWith('/uploads/videos/') ? 'video' : 'link', url: url.toString() }
  } catch {
    return null
  }
}
