import React from 'react'
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import { AlertBox, Badge, Button, Card, EmptyState, LoadingScreen, ScreenHeader } from '../../components/ui'
import { colors, spacing } from '../../components/theme'

const mapDirectionsUrl = (latitude, longitude) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${latitude},${longitude}`)}`

const relativeUpdate = (value) => {
  if (!value) return 'Update time unavailable'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'Updated just now'
  if (seconds < 3600) return `Updated ${Math.floor(seconds / 60)} min ago`
  return `Updated ${Math.floor(seconds / 3600)} hr ago`
}

export default function EmergencyMapScreen({ navigation }) {
  const locationsQuery = useQuery({
    queryKey: ['emergency-locations-mobile-staff'],
    queryFn: () => api.get('/emergency/locations').then((response) => response.data.data),
    refetchInterval: 10000,
  })
  const locations = locationsQuery.data || []

  if (locationsQuery.isLoading) return <LoadingScreen message="Loading active emergency locations..." />

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Emergency live map"
        subtitle="Active patient location shares for emergency coordination"
        right={<Button title="Refresh" size="sm" variant="secondary" onPress={() => locationsQuery.refetch()} />}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <AlertBox type="critical" message="Use these coordinates only for authorized clinical, barangay, ambulance, or referral coordination. Confirm the patient’s condition and pickup instructions by phone, and call 911 for life-threatening emergencies." />

        {locationsQuery.error ? <AlertBox type="warning" message={locationsQuery.error.response?.data?.message || 'Unable to load active emergency locations.'} /> : null}

        <Card>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.title}>Active location shares</Text>
              <Text style={styles.body}>Only patients who explicitly enabled emergency sharing appear here.</Text>
            </View>
            <Badge label={`${locations.length} active`} variant={locations.length ? 'warning' : 'gray'} />
          </View>
        </Card>

        {locations.length === 0 ? (
          <Card><EmptyState icon="MAP" title="No active shares" subtitle="The list will update when a patient chooses to share their location from Emergency Support." /></Card>
        ) : locations.map((location) => (
          <Card key={location.id} style={styles.locationCard}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{location.patientName}</Text>
                <Text style={styles.body}>{[location.barangay, location.city, location.province].filter(Boolean).join(', ') || 'Patient address not recorded'}</Text>
              </View>
              <Badge label="Active" variant="success" />
            </View>
            <View style={styles.metadataBox}>
              <Text style={styles.metadata}>{relativeUpdate(location.sharedAt)}</Text>
              <Text style={styles.metadata}>GPS: {Number(location.latitude).toFixed(5)}, {Number(location.longitude).toFixed(5)}</Text>
              {location.accuracyMeters ? <Text style={styles.metadata}>Accuracy about {Math.round(location.accuracyMeters)} m</Text> : null}
            </View>
            <View style={styles.actionStack}>
              <Button title="Open directions in Google Maps" onPress={() => Linking.openURL(mapDirectionsUrl(location.latitude, location.longitude))} />
              <TouchableOpacity onPress={() => navigation.navigate('StaffTabs', { screen: 'Patients' })}>
                <Text style={styles.patientLink}>Open patient list for clinical record</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brand.pearl },
  scroll: { padding: spacing.lg, paddingBottom: 40, gap: spacing.sm },
  locationCard: { gap: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  title: { fontSize: 16, fontWeight: '700', color: colors.gray[900] },
  body: { marginTop: 6, fontSize: 13, lineHeight: 19, color: colors.gray[600] },
  metadataBox: { borderRadius: 16, backgroundColor: colors.gray[50], borderWidth: 1, borderColor: colors.gray[200], padding: spacing.md, gap: 4 },
  metadata: { fontSize: 12, color: colors.gray[600], fontVariant: ['tabular-nums'] },
  actionStack: { gap: spacing.md },
  patientLink: { textAlign: 'center', color: colors.teal[700], fontWeight: '700', fontSize: 13 },
})
