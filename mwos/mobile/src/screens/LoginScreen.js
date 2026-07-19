import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, StyleSheet, Image, Animated,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useAuthStore } from '../hooks/useAuthStore'
import { Button, Input, AlertBox } from '../components/ui'
import { colors, spacing, radius, shadow } from '../components/theme'

const logo = require('../../assets/icon.png')

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@tmccopino.com', password: 'admin1234' },
  { label: 'Doctor', email: 'doctor@tmccopino.com', password: 'password123' },
  { label: 'Midwife', email: 'midwife@tmccopino.com', password: 'password123' },
  { label: 'Patient', email: 'patient@example.com', password: 'patient123' },
]

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const { login, loginWithBiometrics, biometricEnabled, isLoading, error, clearError } = useAuthStore()
  const floatAnim = useRef(new Animated.Value(0)).current
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -10, duration: 2600, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2600, useNativeDriver: true }),
      ])
    )
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 2200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2200, useNativeDriver: true }),
      ])
    )

    floatLoop.start()
    pulseLoop.start()

    return () => {
      floatLoop.stop()
      pulseLoop.stop()
    }
  }, [floatAnim, pulseAnim])

  const handleLogin = async () => {
    if (!email.trim() || !password) return
    await login(email, password)
  }

  const handleBiometricLogin = async () => {
    const result = await loginWithBiometrics()
    if (result.success && result.user) {
      navigation.replace(result.user.role === 'patient' ? 'PatientNavigator' : 'StaffTabs')
    }
  }

  const fillDemo = (account) => {
    clearError()
    setEmail(account.email)
    setPassword(account.password)
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      <View style={styles.orbA} />
      <View style={styles.orbB} />
      <View style={styles.gridGlow} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Animated.View style={[styles.logoAura, { transform: [{ scale: pulseAnim }] }]} />
          <Animated.View style={[styles.logoShell, { transform: [{ translateY: floatAnim }] }]}>
            <Image source={logo} style={styles.logoImage} resizeMode="cover" />
          </Animated.View>
          <Text style={styles.title}>TMC Copino MWOS</Text>
          <Text style={styles.subtitle}>A calm, connected maternal care workspace across web, mobile, and desktop.</Text>

          <View style={styles.featureRow}>
            <View style={styles.featureChip}><Text style={styles.featureText}>Shared backend</Text></View>
            <View style={styles.featureChip}><Text style={styles.featureText}>Secure roles</Text></View>
            <View style={styles.featureChip}><Text style={styles.featureText}>Care timeline</Text></View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in</Text>
          <Text style={styles.cardSub}>Use your clinic account to enter the maternal wellness workspace.</Text>

          {error && <AlertBox type="critical" message={error} />}

          <Input
            label="Email address"
            value={email}
            onChangeText={(text) => { clearError(); setEmail(text) }}
            placeholder="you@tmccopino.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View>
            <Input
              label="Password"
              value={password}
              onChangeText={(text) => { clearError(); setPassword(text) }}
              placeholder="Enter your password"
              secureTextEntry={!showPass}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.showPass}>
              <Text style={styles.showPassText}>{showPass ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>

          <Button
            title={isLoading ? 'Signing in...' : 'Sign in'}
            onPress={handleLogin}
            loading={isLoading}
            disabled={!email || !password}
            style={{ marginTop: spacing.sm }}
          />

          {biometricEnabled ? (
            <Button
              title="Use biometric unlock"
              variant="secondary"
              onPress={handleBiometricLogin}
              style={{ marginTop: spacing.sm }}
            />
          ) : null}

          <Button
            title="Create patient account"
            variant="secondary"
            onPress={() => navigation.navigate('Register')}
            style={{ marginTop: spacing.sm }}
          />

          <View style={styles.demoSection}>
            <Text style={styles.demoLabel}>Quick demo access</Text>
            <View style={styles.demoGrid}>
              {DEMO_ACCOUNTS.map((account) => (
                <TouchableOpacity
                  key={account.label}
                  onPress={() => fillDemo(account)}
                  style={styles.demoBtn}
                  activeOpacity={0.82}
                >
                  <Text style={styles.demoBtnText}>{account.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.footerWrap}>
          <Text style={styles.footer}>TMC Copino Birthing Home and Medical Clinic - Gajo, Albay</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')} activeOpacity={0.84}>
            <Text style={styles.footerLink}>New here? Set up your patient access</Text>
          </TouchableOpacity>
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
  gridGlow: {
    position: 'absolute',
    inset: 0,
    opacity: 0.22,
    borderWidth: 0,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: 54,
    paddingBottom: 40,
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
    width: 110,
    height: 110,
    padding: 10,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.7)',
    ...shadow.lg,
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  title: {
    marginTop: 18,
    fontSize: 30,
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
  featureRow: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  featureChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.84)',
  },
  featureText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.copper,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderRadius: radius.xl,
    padding: spacing.xxl,
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
    right: 14,
    bottom: 28,
  },
  showPassText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.copper,
  },
  demoSection: {
    marginTop: 24,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
  },
  demoLabel: {
    fontSize: 12,
    color: colors.gray[500],
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '600',
  },
  demoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  demoBtn: {
    flex: 1,
    minWidth: '45%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    backgroundColor: 'rgba(243,221,226,0.62)',
    borderRadius: radius.lg,
    paddingVertical: 10,
    alignItems: 'center',
  },
  demoBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brand.copper,
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
  footerLink: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.copper,
  },
})
