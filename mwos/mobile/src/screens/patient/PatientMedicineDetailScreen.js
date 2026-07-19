import React from 'react'
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Badge, Button, Card, ScreenHeader } from '../../components/ui'
import { colors, spacing } from '../../components/theme'
import { usePatientExperienceStore } from '../../hooks/usePatientExperienceStore'

export default function PatientMedicineDetailScreen({ navigation, route }) {
  const medicine = route.params?.medicine
  const addToCart = usePatientExperienceStore((state) => state.addToCart)
  const usageSteps = Array.isArray(medicine?.usage_steps) ? medicine.usage_steps : []

  if (!medicine) {
    return null
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={medicine.item_name}
        subtitle={medicine.dosage || 'Clinic pharmacy item'}
        patient
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.imageShell}>
          {medicine.image_url ? (
            <Image source={{ uri: medicine.image_url }} style={styles.image} resizeMode="cover" />
          ) : (
            <Text style={styles.imageFallback}>RX</Text>
          )}
        </View>

        <Card patient>
          <View style={styles.badgeRow}>
            <Badge
              label={medicine.availability_status || 'available'}
              variant={medicine.availability_status === 'low_stock' ? 'warning' : 'success'}
            />
            {medicine.quantity !== undefined ? <Badge label={`${medicine.quantity} stock`} variant="gray" /> : null}
            {medicine.requires_prescription ? <Badge label="Prescription" variant="danger" /> : <Badge label="Pickup ready" variant="info" />}
          </View>
          <Text style={styles.title}>Medicine details</Text>
          <Text style={styles.body}>
            {medicine.purpose || medicine.usage_instructions || 'This medicine is available in the clinic inventory. Use checkout to send a pickup request to staff.'}
          </Text>

          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Dosage</Text>
            <Text style={styles.metaValue}>{medicine.dosage || 'Not specified'}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Unit</Text>
            <Text style={styles.metaValue}>{medicine.unit || 'Pack'}</Text>
          </View>
        </Card>

        <Card patient style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>How to use</Text>
          <Text style={styles.body}>
            {medicine.usage_instructions || 'No usage instructions have been added yet.'}
          </Text>
        </Card>

        {usageSteps.length ? (
          <Card patient style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Step-by-step usage</Text>
            <View style={styles.stepList}>
              {usageSteps.map((step, index) => (
                <View key={`${medicine.id}-step-${index}`} style={styles.stepRow}>
                  <View style={styles.stepIndex}>
                    <Text style={styles.stepIndexText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <Card patient style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Precautions</Text>
          <Text style={styles.body}>
            {medicine.precautions || 'No precautions were added for this entry yet.'}
          </Text>
        </Card>

        <Card patient style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Possible side effects</Text>
          <Text style={styles.body}>
            {medicine.side_effects || 'No side effects were added for this entry yet.'}
          </Text>
        </Card>

        <View style={styles.actionStack}>
          <Button
            title="Add to cart"
            variant="patient"
            onPress={() => addToCart(medicine)}
          />
          <Button
            title="Go to checkout"
            variant="secondary"
            onPress={() => navigation.navigate('PharmacyCheckout')}
          />
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
  scroll: {
    padding: spacing.lg,
    paddingBottom: 40,
    gap: spacing.sm,
  },
  imageShell: {
    height: 260,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.gray[100],
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.brand.copper,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  title: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    color: colors.gray[900],
  },
  body: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: colors.gray[600],
  },
  metaBlock: {
    marginTop: spacing.md,
  },
  metaLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.gray[400],
  },
  metaValue: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray[800],
  },
  sectionCard: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.gray[900],
  },
  stepList: {
    gap: spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  stepIndex: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.brand.blush,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepIndexText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.copper,
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.gray[600],
  },
  actionStack: {
    gap: spacing.sm,
  },
})
