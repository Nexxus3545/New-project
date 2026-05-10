import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  TextInput, StyleSheet, ScrollView,
} from 'react-native';
import { colors, spacing, radius, shadow, typography } from './theme';

// ── Button ────────────────────────────────────────────────────
export function Button({ onPress, title, variant = 'primary', size = 'md', loading, disabled, style }) {
  const isPatient = variant === 'patient';
  const bg = {
    primary: colors.teal[600],
    patient: colors.rose[600],
    secondary: colors.white,
    danger: colors.danger,
    ghost: 'transparent',
  }[variant] || colors.teal[600];

  const textColor = ['secondary', 'ghost'].includes(variant) ? colors.gray[700] : colors.white;
  const border = variant === 'secondary' ? { borderWidth: 1, borderColor: colors.gray[200] } : {};
  const padV = size === 'sm' ? 8 : size === 'lg' ? 16 : 12;
  const padH = size === 'sm' ? 12 : size === 'lg' ? 24 : 16;
  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 16 : 14;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.btn,
        { backgroundColor: bg, paddingVertical: padV, paddingHorizontal: padH, ...border },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text style={{ color: textColor, fontSize, fontWeight: '600' }}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

// ── Card ──────────────────────────────────────────────────────
export function Card({ children, style, patient }) {
  return (
    <View style={[
      styles.card,
      patient && { borderLeftWidth: 3, borderLeftColor: colors.rose[500] },
      style,
    ]}>
      {children}
    </View>
  );
}

// ── Input ─────────────────────────────────────────────────────
export function Input({ label, error, style, ...props }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[styles.input, error && styles.inputError, style]}
        placeholderTextColor={colors.gray[400]}
        {...props}
      />
      {error && <Text style={styles.errorMsg}>{error}</Text>}
    </View>
  );
}

// ── Badge ─────────────────────────────────────────────────────
export function Badge({ label, variant = 'gray' }) {
  const configs = {
    success: { bg: '#ccfbf1', text: '#0f766e' },
    warning: { bg: '#fef3c7', text: '#92400e' },
    danger: { bg: '#fee2e2', text: '#991b1b' },
    info: { bg: '#dbeafe', text: '#1e40af' },
    gray: { bg: colors.gray[100], text: colors.gray[600] },
    patient: { bg: '#ffe4e6', text: '#9f1239' },
  };
  const c = configs[variant] || configs.gray;
  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: c.text, textTransform: 'capitalize' }}>{label}</Text>
    </View>
  );
}

// ── Section Header ────────────────────────────────────────────
export function SectionHeader({ title, action, onAction }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && (
        <TouchableOpacity onPress={onAction}>
          <Text style={{ fontSize: 13, color: colors.teal[600], fontWeight: '600' }}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Empty State ───────────────────────────────────────────────
export function EmptyState({ icon = '📋', title, subtitle }) {
  return (
    <View style={styles.emptyState}>
      <Text style={{ fontSize: 40, marginBottom: spacing.sm }}>{icon}</Text>
      <Text style={[typography.h3, { textAlign: 'center', marginBottom: 4 }]}>{title}</Text>
      {subtitle && <Text style={[typography.small, { textAlign: 'center' }]}>{subtitle}</Text>}
    </View>
  );
}

// ── Alert Box ─────────────────────────────────────────────────
export function AlertBox({ type = 'info', message }) {
  const configs = {
    critical: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', icon: '🚨' },
    warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', icon: '⚠️' },
    info: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', icon: 'ℹ️' },
    success: { bg: '#f0fdfa', border: '#99f6e4', text: '#0f766e', icon: '✅' },
  };
  const c = configs[type] || configs.info;
  return (
    <View style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', gap: 8, marginBottom: spacing.md }}>
      <Text>{c.icon}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: c.text, lineHeight: 18 }}>{message}</Text>
    </View>
  );
}

// ── Loading Screen ────────────────────────────────────────────
export function LoadingScreen({ message = 'Loading...' }) {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator size="large" color={colors.teal[600]} />
      <Text style={[typography.body, { marginTop: spacing.md, color: colors.gray[500] }]}>{message}</Text>
    </View>
  );
}

// ── List Item ─────────────────────────────────────────────────
export function ListItem({ title, subtitle, right, onPress, leftIcon }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.listItem}
    >
      {leftIcon && (
        <View style={styles.listIcon}>
          <Text style={{ fontSize: 20 }}>{leftIcon}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.listTitle}>{title}</Text>
        {subtitle && <Text style={styles.listSub}>{subtitle}</Text>}
      </View>
      {right && <View>{right}</View>}
      {onPress && <Text style={{ color: colors.gray[400], fontSize: 18 }}>›</Text>}
    </Wrapper>
  );
}

// ── Stat Card ─────────────────────────────────────────────────
export function StatCard({ icon, label, value, color = 'teal', patient }) {
  const bg = patient
    ? colors.rose[50]
    : color === 'teal' ? colors.teal[50]
    : color === 'red' ? '#fef2f2'
    : color === 'amber' ? '#fffbeb'
    : '#eff6ff';

  const iconBg = patient
    ? colors.rose[100]
    : color === 'teal' ? colors.teal[100]
    : color === 'red' ? '#fee2e2'
    : color === 'amber' ? '#fef3c7'
    : '#dbeafe';

  return (
    <View style={[styles.statCard, { backgroundColor: bg }]}>
      <View style={[styles.statIcon, { backgroundColor: iconBg }]}>
        <Text style={{ fontSize: 20 }}>{icon}</Text>
      </View>
      <Text style={[typography.h2, { marginTop: 6 }]}>{value ?? '—'}</Text>
      <Text style={[typography.small, { marginTop: 2, textAlign: 'center' }]}>{label}</Text>
    </View>
  );
}

// ── Screen Header ─────────────────────────────────────────────
export function ScreenHeader({ title, subtitle, right, patient }) {
  return (
    <View style={[styles.screenHeader, patient && { backgroundColor: colors.rose[600] }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.white }}>{title}</Text>
        {subtitle && <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

// ── Select Picker (simple) ────────────────────────────────────
export function SelectPicker({ label, value, options, onChange, error }) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        onPress={() => setOpen(!open)}
        style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
      >
        <Text style={{ color: selected ? colors.gray[800] : colors.gray[400], fontSize: 14 }}>
          {selected ? selected.label : 'Select...'}
        </Text>
        <Text style={{ color: colors.gray[400] }}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={[styles.card, { marginTop: 2, padding: 0 }]}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => { onChange(opt.value); setOpen(false); }}
              style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}
            >
              <Text style={{ fontSize: 14, color: opt.value === value ? colors.teal[600] : colors.gray[700], fontWeight: opt.value === value ? '600' : '400' }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {error && <Text style={styles.errorMsg}>{error}</Text>}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  btn: { borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, ...shadow.sm, borderWidth: 1, borderColor: colors.gray[100] },
  input: { borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.gray[800], backgroundColor: colors.white },
  inputError: { borderColor: colors.danger },
  label: { fontSize: 13, fontWeight: '500', color: colors.gray[600], marginBottom: 6 },
  errorMsg: { fontSize: 11, color: colors.danger, marginTop: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.gray[800] },
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray[50] },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.gray[100], gap: spacing.sm, backgroundColor: colors.white },
  listIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  listTitle: { fontSize: 14, fontWeight: '500', color: colors.gray[900] },
  listSub: { fontSize: 12, color: colors.gray[500], marginTop: 2 },
  statCard: { borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', flex: 1, ...shadow.sm },
  statIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  screenHeader: { backgroundColor: colors.teal[600], paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
