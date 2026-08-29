import React, { useMemo } from 'react'
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { LineChart } from 'react-native-chart-kit'
import api from '../../services/api'
import { Badge, Button, Card, EmptyState, LoadingScreen, ScreenHeader } from '../../components/ui'
import { colors, spacing } from '../../components/theme'

const chartWidth = Dimensions.get('window').width - 64

function ReportLink({ label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.reportLink} activeOpacity={0.84}>
      <Text style={styles.reportLinkLabel}>{label}</Text>
      <Text style={styles.reportLinkArrow}>{'>'}</Text>
    </TouchableOpacity>
  )
}

export default function PatientReportsScreen({ navigation }) {
  const meQuery = useQuery({
    queryKey: ['patient-me-mobile-reports'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
  })

  const dashboardQuery = useQuery({
    queryKey: ['patient-dashboard-mobile-reports'],
    queryFn: () => api.get('/reports/patient-dashboard').then((response) => response.data.data),
  })

  const vitalsQuery = useQuery({
    queryKey: ['patient-vitals-mobile-reports', meQuery.data?.id],
    queryFn: () => api.get(`/vitals/patient/${meQuery.data.id}`).then((response) => response.data.data),
    enabled: !!meQuery.data?.id,
  })

  if (meQuery.isLoading || dashboardQuery.isLoading) {
    return <LoadingScreen message="Loading reports..." />
  }

  const dashboard = dashboardQuery.data || {}
  const vitals = vitalsQuery.data || []
  const chartVitals = useMemo(
    () => [...vitals].slice(0, 5).reverse(),
    [vitals]
  )

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Reports"
        subtitle="Vitals, summaries, and patient records from your MWOS account"
        patient
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.metricRow}>
          <Card patient style={styles.metricCard}>
            <Text style={styles.metricLabel}>Verified docs</Text>
            <Text style={styles.metricValue}>{dashboard.documentSummary?.verified || 0}</Text>
          </Card>
          <Card patient style={styles.metricCard}>
            <Text style={styles.metricLabel}>Unread care threads</Text>
            <Text style={styles.metricValue}>{dashboard.unreadMessages || 0}</Text>
          </Card>
        </View>

        <Card patient>
          <Text style={styles.sectionTitle}>Care summary</Text>
          <Text style={styles.sectionBody}>
            Next appointment: {dashboard.nextAppointment
              ? new Date(dashboard.nextAppointment.scheduled_date).toLocaleDateString('en-PH', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'No appointment scheduled'}
          </Text>
          <View style={styles.badgeRow}>
            <Badge
              label={dashboard.activePregnancy?.risk_level ? `${dashboard.activePregnancy.risk_level} risk` : 'Care plan'}
              variant={dashboard.activePregnancy?.risk_level === 'high' ? 'danger' : 'patient'}
            />
            <Badge label={`${dashboard.documentSummary?.pending || 0} pending docs`} variant="warning" />
          </View>
        </Card>

        <Card patient>
          <Text style={styles.sectionTitle}>Vitals trend</Text>
          {!chartVitals.length ? (
            <EmptyState
              icon="VT"
              title="No vitals trend yet"
              subtitle="Your clinic will populate this after visits are recorded."
            />
          ) : (
            <>
              <Text style={styles.sectionBody}>
                Recent systolic readings from your last clinic visits.
              </Text>
              <LineChart
                data={{
                  labels: chartVitals.map((item) => new Date(item.visit_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })),
                  datasets: [
                    {
                      data: chartVitals.map((item) => item.bp_systolic || 0),
                    },
                    {
                      data: chartVitals.map((item) => item.bp_diastolic || 0),
                      color: () => colors.brand.copper,
                    },
                  ],
                  legend: ['Systolic', 'Diastolic'],
                }}
                width={chartWidth}
                height={220}
                bezier
                withShadow={false}
                withInnerLines={false}
                withOuterLines={false}
                chartConfig={{
                  backgroundColor: colors.white,
                  backgroundGradientFrom: colors.white,
                  backgroundGradientTo: colors.white,
                  decimalPlaces: 0,
                  color: () => colors.brand.rose,
                  labelColor: () => colors.gray[500],
                  propsForDots: {
                    r: '4',
                    strokeWidth: '2',
                    stroke: colors.brand.rose,
                  },
                }}
                style={styles.chart}
              />
            </>
          )}
        </Card>

        <Card patient>
          <Text style={styles.sectionTitle}>Detailed reports</Text>
          <View style={styles.linkStack}>
            <ReportLink label="My appointments" onPress={() => navigation.navigate('PatientAppointments')} />
            <ReportLink label="My vitals" onPress={() => navigation.navigate('PatientVitals')} />
            <ReportLink label="My records" onPress={() => navigation.navigate('PatientRecords')} />
            <ReportLink label="Health education" onPress={() => navigation.navigate('PatientEducation')} />
          </View>
        </Card>

        <Button
          title="Open profile"
          variant="secondary"
          onPress={() => navigation.navigate('PatientProfile')}
        />
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
  metricRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.gray[400],
    textAlign: 'center',
  },
  metricValue: {
    marginTop: 10,
    fontSize: 24,
    fontWeight: '700',
    color: colors.gray[900],
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  sectionBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: colors.gray[600],
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chart: {
    marginTop: spacing.md,
    borderRadius: 24,
    paddingRight: 8,
  },
  linkStack: {
    marginTop: spacing.md,
  },
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  reportLinkLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray[800],
  },
  reportLinkArrow: {
    fontSize: 16,
    color: colors.gray[400],
  },
})
