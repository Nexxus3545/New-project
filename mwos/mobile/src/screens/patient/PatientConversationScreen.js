import React, { useEffect, useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { AlertBox, Badge, Button, Card, EmptyState, LoadingScreen, ScreenHeader } from '../../components/ui'
import { colors, radius, spacing } from '../../components/theme'
import { useAuthStore } from '../../hooks/useAuthStore'

const formatMessageTime = (value) => {
  if (!value) return ''
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const telehealthStatusVariant = (status) => {
  if (status === 'active' || status === 'scheduled') return 'success'
  if (status === 'cancelled') return 'danger'
  if (status === 'completed') return 'gray'
  return 'warning'
}

export default function PatientConversationScreen({ navigation, route }) {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const threadId = route.params?.threadId
  const [draft, setDraft] = useState('')

  const threadQuery = useQuery({
    queryKey: ['patient-conversation-mobile', threadId],
    queryFn: () => api.get(`/interactions/threads/${threadId}`).then((response) => response.data.data),
    enabled: Boolean(threadId),
    refetchInterval: 30000,
  })

  const markReadMutation = useMutation({
    mutationFn: () => api.patch(`/interactions/threads/${threadId}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patient-message-threads-mobile'] }),
  })

  useEffect(() => {
    if (threadQuery.data?.id && !markReadMutation.isPending) {
      markReadMutation.mutate()
    }
  }, [threadQuery.data?.id])

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/interactions/threads/${threadId}/messages`, {
      body: draft.trim(),
      messageCategory: threadQuery.data?.thread_type === 'tele_consult' ? 'teleconsult' : 'general',
    }).then((response) => response.data.data),
    onSuccess: () => {
      setDraft('')
      queryClient.invalidateQueries({ queryKey: ['patient-conversation-mobile', threadId] })
      queryClient.invalidateQueries({ queryKey: ['patient-message-threads-mobile'] })
      queryClient.invalidateQueries({ queryKey: ['patient-telehealth-threads-mobile'] })
    },
  })

  const messages = useMemo(() => threadQuery.data?.messages || [], [threadQuery.data?.messages])

  if (!threadId) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Conversation" subtitle="Secure clinic communication" patient />
        <EmptyState title="Conversation unavailable" subtitle="Return to Messages and choose a conversation." icon="CH" />
      </View>
    )
  }

  if (threadQuery.isLoading) {
    return <LoadingScreen message="Opening secure conversation..." />
  }

  if (threadQuery.isError) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Conversation" subtitle="Secure clinic communication" patient />
        <View style={styles.errorWrap}>
          <AlertBox type="critical" message={threadQuery.error?.response?.data?.message || 'We could not load this conversation.'} />
          <Button title="Try again" variant="patient" onPress={threadQuery.refetch} />
        </View>
      </View>
    )
  }

  const thread = threadQuery.data
  const session = thread?.teleconsult_session
  const canJoin = Boolean(session?.meeting_url && ['scheduled', 'active'].includes(session?.status))
  const participants = (thread?.participants || [])
    .filter((participant) => participant.id !== user?.id)
    .map((participant) => `${participant.first_name} ${participant.last_name}`.trim())
    .filter(Boolean)

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 4 : 0}
    >
      <ScreenHeader
        title={thread?.title || route.params?.title || 'Conversation'}
        subtitle={thread?.thread_type === 'tele_consult' ? 'Telehealth consultation updates' : (participants.join(', ') || 'TMC Copino care team')}
        patient
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            refreshing={threadQuery.isRefetching}
            onRefresh={threadQuery.refetch}
            tintColor={colors.brand.rose}
          />
        )}
      >
        {thread?.thread_type === 'tele_consult' ? (
          <Card patient style={styles.telehealthCard}>
            <View style={styles.telehealthTopline}>
              <View style={{ flex: 1 }}>
                <Text style={styles.telehealthTitle}>Telehealth status</Text>
                <Text style={styles.telehealthCopy}>
                  {session?.reason || 'The clinic will share consultation instructions here.'}
                </Text>
              </View>
              <Badge label={session?.status || 'requested'} variant={telehealthStatusVariant(session?.status)} />
            </View>
            {session?.start_at ? (
              <Text style={styles.scheduleText}>Scheduled: {formatMessageTime(session.start_at)}</Text>
            ) : null}
            {canJoin ? (
              <Button
                title="Join secure consultation"
                variant="patient"
                icon="video-outline"
                onPress={() => Linking.openURL(session.meeting_url)}
                style={{ marginTop: spacing.md }}
              />
            ) : (
              <Text style={styles.waitText}>The join button appears after the clinic confirms the consultation time.</Text>
            )}
          </Card>
        ) : null}

        {messages.length ? messages.map((message) => {
          const isMine = message.sender_id === user?.id
          return (
            <View key={message.id} style={[styles.messageRow, isMine ? styles.myMessageRow : styles.teamMessageRow]}>
              <View style={[styles.messageBubble, isMine ? styles.myMessage : styles.teamMessage]}>
                {!isMine ? <Text style={styles.sender}>{message.sender_name || 'Care team'}</Text> : null}
                <Text style={[styles.messageBody, isMine && styles.myMessageBody]}>{message.body}</Text>
                <Text style={[styles.messageTime, isMine && styles.myMessageTime]}>{formatMessageTime(message.created_at)}</Text>
              </View>
            </View>
          )
        }) : (
          <EmptyState
            icon="CH"
            title="No messages yet"
            subtitle="Send the first message below. The clinic will reply in this secure conversation."
          />
        )}
      </ScrollView>

      {sendMutation.isError ? (
        <View style={styles.sendError}>
          <AlertBox type="critical" message={sendMutation.error?.response?.data?.message || 'We could not send your message. Please try again.'} />
        </View>
      ) : null}
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a secure message"
          placeholderTextColor={colors.gray[400]}
          multiline
          maxLength={2000}
          editable={!sendMutation.isPending}
          style={styles.composerInput}
          accessibilityLabel="Message to care team"
        />
        <Button
          title={sendMutation.isPending ? 'Sending' : 'Send'}
          variant="patient"
          loading={sendMutation.isPending}
          disabled={!draft.trim()}
          onPress={() => sendMutation.mutate()}
          style={styles.sendButton}
        />
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brand.pearl },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  errorWrap: { padding: spacing.lg },
  telehealthCard: { marginBottom: spacing.sm },
  telehealthTopline: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  telehealthTitle: { fontSize: 16, fontWeight: '700', color: colors.gray[900] },
  telehealthCopy: { marginTop: 6, fontSize: 13, lineHeight: 19, color: colors.gray[600] },
  scheduleText: { marginTop: spacing.md, fontSize: 12, fontWeight: '700', color: colors.brand.copper },
  waitText: { marginTop: spacing.md, fontSize: 12, lineHeight: 18, color: colors.gray[500] },
  messageRow: { flexDirection: 'row' },
  myMessageRow: { justifyContent: 'flex-end' },
  teamMessageRow: { justifyContent: 'flex-start' },
  messageBubble: { maxWidth: '84%', borderRadius: radius.xl, padding: spacing.md },
  teamMessage: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.brand.blush },
  myMessage: { backgroundColor: colors.brand.rose },
  sender: { marginBottom: 5, fontSize: 11, fontWeight: '700', color: colors.brand.copper },
  messageBody: { fontSize: 14, lineHeight: 20, color: colors.gray[800] },
  myMessageBody: { color: colors.white },
  messageTime: { marginTop: 7, fontSize: 10, color: colors.gray[400] },
  myMessageTime: { color: 'rgba(255,255,255,0.8)' },
  sendError: { paddingHorizontal: spacing.lg },
  composer: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.brand.blush, backgroundColor: colors.white },
  composerInput: { flex: 1, maxHeight: 100, minHeight: 48, borderWidth: 1, borderColor: colors.brand.blush, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 10, color: colors.gray[800], fontSize: 14, textAlignVertical: 'top' },
  sendButton: { alignSelf: 'flex-end', minWidth: 76 },
})
