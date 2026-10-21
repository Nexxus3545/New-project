import React, { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, {
  Circle,
  Line,
  Path,
  Rect,
} from 'react-native-svg'
import { colors, radius, shadow, spacing } from '../theme'

function buildWavePath({ tick, points, amplitude, baseline, frequency, spikeHeight, widthStep }) {
  const coords = Array.from({ length: points }, (_, index) => {
    const x = 16 + index * widthStep
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

export default function RealtimeVitalsPanel({ latestVitals, activePregnancy }) {
  const tick = 0
  const systolic = latestVitals?.bp_systolic ?? '--'
  const diastolic = latestVitals?.bp_diastolic ?? '--'
  const fetalHeartRate = latestVitals?.fetal_heart_rate ?? '--'
  const weight = latestVitals?.weight_kg ?? '--'
  const movementText = latestVitals?.fetal_movement || 'Not recorded'

  const waveA = useMemo(() => buildWavePath({
    tick,
    points: 30,
    amplitude: 10,
    baseline: 88,
    frequency: 0.55,
    spikeHeight: 26,
    widthStep: 10.1,
  }), [])

  const waveB = useMemo(() => buildWavePath({
    tick: tick + 5,
    points: 30,
    amplitude: 8,
    baseline: 132,
    frequency: 0.35,
    spikeHeight: 12,
    widthStep: 10.1,
  }), [])

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Latest recorded vitals</Text>
          <Text style={styles.title}>Maternal vitals monitor</Text>
          <Text style={styles.body}>
            This view uses the most recent saved maternal and fetal values. It updates after clinic records are saved or refreshed.
          </Text>
        </View>
        <View style={styles.riskBadge}>
          <Text style={styles.riskBadgeText}>{activePregnancy?.risk_level ? `${activePregnancy.risk_level} risk` : 'Routine watch'}</Text>
        </View>
      </View>

      <View style={styles.graphWrap}>
        <Svg width="100%" height={180} viewBox="0 0 320 180">
          <Rect x="0" y="0" width="320" height="180" rx="24" fill="rgba(2,6,23,0.65)" />

          {Array.from({ length: 6 }, (_, index) => (
            <Line
              key={`grid-h-${index}`}
              x1="16"
              y1={32 + index * 22}
              x2="304"
              y2={32 + index * 22}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          ))}

          {Array.from({ length: 7 }, (_, index) => (
            <Line
              key={`grid-v-${index}`}
              x1={16 + index * 42}
              y1="18"
              x2={16 + index * 42}
              y2="160"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          ))}

          <Path d={waveA} fill="none" stroke="#fb7185" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
          <Path d={waveB} fill="none" stroke="#2dd4bf" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
          <Circle cx="26" cy="88" r="4" fill="#fb7185" />
          <Circle cx="26" cy="132" r="4" fill="#2dd4bf" />
        </Svg>
      </View>

      <View style={styles.metricGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Blood pressure</Text>
          <Text style={styles.metricValue}>{systolic}/{diastolic}</Text>
          <Text style={styles.metricSub}>mmHg from latest saved visit</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Fetal heart rate</Text>
          <Text style={styles.metricValue}>{fetalHeartRate}</Text>
          <Text style={styles.metricSub}>beats per minute</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Weight</Text>
          <Text style={styles.metricValue}>{weight}</Text>
          <Text style={styles.metricSub}>kg from latest saved visit</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Movement</Text>
          <Text style={styles.metricValue}>{movementText}</Text>
          <Text style={styles.metricSub}>latest note</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 30,
    padding: spacing.lg,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    ...shadow.lg,
  },
  headerRow: {
    gap: spacing.sm,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    color: '#a7f3d0',
  },
  title: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: '700',
    color: colors.white,
  },
  body: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.76)',
  },
  riskBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(45,212,191,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.16)',
  },
  riskBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ccfbf1',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  graphWrap: {
    marginTop: spacing.md,
    borderRadius: 24,
    overflow: 'hidden',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  metricCard: {
    width: '47%',
    borderRadius: 20,
    padding: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.58)',
  },
  metricValue: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  metricSub: {
    marginTop: 4,
    fontSize: 11,
    color: 'rgba(255,255,255,0.58)',
  },
})
