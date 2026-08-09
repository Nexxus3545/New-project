import React from 'react'

const toneClasses = {
  rose: 'from-[#8b2154]/90 via-[#b43d73]/44 to-[#fff5f9]',
  lavender: 'from-[#3f2b7f]/90 via-[#7c4ddb]/38 to-[#faf7ff]',
  blush: 'from-[#6b2047]/86 via-[#d65c8a]/30 to-[#fff8fb]',
}

export default function CoverCard({
  label,
  title,
  description,
  chips = [],
  className = '',
  imageClassName = '',
  tone = 'rose',
  children,
}) {
  const overlay = toneClasses[tone] || toneClasses.rose

  return (
    <div className={`relative overflow-hidden rounded-[32px] border border-white/80 bg-white/90 shadow-[0_26px_60px_rgba(214,92,138,0.16)] ${className}`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${overlay}`} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.28),transparent_24%),radial-gradient(circle_at_80%_15%,rgba(255,255,255,0.16),transparent_18%)]" />
      <div className="absolute -right-16 top-0 h-56 w-56 rounded-full bg-white/16 blur-3xl" />
      <div className="absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className={`absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.15),transparent_28%,transparent_72%,rgba(255,255,255,0.14))] ${imageClassName}`} />

      <div className="relative flex h-full min-h-[24rem] flex-col justify-end p-5 sm:p-6">
        {(label || title || description || chips.length > 0) && (
          <div className="space-y-3">
            {label ? (
              <span className="inline-flex w-fit rounded-full border border-white/30 bg-white/18 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/90 backdrop-blur">
                {label}
              </span>
            ) : null}

            {title ? <h3 className="max-w-xl text-2xl font-semibold leading-tight text-white sm:text-[2rem]">{title}</h3> : null}
            {description ? <p className="max-w-xl text-sm leading-7 text-white/86">{description}</p> : null}

            {chips.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <span key={chip} className="inline-flex rounded-full border border-white/22 bg-white/15 px-3 py-1 text-xs font-semibold text-white/92 backdrop-blur">
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </div>
  )
}
