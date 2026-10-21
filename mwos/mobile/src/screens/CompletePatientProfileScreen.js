import React, { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../hooks/useAuthStore';
import { Button, Input, AlertBox, Card } from '../components/ui';
import { colors, spacing } from '../components/theme';

export default function CompletePatientProfileScreen() {
  const [dateOfBirth, setDateOfBirth] = useState('');
  const { completeGoogleProfile, logout, isLoading, error } = useAuthStore();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.brand.pearl }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
        <Card>
          <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 12 }}>Complete your patient profile</Text>
          <Text style={{ marginBottom: 16 }}>Your Google account is connected. Enter your date of birth before opening your care portal.</Text>
          {error ? <AlertBox type="critical" message={error} /> : null}
          <Input label="Date of birth (YYYY-MM-DD)" value={dateOfBirth} onChangeText={setDateOfBirth}
            placeholder="2000-01-31" keyboardType="numbers-and-punctuation" />
          <Button title="Open my care portal" loading={isLoading}
            disabled={isLoading || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)}
            onPress={() => completeGoogleProfile({ dateOfBirth })} />
          <Button title="Sign out" variant="secondary" onPress={logout} style={{ marginTop: 12 }} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
