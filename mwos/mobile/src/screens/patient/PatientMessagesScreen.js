import React, { useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { AlertBox, Badge, Button, Card, EmptyState, Input, LoadingScreen, ScreenHeader, SelectPicker } from '../../components/ui'
import { MobileIcon } from '../../components/Icon'
import { colors, spacing } from '../../components/theme'

const priorityOptions = [
  { label: 'Routine question', value: 'normal' },
  { label: 'Needs attention soon', value: 'high' },
]

const priorityVariant = (priority) => (
  priority === 'urgent' ? 'danger' : priority === 'high' ? 'warning' : 'info'
)

const formatThreadTime = (value) => {
  if (!value) return 'No messages yet'
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function PatientMessagesScreen({ navigation }) {
  const queryClient = useQueryClient()
  const [composerOpen, setComposerOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState('normal')

  const threadsQuery = useQuery({
    queryKey: ['patient-message-threads-mobile'],
    queryFn: () => api.get('/interactions/threads').then((response) => response.data.data),
    refetchInterval: 30000,
  })

  const threads = useMemo(
    () => (threadsQuery.data || []).filter((thread) => thread.thread_type !== 'tele_consult'),
    [threadsQuery.data]
  )

  const createThreadMutation = useMutation({
    mutationFn: () => api.post('/interactions/threads', {
      title: subject.trim() || 'Patient support request',
      initialMessage: message.trim(),
      priority,
    }).then((response) => response.data.data),
    onSuccess: (thread) => {
      setSubject('')
      setMessage('')
      setPriority('normal')
      setComposerOpen(false)
      queryClient.invalidateQueries({ queryKey: ['patient-message-threads-mobile'] })
      navigation.navigate('PatientConversation', { threadId: thread.id, title: thread.title })
    },
  })

  if (threadsQuery.isLoading) {
    return <LoadingScreen message="Loading secure messages..." />
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Messages"
        subtitle="Secure communication with the TMC Copino care team"
        patient
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            refreshing={threadsQuery.isRefetching}
            onRefresh={threadsQuery.refetch}
            tintColor={colors.brand.rose}
          />
        )}
      >
        <AlertBox
          type="warning"
          message="Messages are not for emergencies. For heavy bleeding, severe pain, breathing difficulty, seizures, or loss of consciousness, call emergency services or go to the nearest appropriate facility."
        />

        <Card patient>
          <View style={styles.composeHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Need help from the clinic?</Text>
              <Text style={styles.sectionCopy}>Start one secure thread. Clinic staff can reply and keep the conversation with your care record.</Text>
            </View>
            <MobileIcon name="message-plus-outline" size={28} color={colors.brand.copper} />
          </View>

          {composerOpen ? (
            <View style={styles.composer}>
              <Input
                label="Subject"
                value={subject}
                onChangeText={setSubject}
                placeholder="Example: Question about my prenatal visit"
                maxLength={120}
              />
              <SelectPicker label="Priority" value={priority} options={priorityOptions} onChange={setPriority} />
              <Input
                label="Message"
                value={message}
                onChangeText={setMessage}
                placeholder="Describe your question or concern. Include when it started and any instructions you have already received."
                multiline
                maxLength={2000}
                style={styles.messageInput}
              />
              {createThreadMutation.isError ? (
                <AlertBox
                  type="critical"
                  message={createThreadMutation.error?.response?.data?.message || 'We could not send your message. Please check your connection and try again.'}
                />
              ) : null}
              <View style={styles.actionRow}>
                <Button title="Cancel" variant="secondary" onPress={() => setComposerOpen(false)} style={{ flex: 1 }} />
                <Button
                  title={createThreadMutation.isPending ? 'Sending...' : 'Send securely'}
                  variant="patient"
                  loading={createThreadMutation.isPending}
                  disabled={!message.trim()}
                  onPress={() => createThreadMutation.mutate()}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : (
            <Button title="Start a new message" variant="patient" icon="message-plus-outline" onPress={() => setComposerOpen(true)} />
          )}
        </Card>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Conversations</Text>
          <Badge label={`${threads.length}`} variant="patient" />
        </View>

        {!threads.length ? (
          <EmptyState
            icon="CH"
            title="No conversations yet"
            subtitle="Use the secure message form above to contact the clinic."
          />
        ) : (
          threads.map((thread) => (
            <TouchableOpacity
              key={thread.id}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={`Open conversation: ${thread.title}`}
              onPress={() => navigation.navigate('PatientConversation', { threadId: thread.id, title: thread.title })}
            >
              <Card patient style={[styles.threadCard, thread.unread_count ? styles.unreadThread : null]}>
                <View style={styles.threadTopline}>
                  <Text style={styles.threadTitle} numberOfLines={1}>{thread.title}</Text>
                  {thread.unread_count ? <Badge label={`${thread.unread_count} new`} variant="patient" /> : null}
                </View>
                <Text style={styles.preview} numberOfLines={2}>{thread.latest_message || 'No message preview available.'}</Text>
                <View style={styles.threadMeta}>
                  <Badge label={thread.priority || 'normal'} variant={priorityVariant(thread.priority)} />
                  <Text style={styles.time}>{formatThreadTime(thread.last_message_at)}</Text>
                </View>
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
  composeHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.gray[900] },
  sectionCopy: { marginTop: 6, fontSize: 13, lineHeight: 19, color: colors.gray[600] },
  composer: { marginTop: spacing.sm },
  messageInput: { minHeight: 108, textAlignVertical: 'top' },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: 2 },
  listTitle: { fontSize: 16, fontWeight: '700', color: colors.gray[800] },
  threadCard: { marginVertical: 0 },
  unreadThread: { borderColor: colors.brand.rose },
  threadTopline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  threadTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.gray[900] },
  preview: { marginTop: 7, fontSize: 13, lineHeight: 19, color: colors.gray[600] },
  threadMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm },
  time: { flex: 1, textAlign: 'right', fontSize: 11, color: colors.gray[400] },
})
