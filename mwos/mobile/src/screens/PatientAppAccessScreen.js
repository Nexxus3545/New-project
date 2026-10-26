import React from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button } from '../components/ui'
import { colors, spacing } from '../components/theme'
import { useAuthStore } from '../hooks/useAuthStore'
import { PATIENT_APP_MESSAGE } from '../utils/patientAppAccess'

export default function PatientAppAccessScreen() {
  const { logout, isLoading } = useAuthStore()
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.brand.pearl }}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.lg }}>
      <View style={{ padding: spacing.lg, backgroundColor: colors.white, borderRadius: 24 }}>
        <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700', color: colors.gray[900] }}>Patient mobile app</Text>
        <Text style={{ marginVertical: spacing.lg, fontSize: 16, lineHeight: 26, color: colors.gray[600] }}>{PATIENT_APP_MESSAGE}</Text>
        <Text style={{ marginBottom: spacing.lg, fontSize: 14, lineHeight: 22, color: colors.gray[600] }}>Your clinic account is not deactivated. Return to sign-in on this phone and use a patient account.</Text>
        <Button title="Return to patient sign-in" onPress={logout} loading={isLoading} />
      </View>
    </ScrollView>
  </SafeAreaView>
}
