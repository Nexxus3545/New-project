import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { publicApi } from '../utils/api'
import BrandMark from '../components/common/BrandMark'
import AppIcon from '../components/common/AppIcon'
import { useAuthStore } from '../store/authStore'
import '../styles/landing.css'

const bookingPath = '/portal?intent=appointment'
const clinicPage = 'https://www.facebook.com/people/TMC-Copino-Birthing-Home/61575314979762/'
const services = [
  { icon: 'prenatal', title: 'Prenatal care', text: 'Keep your visits, saved clinic findings, and follow-up plans together as your pregnancy progresses.' },
  { icon: 'delivery', title: 'Birth preparation', text: 'Discuss your birth plan, required documents, and next steps with the clinic care team.' },
  { icon: 'postnatal', title: 'Postnatal follow-up', text: 'Stay connected with your care team after birth, with visits and recovery questions in one place.' },
  { icon: 'baby', title: 'Mother & newborn care', text: 'Bring your questions about feeding, newborn follow-up, and ongoing care to your clinic visit.' },
]
const spaces = [
  { src: '/clinic/maternal-reception.jpg', title: 'A familiar welcome', alt: 'TMC Copino reception and information area' },
  { src: '/clinic/maternal-consultation-room.jpg', title: 'Room for your questions', alt: 'Clinic consultation room with an examination bed and care equipment' },
  { src: '/clinic/maternal-birthing-room.jpg', title: 'A look inside the birthing room', alt: 'TMC Copino birthing room with a delivery bed and newborn bassinet' },
  { src: '/clinic/maternal-recovery-room.jpg', title: 'A place to rest', alt: 'Clinic recovery room with two patient beds' },
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
  ['Do I need to install an app?', 'No. Open Web Version to use MWOS in your browser. The Download Center has platform setup guides and explains release availability.'],
  ['Is this an emergency service?', 'No. This website and its messages are not an emergency response service. For urgent help, contact local emergency services directly or go to the nearest appropriate facility. An online transport request is not a dispatch confirmation.'],
]

function SectionHeading({ eyebrow, title, children, id }) {
  return <div className="clinic-section-heading">
    <p className="clinic-eyebrow">{eyebrow}</p><h2 id={id}>{title}</h2>{children ? <p>{children}</p> : null}
  </div>
}

function ClinicGallery() {
  const [selected, setSelected] = useState(0)
  return <div className="clinic-gallery">
    <figure className="clinic-gallery-main">
      <img src={spaces[selected].src} alt={spaces[selected].alt} loading="lazy" width="2048" height="2048" />
      <figcaption aria-live="polite"><span>Inside TMC Copino</span><strong>{spaces[selected].title}</strong></figcaption>
    </figure>
    <div className="clinic-gallery-thumbs" aria-label="Explore clinic spaces">
      {spaces.map((space, index) => <button key={space.src} type="button" aria-label={`Show ${space.title.toLowerCase()}`} aria-pressed={selected === index} onClick={() => setSelected(index)}>
        <img src={space.src} alt="" loading="lazy" width="120" height="100" /><span>{String(index + 1).padStart(2, '0')}</span>
      </button>)}
    </div>
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
  const [menuOpen, setMenuOpen] = useState(false)
  return <div className="clinic-landing">
    <a className="clinic-skip" href="#main-content">Skip to content</a>
    <header className="clinic-header">
      <div className="clinic-header-inner">
        <Link className="clinic-home-link" to="/" aria-label="TMC Copino home"><BrandMark compact sublabel="Birthing home & medical clinic" /></Link>
        <button className="clinic-menu-button" type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} aria-controls="clinic-navigation" onClick={() => setMenuOpen((open) => !open)}><AppIcon name="menu" /><span>Menu</span></button>
        <nav id="clinic-navigation" className="clinic-navigation" data-open={menuOpen} aria-label="Clinic navigation" onKeyDown={(event) => { if (event.key === 'Escape') setMenuOpen(false) }}>
          <a href="#care" onClick={() => setMenuOpen(false)}>Our care</a><a href="#clinic" onClick={() => setMenuOpen(false)}>The clinic</a><a href="#your-visit" onClick={() => setMenuOpen(false)}>Your visit</a><a href="#questions" onClick={() => setMenuOpen(false)}>FAQs</a><a href="#downloads" onClick={() => setMenuOpen(false)}>Downloads</a>
          <Link className="clinic-button clinic-button-small" to={bookingPath}>Book a visit <span aria-hidden="true">&rarr;</span></Link>
        </nav>
      </div>
    </header>

    <main id="main-content">
      <section className="clinic-public-hero clinic-container" aria-labelledby="clinic-hero-title">
        <div className="clinic-hero-copy">
          <p className="clinic-eyebrow"><span className="clinic-tiny-line" /> Maternal care, thoughtfully connected</p>
          <h1 id="clinic-hero-title">With you, from<br />first visit to<br /><em>first embrace.</em></h1>
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
        <div className="clinic-container clinic-spaces-layout"><ClinicGallery /><div className="clinic-spaces-copy"><SectionHeading eyebrow="Step inside" title="A familiar place for an important chapter." id="clinic-spaces-title">Get to know the spaces at TMC Copino before your visit. These are photographs of the clinic supplied for this website, not stock images.</SectionHeading>
          <p>From your first conversation at reception to your follow-up visits, MWOS helps you keep appointments, requirements, and saved records connected with the clinic.</p>
          <div className="clinic-address-card"><AppIcon name="emergency" /><div><strong>TMC Copino Birthing Home & Medical Clinic</strong><span>Gajo, Tiwi, Albay</span><a href={clinicPage} target="_blank" rel="noopener noreferrer">Visit the clinic Facebook page <span aria-hidden="true">&nearr;</span></a></div></div>
          <p className="clinic-small-note">Please confirm clinic hours and service availability before travelling.</p>
        </div></div>
      </section>

      <section id="your-visit" className="clinic-section clinic-container" aria-labelledby="visit-title">
        <div className="clinic-visit-header"><SectionHeading eyebrow="A simpler way to begin" title="Your next visit, without the guesswork." id="visit-title">A secure account keeps your appointment request linked to the right patient record.</SectionHeading><Link className="clinic-button" to={bookingPath}>Request an appointment <span aria-hidden="true">&rarr;</span></Link></div>
        <ol className="clinic-visit-steps"><li><span>01</span><h3>Make yourself at home.</h3><p>Sign in with Google or your clinic account. New patients can create their own patient account.</p></li><li><span>02</span><h3>Choose your next step.</h3><p>Open Appointments, select a visit type and preferred schedule, and send your request.</p></li><li><span>03</span><h3>Wait for confirmation.</h3><p>Check the status in your portal. Follow the clinic's confirmed time and any preparation instructions.</p></li></ol>
      </section>

      <section className="clinic-team-section clinic-container" aria-labelledby="team-title"><div className="clinic-team-intro"><SectionHeading eyebrow="People behind your care" title="Care is a conversation." id="team-title">Bring your questions. Your maternal care team helps you understand your visits and the next steps in your care.</SectionHeading><Link className="clinic-quiet-link" to="/portal?intent=team">View care team in the portal <span aria-hidden="true">&rarr;</span></Link><p className="clinic-small-note">Named provider details are available after sign-in. The clinic confirms provider availability and the time of your visit.</p></div>
        <div className="clinic-team-roles">{teamRoles.map((role) => <article key={role.title}><span className="clinic-icon-circle"><AppIcon name={role.icon} /></span><div><h3>{role.title}</h3><p>{role.text}</p></div></article>)}</div>
      </section>

      <section id="feedback" className="clinic-section clinic-container" aria-labelledby="feedback-title"><SectionHeading eyebrow="Patient & visitor feedback" title="Every experience deserves to be heard." id="feedback-title">Only feedback published by the clinic's review system appears below. Ratings are not a measure or guarantee of clinical outcomes.</SectionHeading><PublishedReviews /><Link className="clinic-quiet-link" to="/download#review">Share feedback about MWOS <span aria-hidden="true">&rarr;</span></Link></section>

      <section id="questions" className="clinic-faq-section clinic-container" aria-labelledby="faq-title"><SectionHeading eyebrow="Before your visit" title="A few things you might be wondering." id="faq-title">If your question is about your own health or records, use the secure portal rather than a public review.</SectionHeading><div className="clinic-faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>

      <section id="downloads" className="clinic-download-section clinic-container" aria-labelledby="downloads-title"><div><p className="clinic-eyebrow">Your care, connected</p><h2 id="downloads-title">The clinic portal.<br /><em>Wherever you begin.</em></h2><p>Use MWOS in your browser, or explore the desktop and mobile setup guides. You do not need an app to request a visit.</p><div className="clinic-actions"><Link className="clinic-button" to="/portal">Open Web Version <span aria-hidden="true">&rarr;</span></Link><Link className="clinic-quiet-link" to="/download">Visit Download Center <span aria-hidden="true">&rarr;</span></Link></div></div><div className="clinic-platforms"><span>Windows</span><span>Android</span><span>macOS</span><span>iOS</span><p>Platform guides available. Reviewed app installers are not published here yet.</p><Link to="/register">New here? Create a patient account</Link></div></section>
    </main>

    <footer className="clinic-footer clinic-container"><div><BrandMark compact sublabel="Birthing home & medical clinic" /><p>Maternal care. Connected with you.</p></div><div><strong>Gajo, Tiwi, Albay</strong><a href={clinicPage} target="_blank" rel="noopener noreferrer">Clinic Facebook page</a><Link to="/download">Download Center</Link></div><p className="clinic-footer-safety">MWOS is not an emergency response service. For urgent help, contact local emergency services directly. Online appointment and transport requests need clinic confirmation.</p></footer>
  </div>
}
