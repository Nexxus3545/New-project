import React, { useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useMutation } from '@tanstack/react-query'
import api from '../../services/api'
import { AlertBox, Badge, Button, Card, ScreenHeader } from '../../components/ui'
import { colors, spacing } from '../../components/theme'

const specialtyCopy = {
  doctor: ['Prenatal visits', 'Results review', 'Risk assessment'],
  midwife: ['Routine checkups', 'Postpartum support', 'Birth preparation'],
}

export default function PatientDoctorDetailScreen({ navigation, route }) {
  const doctor = route.params?.doctor
  const [message, setMessage] = useState('')
  const [teleconsultResult, setTeleconsultResult] = useState(null)

  const teleconsultMutation = useMutation({
    mutationFn: () => api.post('/interactions/teleconsults', {
      clinicianId: doctor.id,
      title: `${doctor.first_name} ${doctor.last_name} tele-consult`,
      reason: `Patient requested a tele-consult with ${doctor.first_name} ${doctor.last_name}.`,
      initialMessage: `Hello care team, I would like to request a tele-consult with ${doctor.first_name} ${doctor.last_name}.`,
      triggerSource: 'manual',
    }).then((response) => response.data.data),
    onSuccess: async (result) => {
      setTeleconsultResult(result)
      setMessage('Tele-consult request sent. The clinic team has been notified.')
      if (result?.meetingUrl) {
        try {
          await Linking.openURL(result.meetingUrl)
        } catch (error) {
          setMessage('Tele-consult request sent. Open the session from the link below.')
        }
      }
    },
  })

  if (!doctor) {
    return null
  }

  const specialties = specialtyCopy[doctor.role] || specialtyCopy.doctor
  const fullName = `${doctor.first_name} ${doctor.last_name}`

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={fullName}
        subtitle={`${doctor.role === 'midwife' ? 'Midwife' : 'Doctor'} • TMC Copino Birthing Home`}
        patient
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {message ? <AlertBox type="success" message={message} /> : null}
        {teleconsultResult?.meetingUrl ? (
          <Card patient>
            <Text style={styles.sectionTitle}>Tele-consult session</Text>
            <Text style={styles.paragraph}>
              A secure meeting link is ready for this consult request.
            </Text>
            <View style={{ marginTop: 12 }}>
              <Button
                title="Open tele-consult"
                variant="patient"
                onPress={() => Linking.openURL(teleconsultResult.meetingUrl)}
              />
            </View>
          </Card>
        ) : null}

        <Card patient>
          <Text style={styles.sectionTitle}>About this provider</Text>
          <Text style={styles.paragraph}>
            View clinic provider details, request consult support, and continue using the
            same MWOS appointment and messaging tools underneath.
          </Text>
          <View style={styles.badgeRow}>
            <Badge label="Available this week" variant="success" />
            <Badge label={doctor.role === 'midwife' ? 'Maternal support' : 'Clinical review'} variant="patient" />
          </View>
        </Card>

        <Card patient>
          <Text style={styles.sectionTitle}>Focus areas</Text>
          <View style={styles.list}>
            {specialties.map((item) => (
              <View key={item} style={styles.listRow}>
                <Text style={styles.listCode}>+</Text>
                <Text style={styles.listText}>{item}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card patient>
          <Text style={styles.sectionTitle}>Quick availability</Text>
          <View style={styles.slotRow}>
            {['Mon', 'Wed', 'Fri'].map((slot) => (
              <View key={slot} style={styles.slotChip}>
                <Text style={styles.slotChipText}>{slot}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.paragraph}>
            Use the booking flow to request a prenatal or follow-up visit. Clinic staff can
            adjust final times based on the shared schedule.
          </Text>
        </Card>

        <View style={styles.actionStack}>
          <Button
            title="Book consultation"
            variant="patient"
            onPress={() => navigation.navigate('PatientAppointments', {
              doctorId: doctor.id,
              doctorName: fullName,
            })}
          />
          <Button
            title={teleconsultMutation.isPending ? 'Sending request...' : 'Start tele-consult'}
            variant="secondary"
            onPress={() => teleconsultMutation.mutate()}
            loading={teleconsultMutation.isPending}
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  paragraph: {
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
  list: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  listCode: {
    width: 24,
    fontSize: 14,
    fontWeight: '700',
    color: colors.brand.copper,
  },
  listText: {
    flex: 1,
    fontSize: 13,
    color: colors.gray[700],
  },
  slotRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  slotChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.brand.blush,
  },
  slotChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.copper,
  },
  actionStack: {
    gap: spacing.sm,
  },
})
