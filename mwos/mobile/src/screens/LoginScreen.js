import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../hooks/useAuthStore';
import { Button, Input, AlertBox } from '../components/ui';
import { colors, spacing, radius } from '../components/theme';

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@tmccopino.com', password: 'admin1234' },
  { label: 'Doctor', email: 'doctor@tmccopino.com', password: 'password123' },
  { label: 'Midwife', email: 'midwife@tmccopino.com', password: 'password123' },
  { label: 'Patient', email: 'patient@example.com', password: 'patient123' },
];

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const { login, isLoading, error, clearError } = useAuthStore();

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    await login(email, password);
  };

  const fillDemo = (acc) => {
    clearError();
    setEmail(acc.email);
    setPassword(acc.password);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logo}>
            <Text style={{ fontSize: 36 }}>🏥</Text>
          </View>
          <Text style={styles.title}>TMC Copino</Text>
          <Text style={styles.subtitle}>Maternal Wellness & Operation System</Text>
        </View>

        {/* Form card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in</Text>

          {error && <AlertBox type="critical" message={error} />}

          <Input
            label="Email address"
            value={email}
            onChangeText={(t) => { clearError(); setEmail(t); }}
            placeholder="you@tmccopino.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View>
            <Input
              label="Password"
              value={password}
              onChangeText={(t) => { clearError(); setPassword(t); }}
              placeholder="••••••••"
              secureTextEntry={!showPass}
            />
            <TouchableOpacity
              onPress={() => setShowPass(!showPass)}
              style={styles.showPass}
            >
              <Text style={{ fontSize: 18 }}>{showPass ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <Button
            title={isLoading ? 'Signing in...' : 'Sign in'}
            onPress={handleLogin}
            loading={isLoading}
            disabled={!email || !password}
            style={{ marginTop: spacing.sm }}
          />

          {/* Demo accounts */}
          <View style={styles.demoSection}>
            <Text style={styles.demoLabel}>Quick demo access</Text>
            <View style={styles.demoGrid}>
              {DEMO_ACCOUNTS.map((acc) => (
                <TouchableOpacity
                  key={acc.label}
                  onPress={() => fillDemo(acc)}
                  style={styles.demoBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.demoBtnText}>{acc.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          TMC Copino Birthing Home and Medical Clinic · Tabaco City, Albay
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.teal[600] },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '700', color: colors.white },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4, textAlign: 'center' },
  card: {
    backgroundColor: colors.white, borderRadius: 20,
    padding: spacing.xl, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: colors.gray[900], marginBottom: 20 },
  showPass: { position: 'absolute', right: 12, bottom: 28 },
  demoSection: { marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.gray[100] },
  demoLabel: { fontSize: 12, color: colors.gray[400], textAlign: 'center', marginBottom: 10 },
  demoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  demoBtn: {
    flex: 1, minWidth: '45%', borderWidth: 1, borderColor: colors.gray[200],
    borderRadius: radius.md, paddingVertical: 8, alignItems: 'center',
  },
  demoBtnText: { fontSize: 13, fontWeight: '500', color: colors.gray[700] },
  footer: { textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 24 },
});
