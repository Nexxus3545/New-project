import { useEffect } from 'react'

// Animate individual reading blocks, never the navigation or an entire long
// section. Native view timelines follow the scroll in both directions.
const blocks = [
  '.clinic-hero-copy', '.clinic-hero-visual', '.clinic-promises > p',
  '.clinic-section-top', '.clinic-service', '.clinic-slideshow', '.clinic-spaces-copy',
  '.clinic-contact-section > .clinic-section-heading', '.clinic-hours-card', '.clinic-contact-details',
  '.clinic-visit-header', '.clinic-visit-steps > li', '.clinic-team-intro', '.clinic-team-roles > article',
  '#feedback > .clinic-section-heading', '#feedback > .clinic-feedback-state',
  '#feedback > .clinic-review-grid > .clinic-review', '#feedback > .clinic-quiet-link',
  '.clinic-faq-section > .clinic-section-heading', '.clinic-faq-list > details',
  '.clinic-download-section > div', '.clinic-footer > div', '.clinic-footer-safety',
].join(',')

export default function useLandingScrollMotion(rootRef) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof window.matchMedia !== 'function') return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const targets = new Set()
    let intersection, mutations

    const clear = () => {
      intersection?.disconnect(); mutations?.disconnect()
      intersection = null; mutations = null
      delete root.dataset.scrollMotion
      for (const node of targets) {
        delete node.dataset.scrollReveal; delete node.dataset.revealState
      }
      targets.clear()
    }
    const start = () => {
      clear()
      if (preference.matches) return
      const native = window.CSS?.supports?.('animation-timeline: view()')
        && window.CSS.supports('animation-range: entry 0% exit 100%')
      if (!native && typeof window.IntersectionObserver !== 'function') return
      if (!native) {
        intersection = new window.IntersectionObserver((entries) => {
          for (const entry of entries) entry.target.dataset.revealState = entry.isIntersecting
            ? 'visible' : entry.boundingClientRect.top < 0 ? 'above' : 'below'
        }, { rootMargin: '-6% 0px -8% 0px', threshold: 0 })
      }
      const collect = () => {
        for (const node of targets) if (!root.contains(node)) {
          intersection?.unobserve(node); targets.delete(node)
        }
        for (const node of root.querySelectorAll(blocks)) {
          if (targets.has(node)) continue
          targets.add(node)
          if (!native) {
            const bounds = node.getBoundingClientRect()
            node.dataset.revealState = bounds.bottom > 0 && bounds.top < window.innerHeight - 24
              ? 'visible' : bounds.top < 0 ? 'above' : 'below'
          }
          node.dataset.scrollReveal = ''
          intersection?.observe(node)
        }
      }
      root.dataset.scrollMotion = native ? 'native' : 'fallback'
      collect()
      // Reviews arrive after the first render; new blocks get the same motion.
      if (typeof window.MutationObserver === 'function') {
        mutations = new window.MutationObserver(collect)
        mutations.observe(root, { childList: true, subtree: true })
      }
    }
    start()
    preference.addEventListener('change', start)
    return () => { preference.removeEventListener('change', start); clear() }
  }, [rootRef])
}
