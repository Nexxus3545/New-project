import React from 'react'
import {
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import { useAuthStore } from '../../hooks/useAuthStore'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ListItem,
  LoadingScreen,
  SectionHeader,
  StatCard,
} from '../../components/ui'
import { colors, radius, shadow, spacing } from '../../components/theme'
import PregnancyWireframeScene from '../../components/patient/PregnancyWireframeScene'
import RealtimeVitalsPanel from '../../components/patient/RealtimeVitalsPanel'

const formatShortDate = (value) => (
  value
    ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    : 'None'
)

function MediaIllustrationCard({ post }) {
  const previewUrl = post.poster_url || (post.media_type === 'image' ? post.media_url : null)
  const launchUrl = post.media_url || post.video_url || post.poster_url

  return (
    <TouchableOpacity
      activeOpacity={launchUrl ? 0.84 : 1}
      onPress={() => {
        if (launchUrl) {
          Linking.openURL(launchUrl)
        }
      }}
    >
      <Card patient style={styles.mediaCard}>
        <View style={styles.mediaPreview}>
          {previewUrl ? (
            <Image source={{ uri: previewUrl }} style={styles.mediaImage} resizeMode="cover" />
          ) : (
            <View style={styles.mediaFallback}>
              <Text style={styles.mediaFallbackCode}>3D</Text>
            </View>
          )}
          <View style={styles.mediaBadgeRow}>
            <Badge label={post.media_type || 'media'} variant={post.media_type === 'video' ? 'info' : 'patient'} />
            {launchUrl ? <Badge label="Open" variant="success" /> : null}
          </View>
        </View>
        <Text style={styles.mediaTitle} numberOfLines={2}>{post.title}</Text>
        <Text style={styles.mediaMeta}>
          {post.category || 'Clinic media'} | {post.engagement_views || 0} views
        </Text>
      </Card>
    </TouchableOpacity>
  )
}

function TipsPreview({ items }) {
  if (!items.length) {
    return (
      <EmptyState
        icon="ED"
        title="No tips available yet"
        subtitle="Clinic education posts will appear here."
      />
    )
  }

  return items.map((item) => (
    <Card key={item.id} style={{ marginVertical: 4 }}>
      <View style={styles.tipBadgeRow}>
        <Badge label={item.category || 'General'} variant="patient" />
        {item.trimester_target && item.trimester_target !== 'all'
          ? <Badge label={item.trimester_target} variant="gray" />
          : null}
      </View>
      <Text style={styles.tipTitle}>{item.title}</Text>
      <Text style={styles.tipBody} numberOfLines={4}>{item.content}</Text>
    </Card>
  ))
}

export default function PatientHomeScreen({ navigation }) {
  const user = useAuthStore((state) => state.user)

  const dashboardQuery = useQuery({
    queryKey: ['patient-dashboard-mobile-home'],
    queryFn: () => api.get('/reports/patient-dashboard').then((response) => response.data.data),
    refetchInterval: 60000,
  })

  const notificationsQuery = useQuery({
    queryKey: ['patient-notifications-mobile-home'],
    queryFn: () => api.get('/notifications').then((response) => response.data.data),
  })

  const educationQuery = useQuery({
    queryKey: ['patient-education-mobile-home'],
    queryFn: () => api.get('/education').then((response) => response.data.data),
  })

  const mediaQuery = useQuery({
    queryKey: ['patient-media-mobile-home'],
    queryFn: () => api.get('/media-feed/posts').then((response) => response.data.data),
  })

  if (dashboardQuery.isLoading) {
    return <LoadingScreen message="Loading your health dashboard..." />
  }

  const dashboard = dashboardQuery.data || {}
  const notifications = (notificationsQuery.data || []).slice(0, 2)
  const education = (educationQuery.data || []).slice(0, 3)
  const featuredMedia = (mediaQuery.data || []).slice(0, 2)
  const unreadCount = (notificationsQuery.data || []).filter((item) => !item.is_read).length

  const handleRefresh = async () => {
    await Promise.all([
      dashboardQuery.refetch(),
      notificationsQuery.refetch(),
      educationQuery.refetch(),
      mediaQuery.refetch(),
    ])
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.firstName}</Text>
          <Text style={styles.headerSub}>Live pregnancy visuals, moving vitals, and trimester guidance</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('PatientNotifications')}
          style={styles.headerAction}
          activeOpacity={0.82}
        >
          <Text style={styles.headerActionText}>{unreadCount ? `NT ${unreadCount}` : 'NT'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={
              dashboardQuery.isRefetching ||
              notificationsQuery.isFetching ||
              educationQuery.isFetching ||
              mediaQuery.isFetching
            }
            onRefresh={handleRefresh}
            tintColor={colors.rose[500]}
          />
        )}
      >
        <View style={styles.statsRow}>
          <StatCard
            icon="AP"
            label="Next Appointment"
            value={dashboard.nextAppointment ? formatShortDate(dashboard.nextAppointment.scheduled_date) : 'None'}
            patient
          />
          <StatCard
            icon="DD"
            label="Due Date"
            value={dashboard.activePregnancy?.edd ? formatShortDate(dashboard.activePregnancy.edd) : 'N/A'}
            patient
          />
        </View>

        <View style={[styles.statsRow, { marginTop: spacing.sm }]}>
          <StatCard
            icon="BP"
            label="Last BP"
            value={dashboard.latestVitals?.bp_systolic ? `${dashboard.latestVitals.bp_systolic}/${dashboard.latestVitals.bp_diastolic}` : '--'}
            patient
          />
          <StatCard
            icon="RP"
            label="Pending Docs"
            value={String(dashboard.documentSummary?.pending || 0)}
            patient
          />
        </View>

        {dashboard.nextAppointment ? (
          <Card patient style={{ marginTop: spacing.lg }}>
            <Text style={styles.summaryTitle}>Next clinic visit</Text>
            <Text style={styles.summaryDate}>
              {new Date(dashboard.nextAppointment.scheduled_date).toLocaleDateString('en-PH', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            <Text style={styles.summaryMeta}>
              {dashboard.nextAppointment.scheduled_time?.slice(0, 5)} - {dashboard.nextAppointment.appointment_type}
            </Text>
            <View style={styles.buttonRow}>
              <Button
                title="Open reports"
                variant="patient"
                onPress={() => navigation.navigate('PatientReports')}
                style={{ flex: 1 }}
              />
              <Button
                title="Book again"
                variant="secondary"
                onPress={() => navigation.navigate('PatientAppointments')}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        ) : null}

        <SectionHeader title="3D Pregnancy View" style={{ marginTop: spacing.lg }} />
        <PregnancyWireframeScene
          dashboard={dashboard}
          latestVitals={dashboard.latestVitals}
          tips={education}
        />

        <SectionHeader title="Realtime Vitals" style={{ marginTop: spacing.lg }} />
        <RealtimeVitalsPanel
          latestVitals={dashboard.latestVitals}
          activePregnancy={dashboard.activePregnancy}
        />

        <SectionHeader title="3D Video Illustrations" style={{ marginTop: spacing.lg }} />
        {!featuredMedia.length ? (
          <EmptyState
            icon="MD"
            title="No media yet"
            subtitle="Clinic illustrations and videos will appear here once they are published."
          />
        ) : (
          featuredMedia.map((post) => (
            <MediaIllustrationCard key={post.id} post={post} />
          ))
        )}

        <SectionHeader title="Pregnancy Tips" style={{ marginTop: spacing.lg }} />
        <TipsPreview items={education} />

        <SectionHeader title="Care Shortcuts" style={{ marginTop: spacing.lg }} />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ListItem
            leftIcon="DR"
            title="Doctors Directory"
            subtitle="Browse providers and request consult support"
            onPress={() => navigation.navigate('Doctors')}
          />
          <ListItem
            leftIcon="RX"
            title="Pharmacy"
            subtitle="Review medicines and send pickup requests"
            onPress={() => navigation.navigate('PatientPharmacy')}
          />
          <ListItem
            leftIcon="RP"
            title="Reports"
            subtitle="Open summaries, vitals, and document status"
            onPress={() => navigation.navigate('PatientReports')}
          />
          <ListItem
            leftIcon="EM"
            title="Emergency"
            subtitle="Open urgent support and clinic call actions"
            onPress={() => navigation.navigate('PatientEmergency')}
          />
        </Card>

        <SectionHeader title="Recent Notifications" style={{ marginTop: spacing.lg }} />
        {!notifications.length ? (
          <EmptyState icon="NT" title="No notifications yet" subtitle="Clinic alerts will appear here." />
        ) : (
          notifications.map((item) => (
            <Card key={item.id} patient style={{ marginVertical: 4 }}>
              <View style={styles.notificationHead}>
                <Badge
                  label={item.type || 'info'}
                  variant={item.type === 'critical' ? 'danger' : item.type === 'warning' ? 'warning' : 'info'}
                />
                {!item.is_read ? <Text style={styles.newLabel}>NEW</Text> : null}
              </View>
              <Text style={styles.tipTitle}>{item.title}</Text>
              <Text style={styles.tipBody} numberOfLines={3}>{item.body}</Text>
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
    backgroundColor: colors.gray[50],
  },
  header: {
    backgroundColor: colors.rose[600],
    paddingTop: 52,
    paddingBottom: 20,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerAction: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.white,
  },
  headerSub: {
    marginTop: 2,
    fontSize: 13,
    color: 'rgba(255,255,255,0.84)',
    maxWidth: 250,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  summaryDate: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '700',
    color: colors.brand.copper,
  },
  summaryMeta: {
    marginTop: 6,
    fontSize: 12,
    color: colors.gray[500],
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  mediaCard: {
    marginVertical: 4,
  },
  mediaPreview: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: colors.gray[100],
  },
  mediaImage: {
    width: '100%',
    height: 180,
  },
  mediaFallback: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#151922',
  },
  mediaFallbackCode: {
    fontSize: 30,
    fontWeight: '700',
    color: '#fbcfe8',
  },
  mediaBadgeRow: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  mediaTitle: {
    marginTop: spacing.md,
    fontSize: 15,
    fontWeight: '700',
    color: colors.gray[900],
  },
  mediaMeta: {
    marginTop: 5,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.gray[400],
  },
  tipBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: 8,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[900],
  },
  tipBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: colors.gray[600],
  },
  notificationHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  newLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.brand.copper,
  },
})
