import React, { useEffect, useRef, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as Location from 'expo-location'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { AlertBox, Badge, Button, Card, LoadingScreen, ScreenHeader } from '../../components/ui'
import { colors, spacing } from '../../components/theme'

const googleMapsUrl = (latitude, longitude) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`

export default function PatientEmergencyScreen() {
  const queryClient = useQueryClient()
  const locationSubscription = useRef(null)
  const lastSentAt = useRef(0)
  const sharingRef = useRef(false)
  const [message, setMessage] = useState('')
  const [locationState, setLocationState] = useState('idle')
  const [locationError, setLocationError] = useState('')
  const [liveLocation, setLiveLocation] = useState(null)

  const meQuery = useQuery({
    queryKey: ['patient-me-mobile-emergency'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
  })
  const sharedLocationQuery = useQuery({
    queryKey: ['emergency-location-mobile'],
    queryFn: () => api.get('/emergency/location/me').then((response) => response.data.data),
    refetchInterval: locationState === 'sharing' ? 30000 : false,
  })

  const locationMutation = useMutation({
    mutationFn: (payload) => api.post('/emergency/location', payload).then((response) => response.data.data),
    onSuccess: (data) => {
      setLiveLocation(data)
      setLocationState('sharing')
      setLocationError('')
      queryClient.setQueryData(['emergency-location-mobile'], data)
    },
    onError: (error) => setLocationError(error.response?.data?.message || 'We could not share your device location. Please check your connection and try again.'),
  })

  const stopLocationMutation = useMutation({
    mutationFn: () => api.delete('/emergency/location'),
    onSuccess: () => {
      setLiveLocation(null)
      setLocationState('idle')
      setLocationError('')
      queryClient.setQueryData(['emergency-location-mobile'], null)
    },
    onError: (error) => setLocationError(error.response?.data?.message || 'We stopped device tracking, but could not confirm that the saved share was removed. Please try again.'),
  })

  const sharedLocation = liveLocation || sharedLocationQuery.data
  const isSharing = Boolean(sharedLocation)

  const emergencyMutation = useMutation({
    mutationFn: () => api.post('/interactions/threads', {
      title: 'Urgent support request',
      initialMessage: [
        'Hello care team, I need urgent assistance and would like emergency guidance right away.',
        sharedLocation
          ? `Live GPS shared: ${sharedLocation.latitude}, ${sharedLocation.longitude}${sharedLocation.accuracyMeters ? ` (accuracy about ${Math.round(sharedLocation.accuracyMeters)} m)` : ''}`
          : 'Live GPS was not shared. Please call me to confirm the pickup location.',
      ].join('\n'),
      priority: 'urgent',
    }),
    onSuccess: () => setMessage('Urgent support request sent. The clinic team has been notified.'),
  })

  const clearDeviceLocationWatch = () => {
    locationSubscription.current?.remove?.()
    locationSubscription.current = null
    sharingRef.current = false
  }

  const stopSharing = () => {
    clearDeviceLocationWatch()
    setLocationState('idle')
    stopLocationMutation.mutate()
  }

  const startSharing = async () => {
    try {
      setLocationError('')
      setLocationState('requesting')

      const permission = await Location.requestForegroundPermissionsAsync()
      if (permission.status !== 'granted') {
        setLocationState('idle')
        setLocationError('Location permission was not granted. You can still call the clinic and describe your pickup point.')
        return
      }

      sharingRef.current = true
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 10,
        },
        (position) => {
          if (!sharingRef.current) return

          const payload = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
            consent: true,
          }
          setLiveLocation({ ...payload, sharedAt: new Date().toISOString() })
          setLocationState('sharing')

          const now = Date.now()
          if (now - lastSentAt.current >= 10000) {
            lastSentAt.current = now
            locationMutation.mutate(payload)
          }
        }
      )
    } catch {
      setLocationState('idle')
      setLocationError('We could not start location sharing. Please check your device location services and try again.')
    }
  }

  useEffect(() => () => {
    const wasSharing = sharingRef.current
    clearDeviceLocationWatch()
    if (wasSharing) void api.delete('/emergency/location').catch(() => {})
  }, [])

  if (meQuery.isLoading) return <LoadingScreen message="Loading emergency contacts..." />

  const patient = meQuery.data || {}
  const emergencyContact = patient.emergency_contact_phone || '911'
  const clinicContact = '0917-000-0000'

  return (
    <View style={styles.root}>
      <ScreenHeader title="Emergency support" subtitle="Clinic, ambulance, barangay support, and optional live location" patient />

      <ScrollView contentContainerStyle={styles.scroll}>
        {message ? <AlertBox type="success" message={message} /> : null}
        {locationError ? <AlertBox type="warning" message={locationError} /> : null}

        <Card patient>
          <Text style={styles.title}>Immediate steps</Text>
          <Text style={styles.body}>If you are experiencing heavy bleeding, loss of consciousness, seizure activity, or severe difficulty breathing, call emergency services immediately and proceed to the nearest appropriate hospital.</Text>
          <View style={styles.badgeRow}>
            <Badge label="Priority support" variant="danger" />
            <Badge label="Clinic follow-up" variant="patient" />
          </View>
        </Card>

        <Card patient style={isSharing ? styles.sharingCard : null}>
          <Text style={styles.title}>Live pickup location</Text>
          <Text style={styles.body}>Share your device location only while you need emergency coordination. It is visible to authorized clinic staff, expires after 15 minutes without an update, and stops when you leave this screen or tap Stop sharing.</Text>
          {sharedLocation ? <Text style={styles.locationMeta}>Last device update: {new Date(sharedLocation.sharedAt).toLocaleString('en-PH')}{sharedLocation.accuracyMeters ? ` · accuracy about ${Math.round(sharedLocation.accuracyMeters)} m` : ''}</Text> : null}
          <View style={styles.actionStack}>
            {isSharing ? (
              <Button title={stopLocationMutation.isPending ? 'Stopping...' : 'Stop sharing location'} variant="danger" onPress={stopSharing} loading={stopLocationMutation.isPending} />
            ) : (
              <Button title={locationState === 'requesting' ? 'Requesting location...' : 'Share live location'} variant="patient" onPress={startSharing} loading={locationState === 'requesting'} />
            )}
            {sharedLocation ? <Button title="Open live location in Google Maps" variant="secondary" onPress={() => Linking.openURL(googleMapsUrl(sharedLocation.latitude, sharedLocation.longitude))} /> : null}
          </View>
        </Card>

        <Card patient>
          <Text style={styles.title}>Call for help</Text>
          <View style={styles.actionStack}>
            <Button title={`Call emergency: ${emergencyContact}`} variant="danger" onPress={() => Linking.openURL(`tel:${emergencyContact}`)} />
            <Button title={`Call clinic: ${clinicContact}`} variant="secondary" onPress={() => Linking.openURL(`tel:${clinicContact}`)} />
          </View>
        </Card>

        <Card patient>
          <Text style={styles.title}>Send urgent clinic request</Text>
          <Text style={styles.body}>This creates an urgent support thread so the clinic can coordinate an ambulance, barangay assistance, or referral guidance. It is not a replacement for calling emergency services.</Text>
          <Button title={emergencyMutation.isPending ? 'Sending urgent request...' : 'Request urgent support'} variant="patient" onPress={() => emergencyMutation.mutate()} loading={emergencyMutation.isPending} style={{ marginTop: spacing.md }} />
        </Card>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brand.pearl },
  scroll: { padding: spacing.lg, paddingBottom: 40, gap: spacing.sm },
  title: { fontSize: 16, fontWeight: '700', color: colors.gray[900] },
  body: { marginTop: 8, fontSize: 13, lineHeight: 19, color: colors.gray[600] },
  locationMeta: { marginTop: spacing.sm, fontSize: 12, lineHeight: 17, color: colors.teal[700] },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  actionStack: { gap: spacing.sm, marginTop: spacing.md },
  sharingCard: { borderColor: colors.teal[200], backgroundColor: '#f0fdfa' },
})
