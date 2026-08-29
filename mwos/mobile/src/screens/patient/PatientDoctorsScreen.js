import React, { useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import { Badge, Card, EmptyState, Input, LoadingScreen, ScreenHeader } from '../../components/ui'
import { colors, spacing } from '../../components/theme'

const getRoleLabel = (role) => (role === 'midwife' ? 'Midwife' : 'Doctor')

function DoctorListCard({ doctor, aggregateRating, onPress }) {
  const initials = `${doctor.first_name?.[0] || ''}${doctor.last_name?.[0] || ''}`.trim() || 'DR'

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.86}>
      <Card patient style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{doctor.first_name} {doctor.last_name}</Text>
            <Text style={styles.role}>{getRoleLabel(doctor.role)} • TMC Copino Clinic</Text>
            <View style={styles.badgeRow}>
              <Badge label="Available" variant="success" />
              <Badge label={`${aggregateRating || '4.9'} rating`} variant="patient" />
            </View>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  )
}

export default function PatientDoctorsScreen({ navigation }) {
  const [query, setQuery] = useState('')

  const directoryQuery = useQuery({
    queryKey: ['patient-directory-mobile-doctors'],
    queryFn: () => api.get('/interactions/directory').then((response) => response.data.data),
  })

  const reviewsQuery = useQuery({
    queryKey: ['reviews-summary-mobile-doctors'],
    queryFn: () => api.get('/reviews/summary').then((response) => response.data.data),
  })

  const doctors = useMemo(() => {
    const source = (directoryQuery.data?.staff || []).filter((member) => ['doctor', 'midwife'].includes(member.role))
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return source

    return source.filter((member) => {
      const haystack = `${member.first_name} ${member.last_name} ${member.role}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [directoryQuery.data, query])

  if (directoryQuery.isLoading) {
    return <LoadingScreen message="Loading your care team..." />
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Top doctors"
        subtitle="Browse the clinic care team and open provider details"
        patient
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={(
          <RefreshControl
            refreshing={directoryQuery.isRefetching || reviewsQuery.isFetching}
            onRefresh={async () => {
              await Promise.all([directoryQuery.refetch(), reviewsQuery.refetch()])
            }}
            tintColor={colors.brand.rose}
          />
        )}
      >
        <Input
          label="Search care team"
          value={query}
          onChangeText={setQuery}
          placeholder="Search doctor or midwife"
        />

        {!doctors.length ? (
          <EmptyState
            icon="DR"
            title="No matching providers"
            subtitle="Try another name or clear your search."
          />
        ) : (
          doctors.map((doctor) => (
            <DoctorListCard
              key={doctor.id}
              doctor={doctor}
              aggregateRating={reviewsQuery.data?.average_rating}
              onPress={() => navigation.navigate('DoctorDetail', { doctor })}
            />
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
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.blush,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.brand.copper,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.gray[900],
  },
  role: {
    marginTop: 4,
    fontSize: 12,
    color: colors.gray[500],
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 10,
  },
})
