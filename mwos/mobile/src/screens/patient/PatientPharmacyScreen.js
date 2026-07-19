import React, { useMemo, useState } from 'react'
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import { Badge, EmptyState, Input, LoadingScreen, ScreenHeader } from '../../components/ui'
import { colors, radius, shadow, spacing } from '../../components/theme'
import { usePatientExperienceStore } from '../../hooks/usePatientExperienceStore'

function MedicineCard({ medicine, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.card} activeOpacity={0.86}>
      <View style={styles.thumb}>
        {medicine.image_url ? (
          <Image source={{ uri: medicine.image_url }} style={styles.image} resizeMode="cover" />
        ) : (
          <Text style={styles.thumbFallback}>RX</Text>
        )}
      </View>
      <View style={styles.cardCopy}>
        <Text style={styles.name}>{medicine.item_name}</Text>
        <Text style={styles.meta}>{medicine.dosage || medicine.unit || 'Clinic stock'}</Text>
        <Text style={styles.purpose} numberOfLines={2}>
          {medicine.purpose || medicine.usage_instructions || 'Tap to view the medicine usage details.'}
        </Text>
        <View style={styles.badges}>
          <Badge
            label={medicine.availability_status || 'available'}
            variant={medicine.availability_status === 'low_stock' ? 'warning' : 'success'}
          />
          {medicine.quantity !== undefined ? <Badge label={`${medicine.quantity} left`} variant="gray" /> : null}
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default function PatientPharmacyScreen({ navigation }) {
  const [search, setSearch] = useState('')
  const cart = usePatientExperienceStore((state) => state.cart)

  const medicinesQuery = useQuery({
    queryKey: ['patient-medicines-mobile-pharmacy'],
    queryFn: () => api.get('/medicines').then((response) => response.data.data),
  })

  const medicines = useMemo(() => {
    const source = medicinesQuery.data || []
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) return source

    return source.filter((item) => {
      const usageSteps = Array.isArray(item.usage_steps) ? item.usage_steps.join(' ') : ''
      const haystack = `${item.item_name} ${item.dosage || ''} ${item.purpose || ''} ${item.usage_instructions || ''} ${usageSteps} ${item.description || ''}`.toLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [medicinesQuery.data, search])

  if (medicinesQuery.isLoading) {
    return <LoadingScreen message="Loading pharmacy..." />
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Pharmacy"
        subtitle="Browse clinic medicines and prepare a pickup request"
        right={(
          <TouchableOpacity
            onPress={() => navigation.navigate('PharmacyCheckout')}
            style={styles.checkoutBtn}
            activeOpacity={0.84}
          >
            <Text style={styles.checkoutBtnText}>{cart.length ? `Cart ${cart.length}` : 'Cart'}</Text>
          </TouchableOpacity>
        )}
        patient
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={(
          <RefreshControl
            refreshing={medicinesQuery.isRefetching}
            onRefresh={medicinesQuery.refetch}
            tintColor={colors.brand.rose}
          />
        )}
      >
        <Input
          label="Search medicines"
          value={search}
          onChangeText={setSearch}
          placeholder="Search vitamins, supplements, or prescriptions"
        />

        {!medicines.length ? (
          <EmptyState
            icon="RX"
            title="No medicines found"
            subtitle="Try another keyword or refresh the clinic inventory."
          />
        ) : (
          medicines.map((medicine) => (
            <MedicineCard
              key={medicine.id}
              medicine={medicine}
              onPress={() => navigation.navigate('MedicineDetail', { medicine })}
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
  checkoutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  checkoutBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 40,
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    borderRadius: 24,
    padding: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    ...shadow.sm,
  },
  thumb: {
    width: 92,
    height: 92,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.gray[100],
  },
  image: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.brand.copper,
  },
  cardCopy: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.gray[900],
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.gray[500],
  },
  purpose: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: colors.gray[600],
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
})
