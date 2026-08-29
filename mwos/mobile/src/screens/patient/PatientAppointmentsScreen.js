import React, { useEffect, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import {
  AlertBox,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingScreen,
  ScreenHeader,
  SelectPicker,
} from '../../components/ui'
import { colors, spacing } from '../../components/theme'

const appointmentTypeOptions = [
  { label: 'Prenatal', value: 'prenatal' },
  { label: 'Follow-up', value: 'follow_up' },
  { label: 'Lab review', value: 'lab_review' },
  { label: 'Postpartum', value: 'postpartum' },
]

const timeOptions = [
  { label: '08:00 AM', value: '08:00:00' },
  { label: '09:00 AM', value: '09:00:00' },
  { label: '10:00 AM', value: '10:00:00' },
  { label: '01:00 PM', value: '13:00:00' },
  { label: '02:00 PM', value: '14:00:00' },
  { label: '03:00 PM', value: '15:00:00' },
]

const statusVariant = {
  scheduled: 'info',
  confirmed: 'success',
  completed: 'gray',
  cancelled: 'danger',
}

export default function PatientAppointmentsScreen({ route }) {
  const queryClient = useQueryClient()
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [appointmentType, setAppointmentType] = useState('prenatal')
  const [notes, setNotes] = useState('')

  const meQuery = useQuery({
    queryKey: ['patient-me-mobile-appointments'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
  })

  const appointmentsQuery = useQuery({
    queryKey: ['patient-appointments-mobile-list'],
    queryFn: () => api.get('/appointments').then((response) => response.data.data),
  })

  const directoryQuery = useQuery({
    queryKey: ['patient-directory-mobile-appointments'],
    queryFn: () => api.get('/interactions/directory').then((response) => response.data.data),
  })

  const doctorOptions = useMemo(
    () => ((directoryQuery.data?.staff || [])
      .filter((member) => ['doctor', 'midwife'].includes(member.role))
      .map((member) => ({
        label: `${member.first_name} ${member.last_name} • ${member.role === 'midwife' ? 'Midwife' : 'Doctor'}`,
        value: member.id,
      }))),
    [directoryQuery.data]
  )

  useEffect(() => {
    if (route.params?.doctorId) {
      setAssignedTo(route.params.doctorId)
    }
  }, [route.params?.doctorId])

  const createMutation = useMutation({
    mutationFn: () => api.post('/appointments', {
      patientId: meQuery.data.id,
      pregnancyId: (meQuery.data.pregnancies || []).find((item) => item?.status === 'active')?.id,
      assignedTo: assignedTo || null,
      appointmentType,
      scheduledDate,
      scheduledTime,
      notes: notes.trim(),
    }),
    onSuccess: () => {
      setScheduledDate('')
      setScheduledTime('')
      setAppointmentType('prenatal')
      setNotes('')
      queryClient.invalidateQueries({ queryKey: ['patient-appointments-mobile-list'] })
    },
  })

  if (meQuery.isLoading || appointmentsQuery.isLoading) {
    return <LoadingScreen message="Loading appointments..." />
  }

  const appointments = appointmentsQuery.data || []

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Appointments"
        subtitle="Request a visit and review your scheduled checkups"
        patient
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={(
          <RefreshControl
            refreshing={appointmentsQuery.isRefetching || directoryQuery.isFetching}
            onRefresh={async () => {
              await Promise.all([appointmentsQuery.refetch(), directoryQuery.refetch()])
            }}
            tintColor={colors.brand.rose}
          />
        )}
      >
        {createMutation.isError ? (
          <AlertBox
            type="critical"
            message={createMutation.error?.response?.data?.message || 'Unable to schedule appointment.'}
          />
        ) : null}

        {createMutation.isSuccess ? (
          <AlertBox type="success" message="Appointment request sent successfully." />
        ) : null}

        <Card patient>
          <Text style={styles.sectionTitle}>Request appointment</Text>
          {route.params?.doctorName ? (
            <Text style={styles.prefillText}>Selected provider: {route.params.doctorName}</Text>
          ) : null}
          <Input
            label="Preferred date"
            value={scheduledDate}
            onChangeText={setScheduledDate}
            placeholder="YYYY-MM-DD"
          />
          <SelectPicker
            label="Preferred time"
            value={scheduledTime}
            options={timeOptions}
            onChange={setScheduledTime}
          />
          <SelectPicker
            label="Provider"
            value={assignedTo}
            options={doctorOptions}
            onChange={setAssignedTo}
          />
          <SelectPicker
            label="Visit type"
            value={appointmentType}
            options={appointmentTypeOptions}
            onChange={setAppointmentType}
          />
          <Input
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Any symptoms, preferences, or requests"
            multiline
            style={{ minHeight: 84, textAlignVertical: 'top' }}
          />
          <Button
            title={createMutation.isPending ? 'Sending request...' : 'Request appointment'}
            variant="patient"
            onPress={() => createMutation.mutate()}
            loading={createMutation.isPending}
            disabled={!scheduledDate || !scheduledTime}
          />
        </Card>

        {!appointments.length ? (
          <EmptyState
            icon="AP"
            title="No appointments yet"
            subtitle="Your scheduled visits will appear here after the clinic confirms them."
          />
        ) : (
          appointments.map((item) => (
            <Card key={item.id} patient style={{ marginVertical: 0 }}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>
                    {new Date(item.scheduled_date).toLocaleDateString('en-PH', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {item.scheduled_time?.slice(0, 5)} • {item.appointment_type}
                  </Text>
                  {item.assigned_to_name ? (
                    <Text style={styles.itemProvider}>Provider: {item.assigned_to_name}</Text>
                  ) : null}
                </View>
                <Badge label={item.status} variant={statusVariant[item.status] || 'gray'} />
              </View>
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: spacing.md,
  },
  prefillText: {
    marginBottom: spacing.md,
    fontSize: 12,
    color: colors.brand.copper,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[900],
  },
  itemMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.gray[500],
  },
  itemProvider: {
    marginTop: 4,
    fontSize: 12,
    color: colors.gray[600],
  },
})
