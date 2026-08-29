import React, { useMemo, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Button } from '../components/ui'
import { colors, radius, shadow, spacing } from '../components/theme'
import { usePatientExperienceStore } from '../hooks/usePatientExperienceStore'

const slides = [
  {
    step: '01',
    title: 'Connected care in one place',
    body: 'Follow appointments, care tasks, messages, and records from a mobile flow built around maternal health.',
    accent: '#f3dde2',
  },
  {
    step: '02',
    title: 'Find doctors, medicine, and support faster',
    body: 'Browse clinic specialists, request medicine pickup, and keep urgent contact paths close at hand.',
    accent: '#dff5f2',
  },
  {
    step: '03',
    title: 'See reports without leaving the app',
    body: 'Review vitals, summaries, immunizations, and document status in a calmer healthcare-style experience.',
    accent: '#fef1d9',
  },
]

export default function OnboardingScreen() {
  const [index, setIndex] = useState(0)
  const completeOnboarding = usePatientExperienceStore((state) => state.completeOnboarding)
  const slide = slides[index]
  const isLast = index === slides.length - 1
  const progressText = useMemo(() => `${index + 1} / ${slides.length}`, [index])

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.orbA} />
      <View style={styles.orbB} />

      <View style={styles.topRow}>
        <Text style={styles.brand}>MWOS Mobile</Text>
        {!isLast ? (
          <TouchableOpacity onPress={completeOnboarding} activeOpacity={0.82}>
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={[styles.heroCard, { backgroundColor: slide.accent }]}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>{slide.step}</Text>
        </View>
        <View style={styles.heroPanel}>
          <View style={styles.heroTile} />
          <View style={[styles.heroTile, styles.heroTileTall]} />
          <View style={styles.heroTile} />
        </View>
      </View>

      <View style={styles.copyBlock}>
        <Text style={styles.progress}>{progressText}</Text>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </View>

      <View style={styles.dots}>
        {slides.map((item, itemIndex) => (
          <View
            key={item.step}
            style={[
              styles.dot,
              itemIndex === index && styles.dotActive,
            ]}
          />
        ))}
      </View>

      <View style={styles.actions}>
        <Button
          title={isLast ? 'Get started' : 'Continue'}
          onPress={isLast ? completeOnboarding : () => setIndex((current) => current + 1)}
          size="lg"
        />
        {!isLast ? (
          <Button
            title="Back"
            variant="secondary"
            onPress={() => setIndex((current) => Math.max(0, current - 1))}
            disabled={index === 0}
            size="lg"
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: 54,
    paddingBottom: 40,
    backgroundColor: colors.brand.pearl,
  },
  orbA: {
    position: 'absolute',
    top: -70,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(201,137,148,0.18)',
  },
  orbB: {
    position: 'absolute',
    bottom: 40,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(15,118,110,0.1)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brand.copper,
  },
  skip: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[500],
  },
  heroCard: {
    marginTop: 28,
    borderRadius: 32,
    padding: spacing.xl,
    ...shadow.lg,
  },
  stepBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: colors.gray[700],
  },
  heroPanel: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroTile: {
    flex: 1,
    height: 170,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  heroTileTall: {
    height: 220,
  },
  copyBlock: {
    marginTop: 32,
  },
  progress: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.gray[400],
  },
  title: {
    marginTop: 12,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    color: colors.gray[900],
  },
  body: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: colors.gray[600],
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 28,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.gray[200],
  },
  dotActive: {
    width: 26,
    backgroundColor: colors.brand.rose,
  },
  actions: {
    marginTop: 'auto',
  },
})
