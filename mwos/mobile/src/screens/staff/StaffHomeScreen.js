import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Image,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import api from '../../services/api'
import { useAuthStore } from '../../hooks/useAuthStore'
import {
  Card,
  StatCard,
  SectionHeader,
  LoadingScreen,
  AlertBox,
  Badge,
  Input,
} from '../../components/ui'
import { colors, spacing, radius, shadow } from '../../components/theme'

const logo = require('../../../assets/icon.png')

const resultTypeMeta = {
  media: { label: 'Media Feed', variant: 'info' },
  medicine: { label: 'Medicine', variant: 'success' },
  inventory: { label: 'Inventory', variant: 'warning' },
  patient: { label: 'Patient', variant: 'danger' },
  record: { label: 'Record', variant: 'gray' },
}

function RecommendationCard({ item }) {
  const palette = item.priority === 'high'
    ? { bg: '#fff1f2', border: '#fecdd3', text: colors.rose[700] }
    : item.priority === 'medium'
      ? { bg: '#fffbeb', border: '#fde68a', text: '#92400e' }
      : { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' }

  return (
    <View style={[styles.recommendationCard, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <View style={styles.recommendationHead}>
        <Text style={[styles.recommendationType, { color: palette.text }]}>{String(item.type || 'guide').toUpperCase()}</Text>
        <Badge label={item.priority || 'info'} variant="gray" />
      </View>
      <Text style={styles.recommendationTitle}>{item.title}</Text>
      <Text style={styles.recommendationBody}>{item.description}</Text>
      {item.route ? <Text style={styles.recommendationRoute}>Suggested screen: {item.route}</Text> : null}
    </View>
  )
}

function FeedPreviewCard({ post }) {
  const previewImage = post.poster_url || post.thumbnail_url || (post.media_type === 'image' ? post.media_url : null)

  return (
    <View style={styles.feedCard}>
      <View style={styles.feedMediaShell}>
        {previewImage ? (
          <Image source={{ uri: previewImage }} style={styles.feedImage} resizeMode="cover" />
        ) : (
          <View style={styles.feedPlaceholder}>
            <Text style={styles.feedPlaceholderText}>{post.media_type === 'video' ? 'VIDEO' : 'IMAGE'}</Text>
          </View>
        )}
        <View style={styles.feedOverlay}>
          <Badge label={post.media_type || 'media'} variant={post.media_type === 'image' ? 'patient' : 'info'} />
        </View>
      </View>
      <View style={styles.feedCopy}>
        <Text style={styles.feedTitle} numberOfLines={2}>{post.title}</Text>
        <Text style={styles.feedMeta}>{post.category || 'General'} | {post.engagement_views || 0} views</Text>
        <Text style={styles.feedBody} numberOfLines={2}>{post.description || 'Clinic educational media.'}</Text>
      </View>
    </View>
  )
}

function SearchResultCard({ result }) {
  const meta = resultTypeMeta[result.result_type] || resultTypeMeta.record
  return (
    <View style={styles.searchResultCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.searchResultTitle}>{result.title}</Text>
        <Text style={styles.searchResultMeta}>{result.category || meta.label}</Text>
      </View>
      <Badge label={meta.label} variant={meta.variant} />
    </View>
  )
}

export default function StaffHomeScreen({ navigation }) {
  const user = useAuthStore((state) => state.user)
  const { logout } = useAuthStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 250)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const dashboardQuery = useQuery({
    queryKey: ['dashboard-mobile'],
    queryFn: () => api.get('/reports/dashboard').then((response) => response.data.data),
    refetchInterval: 60000,
  })

  const recommendationsQuery = useQuery({
    queryKey: ['ai-recommendations-mobile-staff'],
    queryFn: () => api.get('/ai/recommendations').then((response) => response.data.data),
  })

  const mediaQuery = useQuery({
    queryKey: ['media-feed-mobile-staff'],
    queryFn: () => api.get('/media-feed/posts').then((response) => response.data.data),
  })

  const searchQuery = useQuery({
    queryKey: ['ai-search-mobile-staff', debouncedSearch],
    queryFn: () => api.get('/ai/search', { params: { q: debouncedSearch } }).then((response) => response.data.data),
    enabled: debouncedSearch.length >= 2,
  })

  const { data, isLoading, refetch, isRefetching, error } = dashboardQuery

  if (isLoading) return <LoadingScreen message="Loading dashboard..." />

  const stats = data?.stats || {}
  const todayAppointments = data?.todayAppointments || []
  const recommendations = recommendationsQuery.data?.suggestions || []
  const featuredMedia = (recommendationsQuery.data?.featuredMedia || mediaQuery.data || []).slice(0, 4)
  const searchResults = searchQuery.data || []

  const handleRefresh = async () => {
    await Promise.all([
      refetch(),
      recommendationsQuery.refetch(),
      mediaQuery.refetch(),
      searchQuery.refetch(),
    ])
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.orbA} />
      <View style={styles.orbB} />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <View style={styles.logoShell}>
              <Image source={logo} style={styles.logo} resizeMode="cover" />
            </View>
            <View>
              <Text style={styles.greeting}>Good day, {user?.firstName}</Text>
              <Text style={styles.headerSub}>TMC Copino care command center</Text>
            </View>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Exit</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.headerGlass}>
          <Text style={styles.headerTitle}>A purpose-built mobile dashboard with the same MWOS logic</Text>
          <Text style={styles.headerDesc}>Search records, review care priorities, track appointments, and move through the same clinic workflow used on web and desktop.</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching || recommendationsQuery.isFetching || mediaQuery.isFetching || searchQuery.isFetching} onRefresh={handleRefresh} tintColor={colors.brand.rose} />}
      >
        {error && <AlertBox type="critical" message={error.response?.data?.message || 'Failed to load dashboard'} />}

        {stats.recentAlerts > 0 && (
          <AlertBox
            type="critical"
            message={`${stats.recentAlerts} recent vital alert${stats.recentAlerts > 1 ? 's' : ''}. Review patient vitals as soon as possible.`}
          />
        )}

        <SectionHeader title="Overview" />
        <View style={styles.statsGrid}>
          <StatCard icon="PT" label="Patients" value={stats.totalPatients} color="teal" />
          <StatCard icon="PG" label="Pregnancies" value={stats.activePregnancies} color="blue" />
        </View>
        <View style={[styles.statsGrid, { marginTop: spacing.sm }]}> 
          <StatCard icon="AP" label="Today" value={stats.todayAppointments} color="teal" />
          <StatCard icon="DL" label="This Month" value={stats.deliveriesThisMonth} color="teal" />
        </View>
        <View style={[styles.statsGrid, { marginTop: spacing.sm }]}> 
          <StatCard icon="CH" label="Threads" value={stats.unreadThreads} color="blue" />
          <StatCard icon="TK" label="Tasks" value={stats.openCareTasks} color="amber" />
        </View>

        <SectionHeader title="Unified Search" />
        <Card>
          <Input
            label="Search medicines, feed posts, patients, and records"
            placeholder="Try ferrous sulfate, PhilHealth, prenatal guide"
            value={searchTerm}
            onChangeText={setSearchTerm}
            style={{ marginBottom: 0 }}
          />
          {debouncedSearch.length < 2 ? (
            <Text style={styles.emptyText}>Enter at least 2 characters to search the shared workspace.</Text>
          ) : searchQuery.isFetching ? (
            <Text style={styles.emptyText}>Searching...</Text>
          ) : searchResults.length === 0 ? (
            <Text style={styles.emptyText}>No matching records yet for "{debouncedSearch}".</Text>
          ) : (
            <View style={styles.stackGap}>
              {searchResults.slice(0, 4).map((result) => (
                <SearchResultCard key={`${result.result_type}-${result.id}`} result={result} />
              ))}
            </View>
          )}
        </Card>

        <SectionHeader title="Priority Actions" />
        {recommendations.length === 0 ? (
          <Card><Text style={styles.emptyText}>Recommendations will appear here as staff activity grows.</Text></Card>
        ) : (
          <View style={styles.stackGap}>
            {recommendations.map((item) => <RecommendationCard key={item.id} item={item} />)}
          </View>
        )}

        <SectionHeader title="Featured Health Feed" action="Refresh" onAction={() => mediaQuery.refetch()} />
        {featuredMedia.length === 0 ? (
          <Card><Text style={styles.emptyText}>No educational media uploaded yet.</Text></Card>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.feedRail}>
            {featuredMedia.map((post) => <FeedPreviewCard key={post.id} post={post} />)}
          </ScrollView>
        )}

        <SectionHeader title="Today's Appointments" action="View All" onAction={() => navigation.navigate('Appointments')} />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {todayAppointments.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyText}>No appointments scheduled today.</Text>
            </View>
          ) : (
            todayAppointments.map((appointment, index) => (
              <View key={`${appointment.patient_name}-${index}`} style={[styles.appointmentRow, index === todayAppointments.length - 1 && { borderBottomWidth: 0 }]}> 
                <View style={styles.appointmentTime}>
                  <Text style={styles.appointmentTimeText}>{appointment.scheduled_time?.slice(0, 5)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.appointmentName}>{appointment.patient_name}</Text>
                  <Text style={styles.appointmentType}>{appointment.appointment_type}</Text>
                </View>
                <Badge
                  label={appointment.risk_level || 'low'}
                  variant={appointment.risk_level === 'high' ? 'danger' : appointment.risk_level === 'moderate' ? 'warning' : 'success'}
                />
              </View>
            ))
          )}
        </Card>

        <SectionHeader title="Quick Actions" />
        <View style={styles.quickActions}>
          {[
            { label: 'Patients', screen: 'Patients', code: 'PT' },
            { label: 'Schedule', screen: 'Appointments', code: 'AP' },
            { label: 'Deliveries', screen: 'Deliveries', code: 'DL' },
            { label: 'Medicines', screen: 'Inventory', code: 'RX' },
          ].map((action) => (
            <TouchableOpacity
              key={action.screen}
              onPress={() => navigation.navigate(action.screen)}
              style={styles.quickBtn}
              activeOpacity={0.84}
            >
              <View style={styles.quickBadge}><Text style={styles.quickCode}>{action.code}</Text></View>
              <Text style={styles.quickBtnLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.brand.pearl,
  },
  orbA: {
    position: 'absolute',
    top: -70,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(201,137,148,0.2)',
  },
  orbB: {
    position: 'absolute',
    bottom: 100,
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: 'rgba(15,118,110,0.12)',
  },
  header: {
    paddingTop: 52,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoShell: {
    width: 64,
    height: 64,
    borderRadius: 22,
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.72)',
    ...shadow.md,
  },
  logo: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.brand.copper,
  },
  headerSub: {
    marginTop: 2,
    fontSize: 12,
    color: colors.gray[500],
  },
  logoutBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.copper,
  },
  headerGlass: {
    marginTop: 16,
    borderRadius: radius.xl,
    padding: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    ...shadow.md,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  headerDesc: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    color: colors.gray[600],
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 124,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  stackGap: {
    gap: spacing.sm,
  },
  recommendationCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    ...shadow.sm,
  },
  recommendationHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  recommendationType: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  recommendationTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  recommendationBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: colors.gray[600],
  },
  recommendationRoute: {
    marginTop: 10,
    fontSize: 11,
    color: colors.gray[400],
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  feedRail: {
    gap: spacing.md,
    paddingRight: spacing.md,
  },
  feedCard: {
    width: 246,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    ...shadow.md,
  },
  feedMediaShell: {
    position: 'relative',
    height: 220,
    backgroundColor: colors.gray[100],
  },
  feedImage: {
    width: '100%',
    height: '100%',
  },
  feedPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.blush,
  },
  feedPlaceholderText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.copper,
    letterSpacing: 1.2,
  },
  feedOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  feedCopy: {
    padding: spacing.md,
    gap: 4,
  },
  feedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[900],
  },
  feedMeta: {
    fontSize: 11,
    color: colors.gray[400],
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  feedBody: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.gray[600],
  },
  searchResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gray[100],
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  searchResultTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray[900],
  },
  searchResultMeta: {
    marginTop: 2,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.gray[400],
  },
  emptyBlock: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: colors.gray[500],
  },
  appointmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
    gap: 12,
  },
  appointmentTime: {
    minWidth: 56,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.brand.blush,
    alignItems: 'center',
  },
  appointmentTimeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.copper,
    fontVariant: ['tabular-nums'],
  },
  appointmentName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray[900],
  },
  appointmentType: {
    fontSize: 12,
    color: colors.gray[500],
    marginTop: 1,
    textTransform: 'capitalize',
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickBtn: {
    flex: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    ...shadow.sm,
  },
  quickBadge: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    backgroundColor: colors.brand.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCode: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.copper,
  },
  quickBtnLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[700],
    textAlign: 'center',
  },
})
