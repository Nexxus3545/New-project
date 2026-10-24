import React, { useState } from 'react'
import {
  View, Text, ScrollView,
  KeyboardAvoidingView, Platform, StyleSheet, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useAuthStore } from '../hooks/useAuthStore'
import { Button, Input, AlertBox } from '../components/ui'
import { IconButton } from '../components/Icon'
import { colors, spacing, radius, shadow } from '../components/theme'

const logo = require('../../assets/icon.png')

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [emailCode, setEmailCode] = useState('')
  const {
    login,
    loginWithGoogle,
    googleEmailVerification,
    verifyGoogleEmail,
    cancelGoogleEmailVerification,
    loginWithBiometrics,
    biometricEnabled,
    biometricPending,
    biometricLabel,
    isLoading,
    error,
    clearError,
  } = useAuthStore()
  const handleLogin = async () => {
    if (!email.trim() || !password) return
    await login(email, password)
  }

  const handleBiometricLogin = async () => {
    await loginWithBiometrics()
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
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
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoAura} />
            <View style={styles.logoShell}>
              <Image source={logo} style={styles.logoImage} resizeMode="contain" />
            </View>
            <Text style={styles.title}>TMC Copino MWOS</Text>
            <Text style={styles.subtitle}>Secure access to your maternal care information and clinic services.</Text>
          </View>

          <View style={styles.card}>
            {googleEmailVerification ? <>
              <Text style={styles.cardTitle}>Check your Google email</Text>
              <Text style={styles.cardSub}>A sign-in code was sent to {googleEmailVerification.destination}. Patient access opens only after this check.</Text>
              {error ? <AlertBox type="critical" message={error} /> : null}
              <Input label="Six-digit email code" value={emailCode} onChangeText={(value) => { clearError(); setEmailCode(value.replace(/\D/g, '')) }} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" />
              <Text style={styles.cardSub}>Expires in 10 minutes. Never share the code. MWOS does not need access to your Gmail inbox.</Text>
              <Button title="Verify and continue" loading={isLoading} disabled={isLoading || !/^\d{6}$/.test(emailCode)} onPress={() => verifyGoogleEmail(emailCode)} />
              <Button title="Cancel and restart sign-in" variant="secondary" disabled={isLoading} onPress={() => { cancelGoogleEmailVerification(); setEmailCode('') }} style={{ marginTop: spacing.sm }} />
            </> : <>
            <Text style={styles.cardTitle}>Sign in securely</Text>
            <Text style={styles.cardSub}>
              {biometricPending
                ? `This saved session is locked. Use ${biometricLabel} or enter your password.`
                : 'Use the email and password issued for your TMC Copino account.'}
            </Text>

            {error && <AlertBox type="critical" message={error} />}

            <Input
              label="Email address"
              value={email}
              onChangeText={(text) => { clearError(); setEmail(text) }}
              placeholder="you@tmccopino.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              returnKeyType="next"
            />

            <View>
              <Input
                label="Password"
                value={password}
                onChangeText={(text) => { clearError(); setPassword(text) }}
                placeholder="Enter your password"
                secureTextEntry={!showPass}
                autoComplete="current-password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <IconButton
                icon={showPass ? 'eye-off-outline' : 'eye-outline'}
                label={showPass ? 'Hide password' : 'Show password'}
                onPress={() => setShowPass(!showPass)}
                size={34}
                backgroundColor="transparent"
                style={styles.showPass}
              />
            </View>

            <Button
              title={isLoading ? 'Signing in...' : 'Sign in securely'}
              onPress={handleLogin}
              loading={isLoading}
              disabled={!email || !password}
              icon="login"
              style={{ marginTop: spacing.sm }}
            />

            <Button title="Continue with Google" variant="secondary" onPress={loginWithGoogle}
              disabled={isLoading} icon="google" style={{ marginTop: spacing.sm }} />
            <Text style={styles.cardSub}>Google sign-in is for patient accounts. Staff use their clinic account.</Text>

            {biometricEnabled && biometricPending ? (
              <Button
                title={`Unlock with ${biometricLabel}`}
                variant="secondary"
                onPress={handleBiometricLogin}
                icon="fingerprint"
                style={{ marginTop: spacing.sm }}
              />
            ) : null}

            <Button
              title="Create a patient account"
              variant="secondary"
              onPress={() => navigation.navigate('Register')}
              icon="account-plus-outline"
              style={{ marginTop: spacing.sm }}
            />

            <View style={styles.securityNote}>
              <Text style={styles.securityNoteText}>
                Your health information is protected and available only to authorized clinic personnel.
              </Text>
            </View>
            </>}
          </View>

          <View style={styles.footerWrap}>
            <Text style={styles.footer}>TMC Copino Birthing Home and Medical Clinic - Gajo, Albay</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    backgroundColor: 'rgba(201,137,148,0.22)',
  },
  orbB: {
    position: 'absolute',
    bottom: 40,
    left: -50,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: 'rgba(15,118,110,0.14)',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoAura: {
    position: 'absolute',
    top: 8,
    width: 132,
    height: 132,
    borderRadius: 999,
    backgroundColor: 'rgba(201,137,148,0.18)',
  },
  logoShell: {
    width: 92,
    height: 92,
    padding: 9,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.7)',
    ...shadow.lg,
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  title: {
    marginTop: 16,
    fontSize: 27,
    fontWeight: '700',
    color: colors.brand.copper,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: colors.gray[600],
    textAlign: 'center',
    maxWidth: 320,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
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
  showPass: {
    position: 'absolute',
    right: 8,
    bottom: 20,
  },
  securityNote: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(243,221,226,0.58)',
  },
  securityNoteText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: colors.gray[600],
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.gray[500],
  },
  footerWrap: {
    marginTop: 24,
    gap: 8,
  },
})
