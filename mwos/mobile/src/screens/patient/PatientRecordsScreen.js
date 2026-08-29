import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import { Badge, Card, EmptyState, LoadingScreen, ScreenHeader, SectionHeader } from '../../components/ui'
import { colors, spacing } from '../../components/theme'

export default function PatientRecordsScreen() {
  const meQuery = useQuery({
    queryKey: ['patient-me-mobile-records'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
  })

  const labsQuery = useQuery({
    queryKey: ['patient-labs-mobile-records', meQuery.data?.id],
    queryFn: () => api.get(`/emr/labs/${meQuery.data.id}`).then((response) => response.data.data),
    enabled: !!meQuery.data?.id,
  })

  const prescriptionsQuery = useQuery({
    queryKey: ['patient-prescriptions-mobile-records', meQuery.data?.id],
    queryFn: () => api.get(`/emr/prescriptions/${meQuery.data.id}`).then((response) => response.data.data),
    enabled: !!meQuery.data?.id,
  })

  const dashboardQuery = useQuery({
    queryKey: ['patient-dashboard-mobile-records'],
    queryFn: () => api.get('/reports/patient-dashboard').then((response) => response.data.data),
  })

  if (meQuery.isLoading || dashboardQuery.isLoading || labsQuery.isLoading || prescriptionsQuery.isLoading) {
    return <LoadingScreen message="Loading records..." />
  }

  const labs = labsQuery.data || []
  const prescriptions = prescriptionsQuery.data || []
  const immunizations = dashboardQuery.data?.recentImmunizations || []

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Records"
        subtitle="Lab results, prescriptions, and immunization history"
        patient
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <SectionHeader title="Lab results" />
        {!labs.length ? (
          <EmptyState icon="LB" title="No lab results yet" subtitle="Lab records will appear here after uploads and reviews." />
        ) : (
          labs.map((item) => (
            <Card key={item.id} patient style={{ marginVertical: 0 }}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{item.test_name}</Text>
                  <Text style={styles.meta}>
                    {new Date(item.test_date).toLocaleDateString('en-PH')} • {item.result_value} {item.unit || ''}
                  </Text>
                </View>
                <Badge label={item.status || 'pending'} variant={item.status === 'normal' ? 'success' : item.status === 'critical' ? 'danger' : 'warning'} />
              </View>
            </Card>
          ))
        )}

        <SectionHeader title="Prescriptions" style={{ marginTop: spacing.lg }} />
        {!prescriptions.length ? (
          <EmptyState icon="RX" title="No prescriptions yet" subtitle="Prescription records will appear here after clinic visits." />
        ) : (
          prescriptions.map((item) => (
            <Card key={item.id} patient style={{ marginVertical: 0 }}>
              <Text style={styles.title}>{item.medication_name}</Text>
              <Text style={styles.meta}>
                {item.dosage || 'Dose not set'} • {item.frequency || 'Frequency not set'} • {item.route || 'Route not set'}
              </Text>
              {item.instructions ? <Text style={styles.instructions}>{item.instructions}</Text> : null}
            </Card>
          ))
        )}

        <SectionHeader title="Recent immunizations" style={{ marginTop: spacing.lg }} />
        {!immunizations.length ? (
          <EmptyState icon="IM" title="No recent immunizations" subtitle="Immunization records will appear here when available." />
        ) : (
          immunizations.map((item) => (
            <Card key={item.id} patient style={{ marginVertical: 0 }}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{item.vaccine_name}</Text>
                  <Text style={styles.meta}>
                    {new Date(item.date_given).toLocaleDateString('en-PH')}
                  </Text>
                </View>
                <Badge label={`Dose ${item.dose_number || 1}`} variant="info" />
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[900],
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.gray[500],
  },
  instructions: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: colors.gray[600],
  },
})
