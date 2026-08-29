import React from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import {
  Badge,
  Card,
  EmptyState,
  LoadingScreen,
  ScreenHeader,
  SectionHeader,
} from '../../components/ui'
import { colors, spacing } from '../../components/theme'
import PregnancyWireframeScene from '../../components/patient/PregnancyWireframeScene'
import RealtimeVitalsPanel from '../../components/patient/RealtimeVitalsPanel'

const bpVariant = (category) => {
  if (['stage2_hypertension', 'hypertensive_crisis'].includes(category)) return 'danger'
  if (category === 'elevated' || String(category || '').includes('stage1')) return 'warning'
  return 'success'
}

export default function PatientVitalsScreen() {
  const meQuery = useQuery({
    queryKey: ['patient-me-mobile-vitals'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
  })

  const vitalsQuery = useQuery({
    queryKey: ['patient-vitals-mobile-screen', meQuery.data?.id],
    queryFn: () => api.get(`/vitals/patient/${meQuery.data.id}`).then((response) => response.data.data),
    enabled: !!meQuery.data?.id,
  })

  const educationQuery = useQuery({
    queryKey: ['patient-education-mobile-vitals'],
    queryFn: () => api.get('/education').then((response) => response.data.data),
  })

  if (meQuery.isLoading || vitalsQuery.isLoading || educationQuery.isLoading) {
    return <LoadingScreen message="Loading vitals..." />
  }

  const vitals = vitalsQuery.data || []
  const activePregnancy = (meQuery.data?.pregnancies || []).find((item) => item?.status === 'active')
  const latestVitals = vitals[0]

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Vitals"
        subtitle="Realtime motion, pregnancy visualization, and recorded trend review"
        patient
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={(
          <RefreshControl
            refreshing={vitalsQuery.isRefetching || educationQuery.isRefetching}
            onRefresh={async () => {
              await Promise.all([vitalsQuery.refetch(), educationQuery.refetch()])
            }}
            tintColor={colors.brand.rose}
          />
        )}
      >
        <RealtimeVitalsPanel
          latestVitals={latestVitals}
          activePregnancy={activePregnancy}
        />

        <SectionHeader title="3D Pregnancy Status" style={{ marginTop: spacing.lg }} />
        <PregnancyWireframeScene
          dashboard={{ activePregnancy }}
          latestVitals={latestVitals}
          tips={(educationQuery.data || []).slice(0, 3)}
        />

        {latestVitals ? (
          <Card patient style={{ marginTop: spacing.lg }}>
            <Text style={styles.summaryTitle}>Latest reading summary</Text>
            <Text style={styles.summaryBody}>
              Blood pressure is currently recorded at {latestVitals.bp_systolic}/{latestVitals.bp_diastolic} mmHg,
              fetal heart rate at {latestVitals.fetal_heart_rate || 'pending'} bpm, and movement noted as {latestVitals.fetal_movement || 'not recorded'}.
            </Text>
          </Card>
        ) : null}

        <SectionHeader title="Recorded Vitals" style={{ marginTop: spacing.lg }} />
        {!vitals.length ? (
          <EmptyState
            icon="VT"
            title="No vitals recorded yet"
            subtitle="Your healthcare provider will add vital signs after clinic visits."
          />
        ) : (
          vitals.map((item) => (
            <Card key={item.id} patient style={{ marginVertical: 0 }}>
              <View style={styles.row}>
                <Text style={styles.title}>
                  {new Date(item.visit_date).toLocaleDateString('en-PH', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
                <Badge
                  label={String(item.bp_category || 'normal').replace(/_/g, ' ')}
                  variant={bpVariant(item.bp_category)}
                />
              </View>
              <View style={styles.metricGrid}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Blood pressure</Text>
                  <Text style={styles.metricValue}>{item.bp_systolic}/{item.bp_diastolic} mmHg</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Weight</Text>
                  <Text style={styles.metricValue}>{item.weight_kg ? `${item.weight_kg} kg` : 'Not recorded'}</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Fetal HR</Text>
                  <Text style={styles.metricValue}>{item.fetal_heart_rate ? `${item.fetal_heart_rate} bpm` : 'Not recorded'}</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Movement</Text>
                  <Text style={styles.metricValue}>{item.fetal_movement || 'Not recorded'}</Text>
                </View>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.brand.pearl,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 40,
    gap: spacing.sm,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  summaryBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: colors.gray[600],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[900],
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  metricItem: {
    width: '47%',
  },
  metricLabel: {
    fontSize: 11,
    color: colors.gray[400],
    textTransform: 'uppercase',
  },
  metricValue: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[800],
  },
})
