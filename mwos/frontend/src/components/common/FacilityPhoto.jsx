import React from 'react'

export default function FacilityPhoto({ facility }) {
  if (!facility) return null
  return <figure className="mb-6 grid overflow-hidden rounded-2xl border border-rose-100 bg-white md:grid-cols-2 dark:border-slate-800 dark:bg-slate-900">
    <img src={facility.src} alt={facility.alt} width="2048" height="2048" loading="lazy" className="h-48 w-full object-cover object-center md:h-56" />
    <figcaption className="flex flex-col justify-center p-5 md:p-7">
      <p className="text-xs font-semibold uppercase tracking-widest text-rose-700 dark:text-rose-300">Inside TMC Copino · {facility.label}</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">{facility.title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{facility.description}</p>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Clinic photograph · Room availability is confirmed by the clinic.</p>
    </figcaption>
  </figure>
}
