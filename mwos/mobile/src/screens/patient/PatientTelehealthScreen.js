import React, { useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { AlertBox, Badge, Button, Card, EmptyState, Input, LoadingScreen, ScreenHeader, SelectPicker } from '../../components/ui'
import { MobileIcon } from '../../components/Icon'
import { colors, spacing } from '../../components/theme'

const statusVariant = (status) => {
  if (['scheduled', 'active'].includes(status)) return 'success'
  if (status === 'cancelled') return 'danger'
  if (status === 'completed') return 'gray'
  return 'warning'
}

const formatSchedule = (value) => {
  if (!value) return 'Awaiting clinic confirmation'
  return new Date(value).toLocaleString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function PatientTelehealthScreen({ navigation }) {
  const queryClient = useQueryClient()
  const [requestOpen, setRequestOpen] = useState(false)
  const [clinicianId, setClinicianId] = useState('')
  const [reason, setReason] = useState('')
  const [title, setTitle] = useState('')

  const threadsQuery = useQuery({
    queryKey: ['patient-telehealth-threads-mobile'],
    queryFn: () => api.get('/interactions/threads', { params: { threadType: 'tele_consult' } }).then((response) => response.data.data),
    refetchInterval: 30000,
  })

  const directoryQuery = useQuery({
    queryKey: ['patient-directory-mobile-telehealth'],
    queryFn: () => api.get('/interactions/directory').then((response) => response.data.data),
  })

  const clinicians = useMemo(() => (
    (directoryQuery.data?.staff || [])
      .filter((person) => ['doctor', 'midwife'].includes(person.role))
      .map((person) => ({
        value: person.id,
        label: `${person.first_name} ${person.last_name} - ${person.role === 'midwife' ? 'Midwife' : 'Doctor'}`,
      }))
  ), [directoryQuery.data])

  const requestMutation = useMutation({
    mutationFn: () => api.post('/interactions/teleconsults', {
      clinicianId,
      title: title.trim() || undefined,
      reason: reason.trim(),
      initialMessage: reason.trim(),
      triggerSource: 'manual',
    }).then((response) => response.data.data),
    onSuccess: (result) => {
      setRequestOpen(false)
      setClinicianId('')
      setReason('')
      setTitle('')
      queryClient.invalidateQueries({ queryKey: ['patient-telehealth-threads-mobile'] })
      if (result?.thread?.id) {
        navigation.navigate('PatientConversation', { threadId: result.thread.id, title: result.thread.title })
      }
    },
  })

  if (threadsQuery.isLoading || directoryQuery.isLoading) {
    return <LoadingScreen message="Loading telehealth..." />
  }

  const consultations = threadsQuery.data || []

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Telehealth"
        subtitle="Request, review, and join clinic-confirmed consultations"
        patient
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            refreshing={threadsQuery.isRefetching || directoryQuery.isRefetching}
            onRefresh={async () => {
              await Promise.all([threadsQuery.refetch(), directoryQuery.refetch()])
            }}
            tintColor={colors.brand.rose}
          />
        )}
      >
        <AlertBox
          type="warning"
          message="Telehealth is not an emergency service. If you have severe or rapidly worsening symptoms, contact emergency services or go to the nearest appropriate facility."
        />

        <Card patient>
          <View style={styles.requestHeading}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Request a consultation</Text>
              <Text style={styles.sectionCopy}>Choose a doctor or midwife, explain your concern, and wait for clinic confirmation before joining a consultation room.</Text>
            </View>
            <MobileIcon name="video-outline" size={30} color={colors.brand.copper} />
          </View>

          {requestOpen ? (
            <View style={styles.form}>
              <SelectPicker label="Doctor or midwife" value={clinicianId} options={clinicians} onChange={setClinicianId} />
              <Input
                label="Consultation title (optional)"
                value={title}
                onChangeText={setTitle}
                placeholder="Example: Prenatal follow-up"
                maxLength={120}
              />
              <Input
                label="Reason for consultation"
                value={reason}
                onChangeText={setReason}
                placeholder="Briefly describe your concern, symptoms, or follow-up question."
                multiline
                maxLength={2000}
                style={styles.reasonInput}
              />
              {requestMutation.isError ? (
                <AlertBox
                  type="critical"
                  message={requestMutation.error?.response?.data?.message || 'We could not submit this telehealth request. Please try again.'}
                />
              ) : null}
              <View style={styles.actionRow}>
                <Button title="Cancel" variant="secondary" onPress={() => setRequestOpen(false)} style={{ flex: 1 }} />
                <Button
                  title={requestMutation.isPending ? 'Submitting...' : 'Submit request'}
                  variant="patient"
                  loading={requestMutation.isPending}
                  disabled={!clinicianId || !reason.trim()}
                  onPress={() => requestMutation.mutate()}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : (
            <Button title="Request telehealth" variant="patient" icon="video-outline" onPress={() => setRequestOpen(true)} />
          )}
        </Card>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>My consultations</Text>
          <Badge label={`${consultations.length}`} variant="patient" />
        </View>

        {!consultations.length ? (
          <EmptyState
            icon="video-outline"
            title="No telehealth consultations"
            subtitle="Request a consultation above when you need non-emergency clinical guidance."
          />
        ) : (
          consultations.map((consultation) => (
            <TouchableOpacity
              key={consultation.id}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={`Open telehealth consultation: ${consultation.title}`}
              onPress={() => navigation.navigate('PatientConversation', { threadId: consultation.id, title: consultation.title })}
            >
              <Card patient style={styles.consultationCard}>
                <View style={styles.consultationTopline}>
                  <Text style={styles.consultationTitle} numberOfLines={2}>{consultation.title}</Text>
                  <Badge label={consultation.teleconsult_status || 'requested'} variant={statusVariant(consultation.teleconsult_status)} />
                </View>
                <Text style={styles.schedule}>Schedule: {formatSchedule(consultation.teleconsult_start_at)}</Text>
                <Text style={styles.preview} numberOfLines={2}>{consultation.latest_message || 'The clinic will add consultation details here.'}</Text>
                <Text style={styles.openText}>Open consultation updates</Text>
              </Card>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brand.pearl },
  scroll: { padding: spacing.lg, paddingBottom: 40, gap: spacing.sm },
  requestHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.gray[900] },
  sectionCopy: { marginTop: 6, fontSize: 13, lineHeight: 19, color: colors.gray[600] },
  form: { marginTop: spacing.sm },
  reasonInput: { minHeight: 108, textAlignVertical: 'top' },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: 2 },
  listTitle: { fontSize: 16, fontWeight: '700', color: colors.gray[800] },
  consultationCard: { marginVertical: 0 },
  consultationTopline: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  consultationTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.gray[900] },
  schedule: { marginTop: 10, fontSize: 12, fontWeight: '700', color: colors.brand.copper },
  preview: { marginTop: 7, fontSize: 13, lineHeight: 19, color: colors.gray[600] },
  openText: { marginTop: spacing.md, fontSize: 12, fontWeight: '700', color: colors.brand.copper },
})
