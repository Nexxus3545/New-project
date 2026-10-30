import { useEffect } from 'react'

// Use layout coordinates, unaffected by the fade's translate animation.
const layoutTop = node => {
  let top = 0
  for (let current = node; current; current = current.offsetParent) top += current.offsetTop
  return top
}

export default function useLandingScrollMotion(rootRef) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof window.matchMedia !== 'function') return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sections = [...root.querySelectorAll('#main-content > section:not(.clinic-public-hero)')]
    const navigation = [...root.querySelectorAll('.clinic-navigation a[href^="#"]')]
    const header = root.querySelector('.clinic-header')
    let frame = 0, active = -1, pinned = null, resized

    const activate = index => {
      if (active === index) return
      active = index
      sections.forEach((section, i) => {
        section.dataset.scrollSection = ''
        section.dataset.sectionState = i === index ? 'active' : i < index ? 'before' : 'after'
      })
      navigation.forEach(link => {
        if (sections[index]?.id && link.hash === `#${sections[index].id}`) link.setAttribute('aria-current', 'location')
        else link.removeAttribute('aria-current')
      })
    }
    const update = () => {
      frame = 0
      if (preference.matches || !sections.length) return
      if (pinned) { activate(sections.indexOf(pinned)); return }
      const viewport = window.innerHeight
      const headerBottom = Math.max(0, header?.getBoundingClientRect().bottom || 0)
      const readingLine = window.scrollY + headerBottom + Math.max(0, viewport - headerBottom) * 0.38
      let index = 0
      sections.forEach((section, i) => { if (layoutTop(section) <= readingLine) index = i })
      if (window.scrollY + viewport >= document.documentElement.scrollHeight - 2) index = sections.length - 1
      activate(index)
    }
    const schedule = () => { if (!frame && !preference.matches) frame = window.requestAnimationFrame(update) }
    const release = () => { pinned = null; schedule() }
    const onKeyDown = event => {
      if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === ' ' && event.target.closest?.('button, summary, a[href]')) return
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) release()
    }
    const onFocus = event => {
      const section = event.target.closest?.('[data-scroll-section]')
      if (section && sections.includes(section) && event.target.matches(':focus-visible')) {
        pinned = section
        // Keyboard users can reveal and use links in any section immediately.
        activate(sections.indexOf(section))
        schedule()
      }
    }
    const onBlur = event => { if (pinned && !pinned.contains(event.relatedTarget)) release() }
    const onAnchor = event => {
      const link = event.target.closest?.('a[href^="#"]')
      const section = link && sections.find(section => section.id && link.hash === `#${section.id}`)
      if (section && !preference.matches) { pinned = section; activate(sections.indexOf(section)) }
    }
    const setPreference = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0; active = -1; pinned = null
      if (preference.matches) {
        delete root.dataset.scrollMotion
        sections.forEach(section => { delete section.dataset.scrollSection; delete section.dataset.sectionState })
        navigation.forEach(link => link.removeAttribute('aria-current'))
      } else {
        update()
        root.dataset.scrollMotion = 'sections'
      }
    }
    setPreference()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    window.addEventListener('wheel', release, { passive: true })
    window.addEventListener('touchstart', release, { passive: true })
    window.addEventListener('pointerdown', release, { passive: true })
    window.addEventListener('keydown', onKeyDown)
    root.addEventListener('focusin', onFocus)
    root.addEventListener('focusout', onBlur)
    root.addEventListener('click', onAnchor)
    root.addEventListener('load', schedule, true)
    preference.addEventListener('change', setPreference)
    if (typeof window.ResizeObserver === 'function') {
      resized = new window.ResizeObserver(schedule)
      sections.forEach(section => resized.observe(section))
      if (header) resized.observe(header)
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      resized?.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('wheel', release)
      window.removeEventListener('touchstart', release)
      window.removeEventListener('pointerdown', release)
      window.removeEventListener('keydown', onKeyDown)
      root.removeEventListener('focusin', onFocus)
      root.removeEventListener('focusout', onBlur)
      root.removeEventListener('click', onAnchor)
      root.removeEventListener('load', schedule, true)
      preference.removeEventListener('change', setPreference)
      delete root.dataset.scrollMotion
      sections.forEach(section => { delete section.dataset.scrollSection; delete section.dataset.sectionState })
      navigation.forEach(link => link.removeAttribute('aria-current'))
    }
  }, [rootRef])
}
