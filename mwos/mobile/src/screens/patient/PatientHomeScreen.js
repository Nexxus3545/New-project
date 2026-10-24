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
import { useMobileSettings } from '../../hooks/useMobileSettings'
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
import { IconTile, MobileIcon } from '../../components/Icon'
import { colors, radius, shadow, spacing } from '../../components/theme'
import SavedClinicReadings from '../../components/patient/SavedClinicReadings'
import { hasMaternalCare } from '../../utils/patientCare'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const clinicExterior = require('../../../assets/clinic/clinic-exterior.jpg')
const receptionInformation = require('../../../assets/clinic/reception-information.jpg')

const formatShortDate = (value) => (
  value
    ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    : 'None'
)

function MediaIllustrationCard({ post }) {
  const previewUrl = post.poster_url || (post.media_type === 'image' ? post.media_url : null)
  const launchUrl = post.media_url || post.video_url || post.poster_url

  const openMedia = async () => {
    if (!/^https:\/\//i.test(launchUrl || '')) return
    await Linking.openURL(launchUrl)
  }

  return (
    <TouchableOpacity
      accessibilityRole="link"
      accessibilityLabel={`Open ${post.title}`}
      disabled={!launchUrl}
      activeOpacity={launchUrl ? 0.84 : 1}
      onPress={openMedia}
    >
      <Card patient style={styles.mediaCard}>
        <View style={styles.mediaPreview}>
          {previewUrl ? (
            <Image source={{ uri: previewUrl }} style={styles.mediaImage} resizeMode="cover" />
          ) : (
            <View style={styles.mediaFallback}>
              <IconTile icon={post.media_type === 'video' ? 'play-circle-outline' : 'image-outline'} size={58} />
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

function TipsPreview({ items, onPress }) {
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
    <TouchableOpacity
      key={item.id}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open health tips, including ${item.title}`}
      activeOpacity={0.8}
    >
      <Card style={{ marginVertical: 4 }}>
        <View style={styles.tipBadgeRow}>
          <Badge label={item.category || 'General'} variant="patient" />
          {item.trimester_target && item.trimester_target !== 'all'
            ? <Badge label={item.trimester_target} variant="gray" />
            : null}
          <View style={{ flex: 1 }} />
          <MobileIcon name="chevron-right" size={20} color={colors.gray[400]} />
        </View>
        <Text style={styles.tipTitle}>{item.title}</Text>
        <Text style={styles.tipBody} numberOfLines={4}>{item.content}</Text>
      </Card>
    </TouchableOpacity>
  ))
}

export default function PatientHomeScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const user = useAuthStore((state) => state.user)
  const contentPreferences = useMobileSettings((state) => state.preferences)

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
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 24) }]}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.firstName}</Text>
          <Text style={styles.headerSub}>Appointments, saved vital-sign summaries, and trimester guidance</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('PatientNotifications')}
          style={styles.headerAction}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
        >
          <MobileIcon name="bell-outline" size={22} color={colors.white} />
          {unreadCount ? <View style={styles.notificationCount}><Text style={styles.notificationCountText}>{unreadCount > 9 ? '9+' : unreadCount}</Text></View> : null}
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
            onPress={() => navigation.navigate('PatientAppointments')}
          />
          <StatCard
            icon="DD"
            label={hasMaternalCare({ ...dashboard.patientProfile, activePregnancy: dashboard.activePregnancy }) ? 'Due Date' : 'Care type'}
            value={hasMaternalCare({ ...dashboard.patientProfile, activePregnancy: dashboard.activePregnancy }) ? (dashboard.activePregnancy?.edd ? formatShortDate(dashboard.activePregnancy.edd) : 'Not recorded') : 'General clinic care'}
            patient
            onPress={() => navigation.navigate('PatientVitals')}
          />
        </View>

        <View style={[styles.statsRow, { marginTop: spacing.sm }]}>
          <StatCard
            icon="BP"
            label="Last BP"
            value={dashboard.latestVitals?.bp_systolic ? `${dashboard.latestVitals.bp_systolic}/${dashboard.latestVitals.bp_diastolic}` : '--'}
            patient
            onPress={() => navigation.navigate('PatientVitals')}
          />
          <StatCard
            icon="RP"
            label="Pending Docs"
            value={String(dashboard.documentSummary?.pending || 0)}
            patient
            onPress={() => navigation.navigate('Profile')}
          />
        </View>

        <View style={styles.clinicImageGrid}>
          <TouchableOpacity onPress={() => navigation.navigate('PatientAppointments')} activeOpacity={0.82} accessibilityRole="button" accessibilityLabel="Open appointments">
            <Card patient style={styles.clinicImageCard}>
              <Image source={clinicExterior} style={styles.clinicImage} resizeMode="cover" />
              <Text style={styles.clinicImageTitle}>TMC Copino Birthing Home</Text>
              <Text style={styles.clinicImageText}>Use this portal for visits, records, documents, messages, and health education connected to your clinic profile.</Text>
            </Card>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')} activeOpacity={0.82} accessibilityRole="button" accessibilityLabel="Open profile and documents">
            <Card patient style={styles.clinicImageCard}>
              <Image source={receptionInformation} style={styles.clinicImage} resizeMode="cover" />
              <Text style={styles.clinicImageTitle}>Before your visit</Text>
              <Text style={styles.clinicImageText}>Review appointment details, document status, and requirements before going to the information desk.</Text>
            </Card>
          </TouchableOpacity>
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

        <SectionHeader title="Latest saved vitals" style={{ marginTop: spacing.lg }} />
        <SavedClinicReadings
          latestVitals={dashboard.latestVitals}
          includeMaternal={hasMaternalCare({ ...dashboard.patientProfile, activePregnancy: dashboard.activePregnancy })}
        />

        {contentPreferences.showClinicMedia ? <>
        <SectionHeader title="Health Tips & Education" style={{ marginTop: spacing.lg }} />
        <Button title="Clinic videos & community events" variant="secondary" icon="video-outline"
          onPress={() => Linking.openURL('https://www.facebook.com/people/TMC-Copino-Birthing-Home/61575314979762/')}
          style={{ marginBottom: spacing.sm }} />
        <Button title="Summer Tuli 2026 replay on Facebook" variant="secondary" icon="play-circle-outline"
          onPress={() => Linking.openURL('https://www.facebook.com/reel/2538336333249251/')}
          style={{ marginBottom: spacing.sm }} />
        <Text style={{ color: colors.gray[500], fontSize: 12, marginBottom: spacing.sm }}>
          Past clinic event, not a livestream. Opens the original public video.
        </Text>
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

        </> : null}

        {contentPreferences.showTips ? <>
        <SectionHeader title="Health Tips" style={{ marginTop: spacing.lg }} />
        <TipsPreview items={education} onPress={() => navigation.navigate('PatientEducation')} />
        </> : null}

        <SectionHeader title="Care Shortcuts" style={{ marginTop: spacing.lg }} />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ListItem
            leftIcon="DR"
            title="Doctors Directory"
            subtitle="Browse providers and request consult support"
            onPress={() => navigation.navigate('Doctors')}
          />
          <ListItem
            leftIcon="CH"
            title="Messages"
            subtitle="Contact the clinic care team securely"
            onPress={() => navigation.navigate('PatientMessages')}
          />
          <ListItem
            leftIcon="video-outline"
            title="Telehealth"
            subtitle="Request or join a confirmed virtual consultation"
            onPress={() => navigation.navigate('PatientTelehealth')}
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
            leftIcon="MR"
            title="Medical records"
            subtitle="Review prenatal visits and clinical records"
            onPress={() => navigation.navigate('PatientRecords')}
          />
          <ListItem
            leftIcon="HT"
            title="Health tips"
            subtitle="Open clinic-approved education and guidance"
            onPress={() => navigation.navigate('PatientEducation')}
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
            <TouchableOpacity key={item.id} onPress={() => navigation.navigate('PatientNotifications')} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Open notification: ${item.title}`}>
              <Card patient style={{ marginVertical: 4 }}>
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
            </TouchableOpacity>
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
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notificationCount: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  notificationCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.brand.copper,
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
  clinicImageGrid: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  clinicImageCard: {
    padding: 0,
    overflow: 'hidden',
  },
  clinicImage: {
    width: '100%',
    height: 150,
  },
  clinicImageTitle: {
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    fontSize: 15,
    fontWeight: '700',
    color: colors.gray[900],
  },
  clinicImageText: {
    marginTop: 6,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    fontSize: 13,
    lineHeight: 19,
    color: colors.gray[600],
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
