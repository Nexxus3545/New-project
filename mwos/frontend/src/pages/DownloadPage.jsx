import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { publicApi } from '../utils/api'
import BrandMark from '../components/common/BrandMark'
import PlatformLogo from '../components/common/PlatformLogo'
import '../styles/download.css'
import { useAuthStore } from '../store/authStore'
import PlatformSetup, { platformOptions } from '../components/common/PlatformSetup'
import { getDevicePlatform } from '../utils/installApp'

export default function DownloadPage() {
  const { hash, key } = useLocation()
  const selectedPlatform = platformOptions.find(card => `#${card.id}` === hash)?.id
  const platform = selectedPlatform || getDevicePlatform() || 'windows'
  useEffect(() => {
    if (hash === '#review') document.getElementById('review')?.scrollIntoView({ block: 'center' })
  }, [hash])
  const [form, setForm] = useState({ displayName: '', roleLabel: 'Guest', rating: 5, comment: '' })
  const [notice, setNotice] = useState('')
  const sessionKey = useAuthStore((state) => `${state.user?.id || 'guest'}:${state.user?.role || ''}`)

  const { data: reviewSummary } = useQuery({
    queryKey: ['public-review-summary', sessionKey],
    queryFn: () => publicApi.get('/reviews/summary').then((response) => response.data.data),
  })

  const reviewMutation = useMutation({
    mutationFn: () => publicApi.post('/reviews', form),
    onSuccess: () => {
      setNotice('Thank you for your feedback.')
      setForm({ displayName: '', roleLabel: 'Guest', rating: 5, comment: '' })
    },
    onError: () => setNotice('Unable to submit feedback right now.'),
  })

  return (
    <main className="download-page">
      <div className="download-shell">
        <header className="download-header">
          <Link to="/" aria-label="TMC Copino homepage"><BrandMark sublabel="Birthing Home & Medical Clinic" /></Link>
          <Link to="/" className="download-back" aria-label="Back to clinic homepage">← <span>Clinic homepage</span></Link>
        </header>
        <section className="download-hero" aria-labelledby="download-title">
          <div className="download-intro">
            <p className="download-eyebrow">THE MWOS DOWNLOAD CENTER</p>
            <h1 id="download-title">Your care.<br />Your device.<br /><em>Always connected.</em></h1>
            <p className="download-description">One place for your appointments, care updates, and clinic conversations. Choose how you connect with TMC Copino.</p>
            <a className="download-text-link" href="#platforms">Explore your options <span aria-hidden="true">↓</span></a>
          </div>
          <div className="download-web-panel">
            <div className="download-web-top"><span className="download-browser-icon" aria-hidden="true">▤</span><span className="download-live"><i /> Available now</span></div>
            <div><p className="download-eyebrow">START HERE · WEB PORTAL</p><h2>Care is just<br />a click away.</h2><p>Open MWOS in your browser. No download or installation needed.</p></div>
            <Link to="/portal" className="download-primary">Open Web Version <span aria-hidden="true">↗</span></Link>
            <div className="download-web-foot"><span>New to MWOS?</span><Link to="/register">Create an account →</Link></div>
          </div>
        </section>
        <section id="platforms" className="download-platform-section" aria-labelledby="platform-title">
          <div className="download-section-heading"><div><p className="download-eyebrow">FIND YOUR PLATFORM</p><h2 id="platform-title">A familiar home, on every screen.</h2></div><p>Install the MWOS web app on your device,<br />or open the full system in your browser.</p></div>
          <div className="download-platform-grid" aria-label="MWOS device options">
            {platformOptions.map((card, index) => (
              <article key={card.id} id={card.id} className="download-platform-card" data-selected={platform === card.id}>
                <div className="download-card-top"><span className={'download-logo download-logo-' + card.id}><PlatformLogo platform={card.id} /></span><span className="download-card-number">0{index + 1}</span></div>
                <p className="download-eyebrow">{card.type}</p>
                <h3>{card.name}</h3>
                <p className="download-card-description">{card.description}</p>
                <div className="download-card-bottom"><span className="download-release"><i /> Available as a web app</span><Link to={`#${card.id}`} aria-label={`Set up MWOS on ${card.name}`}>Set up on {card.name} <span aria-hidden="true">→</span></Link><Link to="/portal" aria-label={`Open MWOS for ${card.name}`}>Open MWOS <span aria-hidden="true">↗</span></Link></div>
              </article>
            ))}
          </div>
          <PlatformSetup platform={platform} focusOnChange={selectedPlatform ? key : ''} />
          <div className="download-note"><span aria-hidden="true">ⓘ</span><p><strong>One account, the same care.</strong> Sign in to your patient or staff workspace from any supported device. Internet is required; native APK, EXE, and App Store releases are not published here.</p><Link to="/portal">Open portal →</Link></div>
        </section>
        <div className="download-feedback-heading"><p className="download-eyebrow">BETTER CARE, TOGETHER</p><h2>Your experience matters.</h2><p>Read community feedback or share a thought about MWOS.</p></div>
        <div className="download-feedback-grid">
          <div className="download-feedback-panel">
            <h2 className="text-2xl font-semibold">What users are saying</h2>
            <div className="mt-4 flex items-end gap-4">
              <div className="text-5xl font-semibold text-rose-500">{reviewSummary?.averageRating?.toFixed?.(2) || '0.00'}</div>
              <div className="pb-2 text-sm text-slate-500">{reviewSummary?.totalReviews || 0} published reviews</div>
            </div>
            <div className="mt-6 space-y-4">
              {(reviewSummary?.recent || []).map((review) => (
                <article key={review.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{review.display_name}</p>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{review.role_label}</p>
                    </div>
                    <div className="text-sm font-semibold text-rose-500">{'★'.repeat(review.rating)}</div>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{review.comment}</p>
                </article>
              ))}
            </div>
          </div>

          <div id="review" className="download-feedback-panel">
            <h2 className="text-2xl font-semibold">Leave a review</h2>
            <p className="mt-2 text-sm text-slate-500">Share feedback about the portal, downloads, care visibility, or clinic workflow.</p>
            {notice ? <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{notice}</div> : null}
            <div className="mt-5 space-y-4">
              <div><label htmlFor="review-name" className="label">Display name</label><input id="review-name" className="input" value={form.displayName} onChange={(e) => setForm((current) => ({ ...current, displayName: e.target.value }))} /></div>
              <div><label htmlFor="review-role" className="label">Role</label><input id="review-role" className="input" value={form.roleLabel} onChange={(e) => setForm((current) => ({ ...current, roleLabel: e.target.value }))} /></div>
              <div>
                <label className="label">Rating</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`rounded-full px-4 py-2 text-sm ${form.rating === value ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600'}`}
                      onClick={() => setForm((current) => ({ ...current, rating: value }))}
                    >
                      {value}★
                    </button>
                  ))}
                </div>
              </div>
              <div><label htmlFor="review-feedback" className="label">Feedback</label><textarea id="review-feedback" className="input" rows={4} value={form.comment} onChange={(e) => setForm((current) => ({ ...current, comment: e.target.value }))} /></div>
              <button className="btn-primary" onClick={() => reviewMutation.mutate()} disabled={reviewMutation.isPending}>
                {reviewMutation.isPending ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}


