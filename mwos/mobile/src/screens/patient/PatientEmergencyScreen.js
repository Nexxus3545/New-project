import React, { useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import { AlertBox, Badge, Button, Card, LoadingScreen, ScreenHeader } from '../../components/ui'
import { colors, spacing } from '../../components/theme'

export default function PatientEmergencyScreen() {
  const [message, setMessage] = useState('')

  const meQuery = useQuery({
    queryKey: ['patient-me-mobile-emergency'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
  })

  const emergencyMutation = useMutation({
    mutationFn: () => api.post('/interactions/threads', {
      title: 'Urgent support request',
      initialMessage: 'Hello care team, I need urgent assistance and would like emergency guidance right away.',
      priority: 'high',
    }),
    onSuccess: () => {
      setMessage('Urgent support request sent. The clinic team has been notified.')
    },
  })

  if (meQuery.isLoading) {
    return <LoadingScreen message="Loading emergency contacts..." />
  }

  const patient = meQuery.data || {}
  const emergencyContact = patient.emergency_contact_phone || '911'
  const clinicContact = '0917-000-0000'

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Ambulance"
        subtitle="Emergency support, clinic contact, and urgent care guidance"
        patient
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {message ? <AlertBox type="success" message={message} /> : null}

        <Card patient>
          <Text style={styles.title}>Immediate steps</Text>
          <Text style={styles.body}>
            If you are experiencing heavy bleeding, loss of consciousness, or severe difficulty
            breathing, contact emergency services immediately and proceed to the nearest hospital.
          </Text>
          <View style={styles.badgeRow}>
            <Badge label="Priority support" variant="danger" />
            <Badge label="Clinic follow-up" variant="patient" />
          </View>
        </Card>

        <Card patient>
          <Text style={styles.title}>Call for help</Text>
          <View style={styles.actionStack}>
            <Button
              title={`Call emergency: ${emergencyContact}`}
              variant="patient"
              onPress={() => Linking.openURL(`tel:${emergencyContact}`)}
            />
            <Button
              title={`Call clinic: ${clinicContact}`}
              variant="secondary"
              onPress={() => Linking.openURL(`tel:${clinicContact}`)}
            />
          </View>
        </Card>

        <Card patient>
          <Text style={styles.title}>Send urgent clinic request</Text>
          <Text style={styles.body}>
            This creates a high-priority support thread so staff can respond from the shared MWOS system.
          </Text>
          <Button
            title={emergencyMutation.isPending ? 'Sending urgent request...' : 'Request urgent support'}
            variant="patient"
            onPress={() => emergencyMutation.mutate()}
            loading={emergencyMutation.isPending}
            style={{ marginTop: spacing.md }}
          />
        </Card>
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
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  body: {
    marginTop: 8,
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
  actionStack: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
})
