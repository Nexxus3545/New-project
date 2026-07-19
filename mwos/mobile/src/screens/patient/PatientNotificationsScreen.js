import React from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { Badge, Card, EmptyState, LoadingScreen, ScreenHeader } from '../../components/ui'
import { colors, spacing } from '../../components/theme'

const badgeForType = (type) => {
  if (type === 'critical') return 'danger'
  if (type === 'success') return 'success'
  if (type === 'warning') return 'warning'
  return 'info'
}

export default function PatientNotificationsScreen() {
  const queryClient = useQueryClient()
  const notificationsQuery = useQuery({
    queryKey: ['patient-notifications-mobile'],
    queryFn: () => api.get('/notifications').then((response) => response.data.data),
  })

  const markReadMutation = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-notifications-mobile'] })
    },
  })

  if (notificationsQuery.isLoading) {
    return <LoadingScreen message="Loading notifications..." />
  }

  const notifications = notificationsQuery.data || []

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Notifications"
        subtitle="Clinic alerts, support updates, and activity from your care plan"
        patient
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={(
          <RefreshControl
            refreshing={notificationsQuery.isRefetching}
            onRefresh={notificationsQuery.refetch}
            tintColor={colors.brand.rose}
          />
        )}
      >
        {!notifications.length ? (
          <EmptyState
            icon="NT"
            title="No notifications yet"
            subtitle="New clinic and support updates will appear here."
          />
        ) : (
          notifications.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => {
                if (!item.is_read) {
                  markReadMutation.mutate(item.id)
                }
              }}
              activeOpacity={0.86}
            >
              <Card patient style={[styles.card, !item.is_read && styles.unreadCard]}>
                <View style={styles.cardHead}>
                  <Badge label={item.type || 'info'} variant={badgeForType(item.type)} />
                  {!item.is_read ? <Text style={styles.unreadDot}>NEW</Text> : null}
                </View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
                <Text style={styles.time}>
                  {new Date(item.created_at).toLocaleString('en-PH', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
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
    backgroundColor: colors.brand.pearl,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 40,
    gap: spacing.sm,
  },
  card: {
    marginVertical: 0,
  },
  unreadCard: {
    borderColor: colors.brand.rose,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unreadDot: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.brand.copper,
  },
  title: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '700',
    color: colors.gray[900],
  },
  body: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: colors.gray[600],
  },
  time: {
    marginTop: 12,
    fontSize: 11,
    color: colors.gray[400],
    textTransform: 'uppercase',
  },
})
