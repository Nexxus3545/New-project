import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { publicApi } from '../utils/api'
import BrandMark from '../components/common/BrandMark'
import AppIcon from '../components/common/AppIcon'
import PlatformLogo from '../components/common/PlatformLogo'
import ClinicSlideshow from '../components/common/ClinicSlideshow'
import ClinicContact from '../components/common/ClinicContact'
import { clinicContact } from '../utils/clinicContact'
import { useAuthStore } from '../store/authStore'
import useLandingScrollMotion from '../hooks/useLandingScrollMotion'
import '../styles/landing.css'

const bookingPath = '/portal?intent=appointment'
const clinicPage = clinicContact.facebook
const services = [
  { icon: 'prenatal', title: 'Prenatal care', text: 'Keep your visits, saved clinic findings, and follow-up plans together as your pregnancy progresses.' },
  { icon: 'delivery', title: 'Birth preparation', text: 'Discuss your birth plan, required documents, and next steps with the clinic care team.' },
  { icon: 'postnatal', title: 'Postnatal follow-up', text: 'Stay connected with your care team after birth, with visits and recovery questions in one place.' },
  { icon: 'baby', title: 'Mother & newborn care', text: 'Bring your questions about feeding, newborn follow-up, and ongoing care to your clinic visit.' },
]
const teamRoles = [
  { icon: 'prenatal', title: 'Midwifery care', text: 'Pregnancy visits, birth preparation, and continuity of maternal care.' },
  { icon: 'health', title: 'Medical consultation', text: 'Discuss findings, individual concerns, and care or referral plans.' },
  { icon: 'patients', title: 'Nursing support', text: 'Visit coordination, recorded observations, and follow-up communication.' },
]
const faqs = [
  ['How do I request an appointment?', 'Choose Book an appointment, sign in or create your patient account, then submit a request in Appointments. Your request is not a confirmed visit until the clinic confirms its schedule.'],
  ['Can I use Google to sign in?', 'Yes. Google sign-in is available for patient accounts when the clinic service is available. Clinic staff use their issued account credentials.'],
  ['What should I bring to my first visit?', 'Check the requirements shown in your patient portal and ask the clinic which records or documents apply to your visit. Do not submit medical details through public reviews.'],
  ['Where can I see the care team?', 'Use View care team to enter the secure portal and browse provider details. Request a preferred visit time in Appointments; the clinic confirms the schedule and who will attend your visit.'],
  ['Do I need to install an app?', 'No. Open Web Version to use MWOS in your browser, or visit the Download Center to install the MWOS web app on your supported device. Internet and sign-in are required for your care workspace.'],
  ['Is this an emergency service?', 'No. This website and its messages are not an emergency response service. For urgent help, contact local emergency services directly or go to the nearest appropriate facility. An online transport request is not a dispatch confirmation.'],
]

function SectionHeading({ eyebrow, title, children, id }) {
  return <div className="clinic-section-heading">
    <p className="clinic-eyebrow">{eyebrow}</p><h2 id={id}>{title}</h2>{children ? <p>{children}</p> : null}
  </div>
}

function PublishedReviews() {
  const sessionKey = useAuthStore((state) => `${state.user?.id || 'guest'}:${state.user?.role || ''}`)
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['public-review-summary', sessionKey],
    queryFn: () => publicApi.get('/reviews/summary').then((response) => response.data.data),
    staleTime: 60000,
  })
  const reviews = Array.isArray(data?.recent) ? data.recent.filter((review) => review.comment?.trim()).slice(0, 3) : []
  if (isPending) return <p className="clinic-feedback-state" role="status">Loading published feedback...</p>
  if (isError) return <div className="clinic-feedback-state"><p>Published feedback is unavailable right now.</p><button type="button" className="clinic-text-button" onClick={() => refetch()}>Try again</button></div>
  if (!reviews.length) return <div className="clinic-feedback-state"><AppIcon name="messages" /><p>No written reviews have been published yet.</p><span>Feedback will appear here when available. We do not invent patient stories or treatment outcomes.</span></div>
  return <div className="clinic-review-grid">{reviews.map((review) => <figure className="clinic-review" key={review.id}>
    <p className="clinic-review-rating">{Math.max(1, Math.min(5, Number(review.rating) || 1))} / 5 <span>Published rating</span></p>
    <blockquote>{review.comment}</blockquote><figcaption>{review.display_name || 'Anonymous reviewer'}<span>Published feedback, not a verified treatment outcome</span></figcaption>
  </figure>)}</div>
}

export default function LandingPage() {
  const page = useRef(null)
  useLandingScrollMotion(page)
  const [menuOpen, setMenuOpen] = useState(false)
  const header = useRef(null)
  const menuButton = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const dismissOutside = (event) => { if (!header.current?.contains(event.target)) setMenuOpen(false) }
    const dismissWithEscape = (event) => {
      if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus() }
    }
    const desktop = window.matchMedia('(min-width: 1101px)')
    const dismissOnDesktop = () => { if (desktop.matches) setMenuOpen(false) }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('keydown', dismissWithEscape)
    desktop.addEventListener('change', dismissOnDesktop)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('keydown', dismissWithEscape)
      desktop.removeEventListener('change', dismissOnDesktop)
    }
  }, [menuOpen])

  return <div ref={page} className="clinic-landing">
    <a className="clinic-skip" href="#main-content">Skip to content</a>
    {menuOpen ? <div className="clinic-menu-shade" aria-hidden="true" /> : null}
    <header ref={header} className="clinic-header" onBlurCapture={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false)
    }}>
      <div className="clinic-header-inner">
        <Link className="clinic-home-link" to="/" aria-label="TMC Copino home"><BrandMark compact sublabel="Birthing home & medical clinic" /></Link>
        <button ref={menuButton} className="clinic-menu-button" type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} aria-controls="clinic-navigation" onClick={() => setMenuOpen((open) => !open)}><AppIcon name={menuOpen ? 'close' : 'menu'} /><span>{menuOpen ? 'Close' : 'Menu'}</span></button>
        <nav id="clinic-navigation" className="clinic-navigation" data-open={menuOpen} aria-label="Clinic navigation">
          <a href="#care" onClick={() => setMenuOpen(false)}>Our care</a><a href="#clinic" onClick={() => setMenuOpen(false)}>The clinic</a><a href="#contact" onClick={() => setMenuOpen(false)}>Hours & contact</a><a href="#your-visit" onClick={() => setMenuOpen(false)}>Your visit</a><a href="#questions" onClick={() => setMenuOpen(false)}>FAQs</a><a href="#downloads" onClick={() => setMenuOpen(false)}>Downloads</a>
          <Link className="clinic-button clinic-button-small" to={bookingPath}>Book a visit <span aria-hidden="true">&rarr;</span></Link>
        </nav>
      </div>
    </header>

    <main id="main-content">
      <section className="clinic-public-hero clinic-container" aria-labelledby="clinic-hero-title">
        <div className="clinic-hero-copy">
          <p className="clinic-eyebrow"><span className="clinic-tiny-line" /> Maternal care, thoughtfully connected</p>
          <h1 id="clinic-hero-title"><span>Expert care for you.</span>{' '}<span>A loving start</span>{' '}<span className="clinic-hero-emphasis">for your baby.</span></h1>
          <p className="clinic-hero-description">A little reassurance. A clearer next step. Connect with TMC Copino Birthing Home & Medical Clinic for your pregnancy journey and care after birth.</p>
          <div className="clinic-actions"><Link className="clinic-button" to={bookingPath}>Book an appointment <AppIcon name="calendar" /></Link><a className="clinic-quiet-link" href="#care">Explore maternal care <span aria-hidden="true">&rarr;</span></a></div>
          <p className="clinic-booking-note">Request online. Your visit is confirmed by the clinic.</p>
          <div className="clinic-hero-location"><AppIcon name="emergency" /><span>Here for your next chapter<strong>Gajo, Tiwi, Albay</strong></span></div>
        </div>
        <div className="clinic-hero-visual">
          <span className="clinic-hero-outline" aria-hidden="true" />
          <figure className="clinic-hero-photo"><img src="/clinic/maternal-clinic-exterior.jpg" alt="TMC Copino Birthing Home and Medical Clinic building in Gajo, Tiwi, Albay" width="526" height="701" fetchPriority="high" /><figcaption>Real spaces. Familiar care.</figcaption></figure>
          <div className="clinic-hero-note"><span className="clinic-icon-circle"><AppIcon name="prenatal" /></span><div><strong>A place for your beginning.</strong><span>Maternal care, before and after birth.</span></div></div>
          <span className="clinic-photo-caption">TMC COPINO / GAJO, TIWI, ALBAY</span>
        </div>
      </section>

      <div className="clinic-promises clinic-container" aria-label="Your patient portal">
        <p><AppIcon name="calendar" /><span><strong>Visits made clearer</strong>Requests and schedule updates together</span></p>
        <p><AppIcon name="lock" /><span><strong>Your records, protected</strong>Sign-in required for personal care details</span></p>
        <p><AppIcon name="messages" /><span><strong>A connected next step</strong>Follow-ups and care-team communication</span></p>
      </div>

      <section id="care" className="clinic-section clinic-container" aria-labelledby="care-title">
        <div className="clinic-section-top"><SectionHeading eyebrow="Care through each chapter" title="For the mother. For the moments ahead." id="care-title">A maternal-care journey is more than one appointment. Keep your next step connected, before birth and beyond.</SectionHeading><Link className="clinic-quiet-link" to={bookingPath}>Plan your next visit <span aria-hidden="true">&rarr;</span></Link></div>
        <div className="clinic-services">{services.map((service, index) => <article className="clinic-service" key={service.title}>
          <div className="clinic-service-top"><span className="clinic-icon-circle"><AppIcon name={service.icon} /></span><span className="clinic-service-number">0{index + 1}</span></div>
          <h3>{service.title}</h3><p>{service.text}</p><Link to={bookingPath} aria-label={`Request a visit for ${service.title.toLowerCase()}`}><span>Request a visit</span><span aria-hidden="true">&rarr;</span></Link>
        </article>)}</div>
      </section>

      <section id="clinic" className="clinic-spaces-section" aria-labelledby="clinic-spaces-title">
        <div className="clinic-container clinic-spaces-layout"><ClinicSlideshow /><div className="clinic-spaces-copy"><SectionHeading eyebrow="Step inside" title="A familiar place for an important chapter." id="clinic-spaces-title">Take a little tour before your visit. Explore the real spaces at TMC Copino, from your first welcome to a place to rest.</SectionHeading>
          <p>From your first conversation at reception to your follow-up visits, MWOS helps you keep appointments, requirements, and saved records connected with the clinic.</p>
          <div className="clinic-address-card"><AppIcon name="emergency" /><div><strong>{clinicContact.name}</strong><span>{clinicContact.address}</span><a href={clinicPage} target="_blank" rel="noopener noreferrer">Visit the clinic Facebook page <AppIcon name="externalLink" /><span className="clinic-visually-hidden"> (opens in a new tab)</span></a><a className="clinic-address-hours" href="#contact"><AppIcon name="clock" /> Open 24 hours daily. View hours & contact</a></div></div>
          <p className="clinic-small-note">Actual clinic photographs supplied for this website. Please confirm clinic hours and service availability before travelling.</p>
        </div></div>
      </section>

      <ClinicContact />

      <section id="your-visit" className="clinic-section clinic-container" aria-labelledby="visit-title">
        <div className="clinic-visit-header"><SectionHeading eyebrow="A simpler way to begin" title="Your next visit, without the guesswork." id="visit-title">A secure account keeps your appointment request linked to the right patient record.</SectionHeading><Link className="clinic-button" to={bookingPath}>Request an appointment <span aria-hidden="true">&rarr;</span></Link></div>
        <ol className="clinic-visit-steps"><li><span>01</span><h3>Make yourself at home.</h3><p>Sign in with Google or your clinic account. New patients can create their own patient account.</p></li><li><span>02</span><h3>Choose your next step.</h3><p>Open Appointments, select a visit type and preferred schedule, and send your request.</p></li><li><span>03</span><h3>Wait for confirmation.</h3><p>Check the status in your portal. Follow the clinic's confirmed time and any preparation instructions.</p></li></ol>
      </section>

      <section className="clinic-team-section clinic-container" aria-labelledby="team-title"><div className="clinic-team-intro"><SectionHeading eyebrow="People behind your care" title="Care is a conversation." id="team-title">Bring your questions. Your maternal care team helps you understand your visits and the next steps in your care.</SectionHeading><Link className="clinic-quiet-link" to="/portal?intent=team">View care team in the portal <span aria-hidden="true">&rarr;</span></Link><p className="clinic-small-note">Named provider details are available after sign-in. The clinic confirms provider availability and the time of your visit.</p></div>
        <div className="clinic-team-roles">{teamRoles.map((role) => <article key={role.title}><span className="clinic-icon-circle"><AppIcon name={role.icon} /></span><div><h3>{role.title}</h3><p>{role.text}</p></div></article>)}</div>
      </section>

      <section id="feedback" className="clinic-section clinic-container" aria-labelledby="feedback-title"><SectionHeading eyebrow="Patient & visitor feedback" title="Every experience deserves to be heard." id="feedback-title">Only feedback published by the clinic's review system appears below. Ratings are not a measure or guarantee of clinical outcomes.</SectionHeading><PublishedReviews /><Link className="clinic-quiet-link" to="/download#review">Share feedback about MWOS <span aria-hidden="true">&rarr;</span></Link></section>

      <section id="questions" className="clinic-faq-section clinic-container" aria-labelledby="faq-title"><SectionHeading eyebrow="Before your visit" title="A few things you might be wondering." id="faq-title">If your question is about your own health or records, use the secure portal rather than a public review.</SectionHeading><div className="clinic-faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>

      <section id="downloads" className="clinic-download-section clinic-container" aria-labelledby="downloads-title"><div><p className="clinic-eyebrow">Your care, connected</p><h2 id="downloads-title">The clinic portal.<br /><em>Wherever you begin.</em></h2><p>Open the full MWOS portal or install the web app on your device. Your appointments, records, and consultations stay connected to the same account.</p><div className="clinic-actions"><Link className="clinic-button" to="/portal">Open Web Version <span aria-hidden="true">&rarr;</span></Link><Link className="clinic-quiet-link" to="/download">Visit Download Center <span aria-hidden="true">&rarr;</span></Link></div></div><div className="clinic-platforms">{[["windows", "Windows"], ["android", "Android"], ["macos", "macOS"], ["ios", "iOS"]].map(([platform, label]) => <Link key={platform} className="clinic-platform-card" to={`/download#${platform}`} aria-label={`${label}: install or open MWOS`}><PlatformLogo platform={platform} /><span>{label}</span></Link>)}<p>Choose your device to install the MWOS web app or open your portal. Internet required.</p><Link to="/register">New here? Create a patient account</Link></div></section>
    </main>

    <footer className="clinic-footer clinic-container"><div><BrandMark compact sublabel="Birthing home & medical clinic" /><p>Maternal care. Connected with you.</p></div><div><strong>{clinicContact.address}</strong><a href="#contact">Open 24 hours daily. Hours & contact</a><a href={clinicContact.phoneHref}>{clinicContact.phone}</a><a href={`mailto:${clinicContact.email}`}>{clinicContact.email}</a><a href={clinicPage} target="_blank" rel="noopener noreferrer">Clinic Facebook page</a><Link to="/download">Download Center</Link></div><p className="clinic-footer-safety">MWOS is not an emergency response service. For urgent help, contact local emergency services directly. Online appointment and transport requests need clinic confirmation.</p></footer>
  </div>
}
