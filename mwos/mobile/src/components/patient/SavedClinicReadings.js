import React from 'react'
import { Text, View } from 'react-native'
import { Card } from '../ui'
import { savedMetrics } from '../../utils/patientCare'

export default function SavedClinicReadings({ latestVitals, includeMaternal = false }) {
  return <Card patient>
    <Text style={{ fontSize: 18, fontWeight: '700', color: '#172033' }}>Saved clinic readings</Text>
    <Text style={{ marginTop: 8, color: '#64748b', lineHeight: 20 }}>Visit date: {latestVitals?.visit_date ? new Date(latestVitals.visit_date).toLocaleDateString('en-PH') : 'Not recorded'}. Saved measurements only, not live sensor readings.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 16 }}>
      {savedMetrics(latestVitals, includeMaternal).map((metric) => <View key={metric.label} style={{ width: '46%' }}>
        <Text style={{ color: '#64748b', fontSize: 12 }}>{metric.label}</Text>
        <Text style={{ marginTop: 6, fontWeight: '700', color: '#172033', fontSize: 17 }}>{String(metric.value)}</Text>
      </View>)}
    </View>
    <Text style={{ marginTop: 16, color: '#64748b', fontSize: 12, lineHeight: 18 }}>This screen does not assess your current condition. Ask your care team about your saved record.</Text>
  </Card>
}
