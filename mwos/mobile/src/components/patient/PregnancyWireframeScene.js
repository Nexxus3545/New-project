import React, { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, {
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Rect,
  Stop,
} from 'react-native-svg'
import { colors, radius, shadow, spacing } from '../theme'

const BODY_LINE = 'rgba(255,243,236,0.95)'
const GRID_LINE = 'rgba(255,243,236,0.26)'

function formatDate(value) {
  return value
    ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    : 'Not scheduled'
}

function getGestationWeeks(activePregnancy) {
  if (!activePregnancy?.lmp) return null
  const started = new Date(activePregnancy.lmp)
  const diff = Math.max(0, Date.now() - started.getTime())
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
    <G transform={`rotate(${rotate} ${cx} ${cy})`} opacity={opacity}>
      <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="rgba(255,255,255,0.02)" stroke={BODY_LINE} strokeWidth="1.5" />
      {lines.horizontal.map((line, index) => (
        <Line key={`h-${cx}-${cy}-${index}`} {...line} stroke={GRID_LINE} strokeWidth="1" />
      ))}
      {lines.vertical.map((line, index) => (
        <Line key={`v-${cx}-${cy}-${index}`} {...line} stroke={GRID_LINE} strokeWidth="1" />
      ))}
    </G>
  )
}

export default function PregnancyWireframeScene({ dashboard, latestVitals, tips = [] }) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setPhase((value) => value + 1)
    }, 90)

    return () => clearInterval(timer)
  }, [])

  const activePregnancy = dashboard?.activePregnancy
  const gestationWeeks = getGestationWeeks(activePregnancy)
  const rotation = Math.sin(phase / 10) * 2.5
  const rise = Math.sin(phase / 8) * 3
  const tip = tips.length ? tips[Math.floor(phase / 18) % tips.length] : null

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.eyebrow}>3D maternal view</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{gestationWeeks ? `Week ${gestationWeeks}` : 'Care sync'}</Text>
        </View>
      </View>

      <View style={styles.sceneWrap}>
        <Svg width="100%" height={330} viewBox="0 0 320 380">
          <Defs>
            <LinearGradient id="panelGlowMobile" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
              <Stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
            </LinearGradient>
          </Defs>

          <Rect x="0" y="0" width="320" height="380" rx="32" fill="url(#panelGlowMobile)" />
          <Ellipse cx="168" cy="188" rx="104" ry="152" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1.2" />
          <Ellipse
            cx="176"
            cy="164"
            rx="64"
            ry="46"
            fill="none"
            stroke="rgba(255,214,224,0.55)"
            strokeWidth="1.3"
            transform={`rotate(${phase * 1.2} 176 164)`}
          />
          <Ellipse
            cx="176"
            cy="164"
            rx="48"
            ry="34"
            fill="none"
            stroke="rgba(125,211,252,0.4)"
            strokeWidth="1.1"
            transform={`rotate(${-phase * 1.4} 176 164)`}
          />

          <G transform={`translate(0 ${rise}) rotate(${rotation} 160 190)`}>
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
          </G>
        </Svg>
      </View>

      <View style={styles.infoGrid}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Due date</Text>
          <Text style={styles.infoValue}>{formatDate(activePregnancy?.edd)}</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Risk flag</Text>
          <Text style={styles.infoValue}>{activePregnancy?.risk_level || 'Routine'}</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Latest fetal HR</Text>
          <Text style={styles.infoValue}>{latestVitals?.fetal_heart_rate ? `${latestVitals.fetal_heart_rate} bpm` : 'Pending'}</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Next visit</Text>
          <Text style={styles.infoValue}>{formatDate(dashboard?.nextAppointment?.scheduled_date)}</Text>
        </View>
      </View>

      <View style={styles.tipCard}>
        <Text style={styles.tipLabel}>Pregnancy tip spotlight</Text>
        <Text style={styles.tipTitle}>{tip?.title || 'Keep hydration, rest, and movement balanced throughout the week.'}</Text>
        <Text style={styles.tipBody}>
          {tip?.content || 'Use the dashboard tips section to review clinic-approved guidance for each trimester, warning signs, and medication reminders.'}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 30,
    padding: spacing.lg,
    backgroundColor: '#16161d',
    borderWidth: 1,
    borderColor: '#1f2531',
    ...shadow.lg,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    color: '#fecdd3',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
  },
  sceneWrap: {
    marginTop: spacing.md,
    borderRadius: 28,
    overflow: 'hidden',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  infoCard: {
    width: '47%',
    borderRadius: 20,
    padding: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.58)',
  },
  infoValue: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
  tipCard: {
    marginTop: spacing.md,
    borderRadius: 24,
    padding: spacing.md,
    backgroundColor: 'rgba(244,114,182,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.16)',
  },
  tipLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    color: '#fecdd3',
  },
  tipTitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  tipBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.76)',
  },
})
