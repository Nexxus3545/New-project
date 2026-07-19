import React from 'react'
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  TextInput, StyleSheet,
} from 'react-native'
import { colors, spacing, radius, shadow, typography } from './theme'

export function Button({ onPress, title, variant = 'primary', size = 'md', loading, disabled, style }) {
  const palettes = {
    primary: { backgroundColor: colors.teal[600], color: colors.white },
    patient: { backgroundColor: colors.brand.rose, color: colors.white },
    secondary: { backgroundColor: 'rgba(255,255,255,0.82)', color: colors.gray[700], borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
    danger: { backgroundColor: colors.danger, color: colors.white },
    ghost: { backgroundColor: 'transparent', color: colors.gray[700] },
  }
  const palette = palettes[variant] || palettes.primary
  const padV = size === 'sm' ? 9 : size === 'lg' ? 16 : 12
  const padH = size === 'sm' ? 12 : size === 'lg' ? 24 : 16
  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 16 : 14

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.86}
      style={[
        styles.btn,
        { paddingVertical: padV, paddingHorizontal: padH },
        palette,
        variant !== 'ghost' && shadow.sm,
        (disabled || loading) && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.color} />
      ) : (
        <Text style={{ color: palette.color, fontSize, fontWeight: '700' }}>{title}</Text>
      )}
    </TouchableOpacity>
  )
}

export function Card({ children, style, patient }) {
  return (
    <View
      style={[
        styles.card,
        patient && { borderColor: colors.brand.blush, backgroundColor: 'rgba(255,245,247,0.92)' },
        style,
      ]}
    >
      {children}
    </View>
  )
}

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
  )
}

export function Badge({ label, variant = 'gray' }) {
  const palettes = {
    success: { bg: '#ccfbf1', text: '#0f766e' },
    warning: { bg: '#fef3c7', text: '#92400e' },
    danger: { bg: '#fee2e2', text: '#991b1b' },
    info: { bg: '#dbeafe', text: '#1e40af' },
    gray: { bg: colors.gray[100], text: colors.gray[600] },
    patient: { bg: colors.brand.blush, text: colors.brand.copper },
  }
  const palette = palettes[variant] || palettes.gray
  return (
    <View style={{ backgroundColor: palette.bg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: palette.text, textTransform: 'capitalize' }}>{label}</Text>
    </View>
  )
}

export function SectionHeader({ title, action, onAction, style }) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && (
        <TouchableOpacity onPress={onAction}>
          <Text style={{ fontSize: 13, color: colors.brand.copper, fontWeight: '700' }}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

export function EmptyState({ icon = '[ ]', title, subtitle }) {
  return (
    <View style={styles.emptyState}>
      <Text style={{ fontSize: 28, marginBottom: spacing.sm }}>{icon}</Text>
      <Text style={[typography.h3, { textAlign: 'center', marginBottom: 4 }]}>{title}</Text>
      {subtitle && <Text style={[typography.small, { textAlign: 'center' }]}>{subtitle}</Text>}
    </View>
  )
}

export function AlertBox({ type = 'info', message }) {
  const palettes = {
    critical: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', icon: '!' },
    warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', icon: '!' },
    info: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', icon: 'i' },
    success: { bg: '#f0fdfa', border: '#99f6e4', text: '#0f766e', icon: '+' },
  }
  const palette = palettes[type] || palettes.info
  return (
    <View style={{
      backgroundColor: palette.bg,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.lg,
      padding: spacing.md,
      flexDirection: 'row',
      gap: 8,
      marginBottom: spacing.md,
    }}>
      <Text style={{ color: palette.text, fontWeight: '700' }}>{palette.icon}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: palette.text, lineHeight: 18 }}>{message}</Text>
    </View>
  )
}

export function LoadingScreen({ message = 'Loading...' }) {
  return (
    <View style={styles.loadingScreen}>
      <View style={styles.loadingOrb}>
        <ActivityIndicator size="large" color={colors.brand.rose} />
      </View>
      <Text style={[typography.body, { marginTop: spacing.md, color: colors.gray[500] }]}>{message}</Text>
    </View>
  )
}

export function ListItem({ title, subtitle, right, onPress, leftIcon }) {
  const Wrapper = onPress ? TouchableOpacity : View
  return (
    <Wrapper onPress={onPress} activeOpacity={0.75} style={styles.listItem}>
      {leftIcon && (
        <View style={styles.listIcon}>
          <Text style={{ fontSize: 18 }}>{leftIcon}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.listTitle}>{title}</Text>
        {subtitle && <Text style={styles.listSub}>{subtitle}</Text>}
      </View>
      {right && <View>{right}</View>}
      {onPress && <Text style={{ color: colors.gray[400], fontSize: 18 }}>{'>'}</Text>}
    </Wrapper>
  )
}

export function StatCard({ icon, label, value, color = 'teal', patient }) {
  const palette = patient
    ? { bg: colors.brand.blush, iconBg: 'rgba(255,255,255,0.7)', text: colors.brand.copper }
    : color === 'red'
      ? { bg: '#fef2f2', iconBg: '#fee2e2', text: '#991b1b' }
      : color === 'amber'
        ? { bg: '#fffbeb', iconBg: '#fef3c7', text: '#92400e' }
        : color === 'blue'
          ? { bg: '#eff6ff', iconBg: '#dbeafe', text: '#1e40af' }
          : { bg: colors.teal[50], iconBg: colors.teal[100], text: colors.teal[700] }

  return (
    <View style={[styles.statCard, { backgroundColor: palette.bg }]}>
      <View style={[styles.statIcon, { backgroundColor: palette.iconBg }]}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
      <Text style={[typography.h2, { marginTop: 8, color: colors.gray[900] }]}>{value ?? '--'}</Text>
      <Text style={[typography.small, { marginTop: 2, textAlign: 'center', color: palette.text }]}>{label}</Text>
    </View>
  )
}

export function ScreenHeader({ title, subtitle, right, patient }) {
  return (
    <View style={[styles.screenHeader, patient && { backgroundColor: colors.brand.rose }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: colors.white }}>{title}</Text>
        {subtitle && <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 2 }}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  )
}

export function SelectPicker({ label, value, options, onChange, error }) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((option) => option.value === value)

  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        onPress={() => setOpen(!open)}
        style={[styles.input, styles.pickerTrigger]}
      >
        <Text style={{ color: selected ? colors.gray[800] : colors.gray[400], fontSize: 14 }}>
          {selected ? selected.label : 'Select...'}
        </Text>
        <Text style={{ color: colors.gray[400] }}>{open ? '^' : 'v'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={[styles.card, { marginTop: 4, padding: 0 }]}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.value}
              onPress={() => { onChange(option.value); setOpen(false) }}
              style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}
            >
              <Text style={{ fontSize: 14, color: option.value === value ? colors.brand.copper : colors.gray[700], fontWeight: option.value === value ? '700' : '400' }}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {error && <Text style={styles.errorMsg}>{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    ...shadow.md,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.68)',
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.gray[800],
    backgroundColor: 'rgba(255,255,255,0.84)',
  },
  pickerTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputError: { borderColor: colors.danger },
  label: { fontSize: 13, fontWeight: '600', color: colors.gray[600], marginBottom: 6 },
  errorMsg: { fontSize: 11, color: colors.danger, marginTop: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.gray[800] },
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.pearl,
  },
  loadingOrb: {
    width: 82,
    height: 82,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    ...shadow.md,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
    gap: spacing.sm,
    backgroundColor: colors.white,
  },
  listIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    backgroundColor: colors.brand.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTitle: { fontSize: 14, fontWeight: '600', color: colors.gray[900] },
  listSub: { fontSize: 12, color: colors.gray[500], marginTop: 2 },
  statCard: {
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: 'center',
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    ...shadow.sm,
  },
  statIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenHeader: {
    backgroundColor: colors.teal[600],
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
})
