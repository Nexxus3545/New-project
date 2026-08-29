import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../utils/api'
import BrandMark from '../components/common/BrandMark'

const downloadCards = [
  { title: 'Desktop App', subtitle: 'Windows setup guide', href: '/downloads/mwos-windows-guide.txt' },
  { title: 'Desktop App', subtitle: 'macOS setup guide', href: '/downloads/mwos-macos-guide.txt' },
  { title: 'Mobile App', subtitle: 'Android setup guide', href: '/downloads/mwos-android-guide.txt' },
  { title: 'Mobile App', subtitle: 'iOS setup guide', href: '/downloads/mwos-ios-guide.txt' },
]

export default function DownloadPage() {
  const [form, setForm] = useState({ displayName: '', roleLabel: 'Guest', rating: 5, comment: '' })
  const [notice, setNotice] = useState('')

  const { data: reviewSummary } = useQuery({
    queryKey: ['public-review-summary'],
    queryFn: () => api.get('/reviews/summary').then((response) => response.data.data),
  })

  const reviewMutation = useMutation({
    mutationFn: () => api.post('/reviews', form),
    onSuccess: () => {
      setNotice('Thank you for your feedback.')
      setForm({ displayName: '', roleLabel: 'Guest', rating: 5, comment: '' })
    },
    onError: () => setNotice('Unable to submit feedback right now.'),
  })

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff7f8_0%,#fffdfb_46%,#fff5f2_100%)] px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="rounded-[36px] border border-white/70 bg-white/90 p-6 shadow-2xl backdrop-blur lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="space-y-6">
              <BrandMark sublabel="Maternal Wellness and Operations System" />
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-rose-500">Download center</p>
                <h1 className="mt-3 text-5xl font-semibold leading-tight">Choose your platform before you log in.</h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                  Access MWOS through the web portal, desktop workspace, or mobile companion. The platform uses the clinic logo palette, light-first readability, and the same secure backend across experiences.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/login" className="btn-primary">Open Web Version</Link>
                <Link to="/register" className="btn-secondary">Create Account</Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {downloadCards.map((card) => (
                <a
                  key={card.href}
                  href={card.href}
                  download
                  className="rounded-[28px] border border-rose-100 bg-[linear-gradient(180deg,#fffefe_0%,#fff3f4_100%)] p-5 shadow-sm transition-transform duration-300 hover:-translate-y-1"
                >
                  <p className="text-sm uppercase tracking-[0.24em] text-rose-500">{card.title}</p>
                  <h2 className="mt-3 text-xl font-semibold text-slate-900">{card.subtitle}</h2>
                  <p className="mt-4 text-sm text-slate-500">Download guide</p>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-xl">
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

          <div className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-xl">
            <h2 className="text-2xl font-semibold">Leave a review</h2>
            <p className="mt-2 text-sm text-slate-500">Share feedback about the portal, downloads, care visibility, or clinic workflow.</p>
            {notice ? <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{notice}</div> : null}
            <div className="mt-5 space-y-4">
              <div><label className="label">Display name</label><input className="input" value={form.displayName} onChange={(e) => setForm((current) => ({ ...current, displayName: e.target.value }))} /></div>
              <div><label className="label">Role</label><input className="input" value={form.roleLabel} onChange={(e) => setForm((current) => ({ ...current, roleLabel: e.target.value }))} /></div>
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
              <div><label className="label">Feedback</label><textarea className="input" rows={4} value={form.comment} onChange={(e) => setForm((current) => ({ ...current, comment: e.target.value }))} /></div>
              <button className="btn-primary" onClick={() => reviewMutation.mutate()} disabled={reviewMutation.isPending}>
                {reviewMutation.isPending ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
