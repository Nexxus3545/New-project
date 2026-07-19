import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button } from '../../components/ui'
import { colors, radius, shadow, spacing } from '../../components/theme'

export default function PatientCheckoutSuccessScreen({ navigation, route }) {
  const itemCount = route.params?.itemCount || 0

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>OK</Text>
        </View>
        <Text style={styles.title}>Pickup request sent</Text>
        <Text style={styles.body}>
          Your pharmacy pickup request for {itemCount} item(s) was sent to the clinic support team.
        </Text>
        <Text style={styles.subBody}>
          Staff can now review it from the shared MWOS interaction center.
        </Text>

        <View style={styles.actions}>
          <Button
            title="Back to pharmacy"
            variant="patient"
            onPress={() => navigation.navigate('PatientPharmacy')}
          />
          <Button
            title="Open notifications"
            variant="secondary"
            onPress={() => navigation.navigate('PatientNotifications')}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.brand.pearl,
  },
  card: {
    width: '100%',
    borderRadius: 32,
    padding: spacing.xxl,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    ...shadow.lg,
  },
  badge: {
    width: 84,
    height: 84,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.blush,
  },
  badgeText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.brand.copper,
  },
  title: {
    marginTop: 20,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.gray[900],
  },
  body: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: colors.gray[600],
  },
  subBody: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
    color: colors.gray[500],
  },
  actions: {
    width: '100%',
    marginTop: 24,
  },
})
