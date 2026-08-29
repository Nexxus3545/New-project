import React, { useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { AlertBox, Button, Input } from '../components/ui'
import { colors, radius, shadow, spacing } from '../components/theme'
import { useAuthStore } from '../hooks/useAuthStore'

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  city: '',
  dateOfBirth: '',
  password: '',
  confirmPassword: '',
}

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)

export default function RegisterScreen({ navigation }) {
  const [form, setForm] = useState(initialForm)
  const [localError, setLocalError] = useState('')
  const { registerPatient, isLoading, error, clearError } = useAuthStore()

  const joinedError = localError || error
  const canSubmit = useMemo(() => (
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.email.trim() &&
    form.dateOfBirth.trim() &&
    form.password &&
    form.confirmPassword
  ), [form])

  const setField = (key, value) => {
    setLocalError('')
    clearError()
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = async () => {
    if (!canSubmit) {
      setLocalError('Please complete the required fields.')
      return
    }

    if (!isIsoDate(form.dateOfBirth.trim())) {
      setLocalError('Use YYYY-MM-DD for date of birth.')
      return
    }

    if (form.password.length < 6) {
      setLocalError('Password must be at least 6 characters.')
      return
    }

    if (form.password !== form.confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }

    const result = await registerPatient({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      city: form.city.trim(),
      dateOfBirth: form.dateOfBirth.trim(),
      password: form.password,
    })

    if (!result.success) {
      return
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      <View style={styles.orbA} />
      <View style={styles.orbB} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Patient registration</Text>
          <Text style={styles.title}>Create your MWOS care access</Text>
          <Text style={styles.subtitle}>
            This patient account opens the same mobile care flow used for appointments,
            medicine requests, reports, and clinic support.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Set up your profile</Text>
          <Text style={styles.cardSub}>
            Required fields help the clinic create your patient record immediately.
          </Text>

          {joinedError ? <AlertBox type="critical" message={joinedError} /> : null}

          <View style={styles.row}>
            <View style={styles.half}>
              <Input
                label="First name"
                value={form.firstName}
                onChangeText={(value) => setField('firstName', value)}
                placeholder="Maria"
              />
            </View>
            <View style={styles.half}>
              <Input
                label="Last name"
                value={form.lastName}
                onChangeText={(value) => setField('lastName', value)}
                placeholder="Santos"
              />
            </View>
          </View>

          <Input
            label="Email address"
            value={form.email}
            onChangeText={(value) => setField('email', value)}
            placeholder="maria@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Input
                label="Phone"
                value={form.phone}
                onChangeText={(value) => setField('phone', value)}
                placeholder="09xx xxx xxxx"
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.half}>
              <Input
                label="City"
                value={form.city}
                onChangeText={(value) => setField('city', value)}
                placeholder="Tabaco City"
              />
            </View>
          </View>

          <Input
            label="Date of birth"
            value={form.dateOfBirth}
            onChangeText={(value) => setField('dateOfBirth', value)}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Input
                label="Password"
                value={form.password}
                onChangeText={(value) => setField('password', value)}
                placeholder="Create a password"
                secureTextEntry
              />
            </View>
            <View style={styles.half}>
              <Input
                label="Confirm password"
                value={form.confirmPassword}
                onChangeText={(value) => setField('confirmPassword', value)}
                placeholder="Repeat password"
                secureTextEntry
              />
            </View>
          </View>

          <Button
            title={isLoading ? 'Creating account...' : 'Create patient account'}
            onPress={handleSubmit}
            loading={isLoading}
            disabled={!canSubmit}
            style={{ marginTop: spacing.sm }}
          />

          <Button
            title="Back to sign in"
            variant="secondary"
            onPress={() => navigation.goBack()}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.brand.pearl,
  },
  orbA: {
    position: 'absolute',
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(201,137,148,0.2)',
  },
  orbB: {
    position: 'absolute',
    bottom: 40,
    left: -50,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: 'rgba(15,118,110,0.12)',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: 54,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.brand.copper,
  },
  title: {
    marginTop: 10,
    fontSize: 30,
    fontWeight: '700',
    color: colors.gray[900],
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.gray[600],
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: radius.xl,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    ...shadow.lg,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.gray[900],
  },
  cardSub: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: 13,
    lineHeight: 19,
    color: colors.gray[500],
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  half: {
    flex: 1,
  },
})
