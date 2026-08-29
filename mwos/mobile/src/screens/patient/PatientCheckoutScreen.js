import React, { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import { AlertBox, Badge, Button, Card, EmptyState, Input, ScreenHeader } from '../../components/ui'
import { colors, spacing } from '../../components/theme'
import { usePatientExperienceStore } from '../../hooks/usePatientExperienceStore'

export default function PatientCheckoutScreen({ navigation }) {
  const cart = usePatientExperienceStore((state) => state.cart)
  const updateQuantity = usePatientExperienceStore((state) => state.updateQuantity)
  const removeFromCart = usePatientExperienceStore((state) => state.removeFromCart)
  const clearCart = usePatientExperienceStore((state) => state.clearCart)
  const [pickupNotes, setPickupNotes] = useState('')

  const meQuery = useQuery({
    queryKey: ['patient-me-mobile-checkout'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
    enabled: cart.length > 0,
  })

  const totalUnits = useMemo(
    () => cart.reduce((sum, item) => sum + (item.quantity || 1), 0),
    [cart]
  )

  const submitMutation = useMutation({
    mutationFn: () => api.post('/interactions/threads', {
      title: 'Pharmacy pickup request',
      initialMessage: [
        `Patient: ${meQuery.data?.first_name || 'Unknown'} ${meQuery.data?.last_name || ''}`.trim(),
        'Requested medicines:',
        ...cart.map((item) => `- ${item.item_name} x${item.quantity || 1}`),
        pickupNotes.trim() ? `Notes: ${pickupNotes.trim()}` : 'Notes: none',
      ].join('\n'),
      priority: 'medium',
    }),
    onSuccess: () => {
      const itemCount = totalUnits
      clearCart()
      navigation.replace('CheckoutSuccess', { itemCount })
    },
  })

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Check-out"
        subtitle="Turn your pharmacy selections into a clinic pickup request"
        patient
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {!cart.length ? (
          <EmptyState
            icon="RX"
            title="Your cart is empty"
            subtitle="Add medicines from the pharmacy screen, then return here."
          />
        ) : (
          <>
            {submitMutation.isError ? (
              <AlertBox
                type="critical"
                message={submitMutation.error?.response?.data?.message || 'Unable to send pickup request.'}
              />
            ) : null}

            <Card patient>
              <Text style={styles.sectionTitle}>Pickup summary</Text>
              <Text style={styles.sectionBody}>
                {totalUnits} medicine item(s) ready to send to the clinic support team.
              </Text>
              <View style={styles.badgeRow}>
                <Badge label="Clinic pickup" variant="patient" />
                <Badge label="MWOS support thread" variant="info" />
              </View>
            </Card>

            {cart.map((item) => (
              <Card key={item.id} patient style={{ marginVertical: 0 }}>
                <View style={styles.lineHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.item_name}</Text>
                    <Text style={styles.itemMeta}>{item.dosage || item.unit || 'Clinic stock'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeFromCart(item.id)} activeOpacity={0.84}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.quantityRow}>
                  <Button title="-" size="sm" variant="secondary" onPress={() => updateQuantity(item.id, (item.quantity || 1) - 1)} />
                  <Text style={styles.quantityValue}>Qty {item.quantity || 1}</Text>
                  <Button title="+" size="sm" variant="secondary" onPress={() => updateQuantity(item.id, (item.quantity || 1) + 1)} />
                </View>
              </Card>
            ))}

            <Card patient>
              <Input
                label="Pickup notes"
                value={pickupNotes}
                onChangeText={setPickupNotes}
                placeholder="Preferred pickup time, questions, or instructions"
                multiline
                style={{ minHeight: 96, textAlignVertical: 'top' }}
              />
            </Card>

            <View style={styles.actionStack}>
              <Button
                title={submitMutation.isPending ? 'Sending request...' : 'Send pickup request'}
                variant="patient"
                onPress={() => submitMutation.mutate()}
                loading={submitMutation.isPending}
                disabled={!meQuery.data}
              />
              <Button
                title="Back to pharmacy"
                variant="secondary"
                onPress={() => navigation.navigate('PatientPharmacy')}
              />
            </View>
          </>
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  sectionBody: {
    marginTop: 6,
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
  lineHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[900],
  },
  itemMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.gray[500],
  },
  removeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  quantityValue: {
    minWidth: 64,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[800],
  },
  actionStack: {
    gap: spacing.sm,
  },
})
