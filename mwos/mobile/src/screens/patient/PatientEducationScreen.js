import React from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import { Badge, Card, EmptyState, LoadingScreen, ScreenHeader } from '../../components/ui'
import { colors, spacing } from '../../components/theme'

export default function PatientEducationScreen() {
  const educationQuery = useQuery({
    queryKey: ['patient-education-mobile-screen'],
    queryFn: () => api.get('/education').then((response) => response.data.data),
  })

  if (educationQuery.isLoading) {
    return <LoadingScreen message="Loading education library..." />
  }

  const articles = educationQuery.data || []

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Reports and guides"
        subtitle="Maternal care education, clinic guidance, and wellness reading"
        patient
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={(
          <RefreshControl
            refreshing={educationQuery.isRefetching}
            onRefresh={educationQuery.refetch}
            tintColor={colors.brand.rose}
          />
        )}
      >
        {!articles.length ? (
          <EmptyState
            icon="ED"
            title="No education articles yet"
            subtitle="Published clinic guides will appear here when available."
          />
        ) : (
          articles.map((item) => (
            <Card key={item.id} patient style={{ marginVertical: 0 }}>
              <View style={styles.badgeRow}>
                <Badge label={item.category || 'General'} variant="patient" />
                {item.trimester_target && item.trimester_target !== 'all'
                  ? <Badge label={item.trimester_target} variant="gray" />
                  : null}
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.content}</Text>
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
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  title: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '700',
    color: colors.gray[900],
  },
  body: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: colors.gray[600],
  },
})
