import React, { useEffect, useRef, useState } from 'react'
import AppIcon from './AppIcon'

const spaces = [
  { src: '/clinic/maternal-reception.jpg', title: 'A familiar welcome', label: 'Reception', description: 'A first look at the clinic reception and information area.', alt: 'TMC Copino reception and information area' },
  { src: '/clinic/maternal-consultation-room.jpg', title: 'Room for your questions', label: 'Consultation', description: 'Get familiar with the space for your clinic conversations and visits.', alt: 'Clinic consultation room with an examination bed and care equipment' },
  { src: '/clinic/maternal-birthing-room.jpg', title: 'A look inside the birthing room', label: 'Birthing room', description: 'A real view of the birthing room and newborn bassinet.', alt: 'TMC Copino birthing room with a delivery bed and newborn bassinet' },
  { src: '/clinic/maternal-recovery-room.jpg', title: 'A place to rest', label: 'Recovery', description: 'A closer look at the clinic recovery room and patient beds.', alt: 'Clinic recovery room with two patient beds' },
]
const rotationDelay = 7000

export default function ClinicSlideshow() {
  const root = useRef(null)
  const pointerPlayback = useRef(false)
  const [selected, setSelected] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [inView, setInView] = useState(false)
  const [pageVisible, setPageVisible] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(true)
  const [loaded, setLoaded] = useState([])
  const [failed, setFailed] = useState([])

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => {
      setReducedMotion(preference.matches)
      if (preference.matches) setPlaying(false)
    }
    const updateVisibility = () => setPageVisible(!document.hidden)
    updateMotion()
    updateVisibility()
    preference.addEventListener('change', updateMotion)
    document.addEventListener('visibilitychange', updateVisibility)
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.25), { threshold: 0.25 }) : null
    if (root.current) observer?.observe(root.current)
    return () => {
      preference.removeEventListener('change', updateMotion)
      document.removeEventListener('visibilitychange', updateVisibility)
      observer?.disconnect()
    }
  }, [])

  const available = spaces.map((_, index) => index).filter((index) => !failed.includes(index))
  const nextSlide = (direction) => {
    for (let step = 1; step <= spaces.length; step += 1) {
      const index = (selected + step * direction + spaces.length) % spaces.length
      if (!failed.includes(index)) return index
    }
    return selected
  }
  const next = nextSlide(1)
  const running = playing && !reducedMotion && !hovered && inView && pageVisible && loaded.includes(selected) && loaded.includes(next) && available.length > 1

  useEffect(() => {
    if (!running) return
    const timer = window.setTimeout(() => setSelected(next), rotationDelay)
    return () => window.clearTimeout(timer)
  }, [running, next, selected])

  const select = (index) => { setSelected(index); setPlaying(false) }
  const markLoaded = (index) => setLoaded((current) => current.includes(index) ? current : [...current, index])
  const markFailed = (index) => setFailed((current) => current.includes(index) ? current : [...current, index])
  const active = spaces[selected]
  const automatic = playing && !reducedMotion
  // Pointer intent must survive the focus event that pauses automatic rotation.
  const togglePlayback = (event) => {
    if (event.detail > 0) setPlaying(!pointerPlayback.current)
    else setPlaying((current) => !current)
  }

  return <section ref={root} className="clinic-slideshow" aria-label="Inside TMC Copino photo tour" aria-roledescription="carousel"
    data-running={running} data-slide={selected + 1}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPlaying(false) }}
    onKeyDown={(event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); select(nextSlide(1)) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); select(nextSlide(-1)) }
    }}>
    <div className="clinic-tour-heading"><span>THE CLINIC, UP CLOSE</span><span className="clinic-tour-number">{String(selected + 1).padStart(2, '0')}<span aria-hidden="true"> / </span><span className="clinic-visually-hidden"> of </span>{String(spaces.length).padStart(2, '0')}</span></div>
    <div className="clinic-tour-stage">
      <button className="clinic-tour-play" type="button" disabled={reducedMotion} aria-label={reducedMotion ? 'Automatic slideshow off for reduced motion' : automatic ? 'Pause clinic slideshow' : 'Play clinic slideshow'}
        onPointerDown={() => { pointerPlayback.current = playing }}
        onClick={togglePlayback}>
        <AppIcon name={automatic ? 'pause' : 'play'} /><span>{reducedMotion ? 'Manual viewing' : automatic ? 'Pause tour' : 'Play tour'}</span>
      </button>
      <div id="clinic-tour-slides" className="clinic-tour-slides" aria-live={automatic ? 'off' : 'polite'} aria-atomic="true">
        {spaces.map((space, index) => <figure key={space.src} className="clinic-tour-slide" data-active={selected === index} aria-hidden={selected !== index} role="group" aria-roledescription="slide" aria-label={String(index + 1) + ' of ' + spaces.length}>
          <img src={space.src} alt={space.alt} loading="lazy" decoding="async" width="2048" height="2048" onLoad={() => markLoaded(index)} onError={() => markFailed(index)} />
          {failed.includes(index) ? <div className="clinic-tour-unavailable"><AppIcon name="records" /><p>This clinic photograph is unavailable.</p><span>Use the controls to explore another space.</span></div> : null}
          <figcaption><span className="clinic-tour-caption-label">Inside TMC Copino <span aria-hidden="true">&bull;</span> {space.label}</span><strong>{space.title}</strong><p>{space.description}</p></figcaption>
        </figure>)}
      </div>
      <div className="clinic-tour-arrows"><button type="button" aria-label="Previous clinic photo" aria-controls="clinic-tour-slides" disabled={!available.length} onClick={() => select(nextSlide(-1))}><AppIcon name="arrowLeft" /></button><button type="button" aria-label="Next clinic photo" aria-controls="clinic-tour-slides" disabled={!available.length} onClick={() => select(nextSlide(1))}><AppIcon name="arrowRight" /></button></div>
    </div>
    <div className="clinic-tour-index" role="group" aria-label="Explore clinic spaces">
      {spaces.map((space, index) => <button key={space.src} type="button" aria-label={`Show ${space.title.toLowerCase()}`} aria-pressed={selected === index} disabled={failed.includes(index)} onClick={() => select(index)}>
        <span className="clinic-tour-thumbnail"><img src={space.src} alt="" loading="lazy" width="120" height="90" /><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></span><span className="clinic-tour-thumbnail-label">{space.label}</span>
      </button>)}
    </div>
    <div className="clinic-tour-footer"><span className="clinic-tour-dots" aria-hidden="true">{spaces.map((space, index) => <span key={space.src} data-active={selected === index} />)}</span><span>{automatic ? 'A new perspective, every 7 seconds.' : 'Explore the clinic at your own pace.'}</span></div>
    <span className="clinic-visually-hidden">{active.label} photograph. Use previous, next, or the numbered thumbnails to change the view.</span>
  </section>
}
