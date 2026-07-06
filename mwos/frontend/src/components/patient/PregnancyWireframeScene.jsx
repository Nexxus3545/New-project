import React, { useEffect, useMemo, useState } from 'react'

const BODY_LINE = 'rgba(255, 243, 236, 0.95)'
const GRID_LINE = 'rgba(255, 243, 236, 0.26)'

function formatDate(value) {
  return value
    ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    : 'Not scheduled'
}

function getGestationWeeks(activePregnancy) {
  if (!activePregnancy?.lmp) return null
  const started = new Date(activePregnancy.lmp)
  const now = new Date()
  const diff = Math.max(0, now.getTime() - started.getTime())
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24 * 7)))
}

function buildMeshLines({ cx, cy, rx, ry, verticalCount = 6, horizontalCount = 7 }) {
  const vertical = []
  const horizontal = []

  for (let index = 1; index <= verticalCount; index += 1) {
    const ratio = (index / (verticalCount + 1)) * 2 - 1
    const x = cx + ratio * rx
    const dy = ry * Math.sqrt(Math.max(0, 1 - ratio * ratio))
    vertical.push({ x1: x, y1: cy - dy, x2: x, y2: cy + dy })
  }

  for (let index = 1; index <= horizontalCount; index += 1) {
    const ratio = (index / (horizontalCount + 1)) * 2 - 1
    const y = cy + ratio * ry
    const dx = rx * Math.sqrt(Math.max(0, 1 - ratio * ratio))
    horizontal.push({ x1: cx - dx, y1: y, x2: cx + dx, y2: y })
  }

  return { vertical, horizontal }
}

function MeshEllipse({
  cx,
  cy,
  rx,
  ry,
  rotate = 0,
  verticalCount = 6,
  horizontalCount = 7,
  opacity = 1,
}) {
  const lines = useMemo(
    () => buildMeshLines({ cx, cy, rx, ry, verticalCount, horizontalCount }),
    [cx, cy, rx, ry, verticalCount, horizontalCount]
  )

  return (
    <g transform={`rotate(${rotate} ${cx} ${cy})`} opacity={opacity}>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="rgba(255,255,255,0.02)" stroke={BODY_LINE} strokeWidth="1.5" />
      {lines.horizontal.map((line, index) => (
        <line key={`h-${cx}-${cy}-${index}`} {...line} stroke={GRID_LINE} strokeWidth="1" />
      ))}
      {lines.vertical.map((line, index) => (
        <line key={`v-${cx}-${cy}-${index}`} {...line} stroke={GRID_LINE} strokeWidth="1" />
      ))}
    </g>
  )
}

export default function PregnancyWireframeScene({ dashboard, latestVitals, tips = [] }) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPhase((value) => value + 1)
    }, 90)

    return () => window.clearInterval(timer)
  }, [])

  const activePregnancy = dashboard?.activePregnancy
  const gestationWeeks = getGestationWeeks(activePregnancy)
  const rotation = Math.sin(phase / 10) * 2.5
  const rise = Math.sin(phase / 8) * 3
  const tip = tips.length ? tips[Math.floor(phase / 18) % tips.length] : null

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-slate-800 bg-[#16161d] p-5 text-white shadow-[0_24px_80px_rgba(17,24,39,0.45)]">
      <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.22),transparent_70%)]" />
      <div className="absolute -right-16 top-12 h-40 w-40 rounded-full bg-rose-300/10 blur-3xl" />
      <div className="absolute -left-12 bottom-10 h-36 w-36 rounded-full bg-cyan-300/10 blur-3xl" />

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className="relative mx-auto w-full max-w-[320px]">
          <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-200">
            3D maternal view
          </div>
          <div className="absolute bottom-3 right-3 rounded-full border border-rose-200/20 bg-rose-100/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-100">
            {gestationWeeks ? `Week ${gestationWeeks}` : 'Care sync'}
          </div>

          <svg viewBox="0 0 320 380" className="h-[360px] w-full">
            <defs>
              <linearGradient id="panelGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.01)" />
              </linearGradient>
            </defs>

            <rect x="0" y="0" width="320" height="380" rx="32" fill="url(#panelGlow)" />

            <g opacity="0.35">
              <ellipse cx="168" cy="188" rx="104" ry="152" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1.2" />
              <ellipse
                cx="176"
                cy="164"
                rx="64"
                ry="46"
                fill="none"
                stroke="rgba(255,214,224,0.55)"
                strokeWidth="1.3"
                transform={`rotate(${phase * 1.2} 176 164)`}
              />
              <ellipse
                cx="176"
                cy="164"
                rx="48"
                ry="34"
                fill="none"
                stroke="rgba(125,211,252,0.4)"
                strokeWidth="1.1"
                transform={`rotate(${-phase * 1.4} 176 164)`}
              />
            </g>

            <g transform={`translate(0 ${rise}) rotate(${rotation} 160 190)`}>
              <MeshEllipse cx={164} cy={58} rx={22} ry={30} rotate={-6} verticalCount={5} horizontalCount={6} />
              <MeshEllipse cx={156} cy={76} rx={10} ry={12} rotate={-6} verticalCount={3} horizontalCount={3} opacity={0.9} />
              <MeshEllipse cx={154} cy={134} rx={40} ry={68} rotate={-8} verticalCount={7} horizontalCount={8} />
              <MeshEllipse cx={182} cy={158} rx={44} ry={42} rotate={11} verticalCount={7} horizontalCount={7} opacity={0.92} />
              <MeshEllipse cx={156} cy={214} rx={42} ry={34} rotate={-2} verticalCount={6} horizontalCount={6} opacity={0.92} />
              <MeshEllipse cx={110} cy={146} rx={14} ry={48} rotate={24} verticalCount={4} horizontalCount={6} opacity={0.9} />
              <MeshEllipse cx={232} cy={150} rx={14} ry={50} rotate={-26} verticalCount={4} horizontalCount={6} opacity={0.9} />
              <MeshEllipse cx={94} cy={210} rx={11} ry={34} rotate={16} verticalCount={3} horizontalCount={4} opacity={0.84} />
              <MeshEllipse cx={248} cy={214} rx={11} ry={36} rotate={-14} verticalCount={3} horizontalCount={4} opacity={0.84} />
              <MeshEllipse cx={138} cy={286} rx={18} ry={58} rotate={6} verticalCount={4} horizontalCount={7} opacity={0.88} />
              <MeshEllipse cx={178} cy={288} rx={16} ry={58} rotate={-4} verticalCount={4} horizontalCount={7} opacity={0.88} />
              <MeshEllipse cx={134} cy={348} rx={14} ry={46} rotate={2} verticalCount={3} horizontalCount={5} opacity={0.84} />
              <MeshEllipse cx={176} cy={348} rx={13} ry={46} rotate={-2} verticalCount={3} horizontalCount={5} opacity={0.84} />
            </g>
          </svg>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-200/80">Realtime 3D illustration</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">Wireframe pregnancy guide with subtle motion</h3>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
              This view keeps the dashboard informative by turning pregnancy status, vitals, and care timing into a moving 3D-style illustration inspired by your reference.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Due date</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatDate(activePregnancy?.edd)}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Risk flag</p>
              <p className="mt-2 text-lg font-semibold capitalize text-white">{activePregnancy?.risk_level || 'Routine monitoring'}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Latest fetal HR</p>
              <p className="mt-2 text-lg font-semibold text-white">{latestVitals?.fetal_heart_rate ? `${latestVitals.fetal_heart_rate} bpm` : 'Pending update'}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Next visit</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatDate(dashboard?.nextAppointment?.scheduled_date)}</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-rose-200/10 bg-rose-100/5 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-100/70">Pregnancy tip spotlight</p>
            <p className="mt-2 text-base font-semibold text-white">{tip?.title || 'Keep hydration, rest, and movement balanced throughout the week.'}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {tip?.content || 'Use the dashboard tips section to review clinic-approved guidance for each trimester, warning signs, and medication reminders.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
