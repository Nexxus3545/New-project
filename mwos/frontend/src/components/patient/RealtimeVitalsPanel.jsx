import React, { useEffect, useMemo, useState } from 'react'

function buildWavePath({ tick, points, amplitude, baseline, frequency, spikeHeight, widthStep }) {
  const coords = Array.from({ length: points }, (_, index) => {
    const x = 20 + index * widthStep
    const seed = index + tick
    const spikeZone = seed % 10
    const spike = spikeZone === 5 ? -spikeHeight : spikeZone === 6 ? spikeHeight * 0.45 : 0
    const y = baseline + Math.sin(seed * frequency) * amplitude + spike
    return { x, y }
  })

  return coords.reduce((path, point, index) => (
    index === 0 ? `M ${point.x} ${point.y}` : `${path} L ${point.x} ${point.y}`
  ), '')
}

export default function RealtimeVitalsPanel({ latestVitals, activePregnancy, title = 'Realtime vitals monitor' }) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((value) => value + 1)
    }, 180)

    return () => window.clearInterval(timer)
  }, [])

  const systolic = Math.round((latestVitals?.bp_systolic || 118) + Math.sin(tick / 5) * 2)
  const diastolic = Math.round((latestVitals?.bp_diastolic || 76) + Math.cos(tick / 6) * 2)
  const fetalHeartRate = Math.round((latestVitals?.fetal_heart_rate || 145) + Math.sin(tick / 4) * 3)
  const weight = Number(((latestVitals?.weight_kg || 62) + Math.sin(tick / 10) * 0.3).toFixed(1))
  const movementText = latestVitals?.fetal_movement || 'Active'

  const waveA = useMemo(() => buildWavePath({
    tick,
    points: 34,
    amplitude: 10,
    baseline: 92,
    frequency: 0.55,
    spikeHeight: 26,
    widthStep: 9.6,
  }), [tick])

  const waveB = useMemo(() => buildWavePath({
    tick: tick + 5,
    points: 34,
    amplitude: 8,
    baseline: 136,
    frequency: 0.35,
    spikeHeight: 12,
    widthStep: 9.6,
  }), [tick])

  return (
    <div className="overflow-hidden rounded-[32px] border border-slate-800 bg-[#111827] p-5 text-white shadow-[0_20px_70px_rgba(15,23,42,0.45)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300/75">Live maternal telemetry</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">{title}</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
            A continuously moving vitals display styled like a bedside monitor, anchored to the latest recorded maternal and fetal values.
          </p>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
          {activePregnancy?.risk_level ? `${activePregnancy.risk_level} risk watch` : 'Routine live watch'}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/70 p-4">
        <svg viewBox="0 0 360 184" className="h-[200px] w-full">
          <defs>
            <linearGradient id="vitalGlowA" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f472b6" />
              <stop offset="100%" stopColor="#fb7185" />
            </linearGradient>
            <linearGradient id="vitalGlowB" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#14b8a6" />
            </linearGradient>
          </defs>

          {Array.from({ length: 6 }, (_, index) => (
            <line
              key={`h-${index}`}
              x1="20"
              y1={34 + index * 24}
              x2="340"
              y2={34 + index * 24}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          ))}

          {Array.from({ length: 8 }, (_, index) => (
            <line
              key={`v-${index}`}
              x1={20 + index * 40}
              y1="20"
              x2={20 + index * 40}
              y2="164"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          ))}

          <path d={waveA} fill="none" stroke="url(#vitalGlowA)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d={waveB} fill="none" stroke="url(#vitalGlowB)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />

          <circle cx="34" cy="92" r="4" fill="#fb7185" />
          <circle cx="34" cy="136" r="4" fill="#2dd4bf" />

          <text x="48" y="96" fill="rgba(255,255,255,0.68)" fontSize="10" letterSpacing="2">FETAL HEART RATE</text>
          <text x="48" y="140" fill="rgba(255,255,255,0.68)" fontSize="10" letterSpacing="2">MATERNAL WAVE</text>
        </svg>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Blood pressure</p>
          <p className="mt-2 text-2xl font-semibold text-white">{systolic}/{diastolic}</p>
          <p className="mt-1 text-xs text-slate-400">mmHg simulated live swing</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Fetal heart rate</p>
          <p className="mt-2 text-2xl font-semibold text-white">{fetalHeartRate}</p>
          <p className="mt-1 text-xs text-slate-400">beats per minute</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Weight</p>
          <p className="mt-2 text-2xl font-semibold text-white">{weight}</p>
          <p className="mt-1 text-xs text-slate-400">kg tracking pulse</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Movement</p>
          <p className="mt-2 text-2xl font-semibold text-white">{movementText}</p>
          <p className="mt-1 text-xs text-slate-400">latest patient note</p>
        </div>
      </div>
    </div>
  )
}
