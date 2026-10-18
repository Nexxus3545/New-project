import React from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { colors, radius } from './theme'

// Keeps legacy shorthand values readable while rendering a consistent icon set.
const iconAliases = {
  DB: 'view-dashboard-outline',
  PT: 'account-group-outline',
  AP: 'calendar-check-outline',
  LD: 'baby-carriage',
  DL: 'baby-carriage',
  RX: 'pill',
  PG: 'heart-pulse',
  MR: 'file-document-outline',
  HT: 'book-open-page-variant-outline',
  PF: 'account-circle-outline',
  DR: 'stethoscope',
  RP: 'chart-box-outline',
  EM: 'alert-circle-outline',
  BP: 'heart-pulse',
  VT: 'heart-pulse',
  LB: 'test-tube',
  IM: 'needle',
  DD: 'calendar-heart',
  CH: 'message-text-outline',
  TK: 'clipboard-check-outline',
  MAP: 'map-marker-radius-outline',
  MD: 'play-circle-outline',
  ED: 'book-open-page-variant-outline',
  NT: 'bell-outline',
  '👩‍⚕️': 'account-heart-outline',
  '💓': 'heart-pulse',
  '📅': 'calendar-check-outline',
  '🤰': 'human-pregnant',
  '🔬': 'microscope',
  '📚': 'book-open-page-variant-outline',
  '💊': 'pill',
  '💳': 'cash-multiple',
}

const resolveIconName = (name) => {
  const resolved = iconAliases[name] || name
  return typeof resolved === 'string' && MaterialCommunityIcons.glyphMap[resolved]
    ? resolved
    : 'circle-outline'
}

export function MobileIcon({ name, size = 20, color = colors.gray[700], style }) {
  return (
    <MaterialCommunityIcons
      name={resolveIconName(name)}
      size={size}
      color={color}
      style={style}
    />
  )
}

export function IconButton({ icon, onPress, label, size = 42, color, backgroundColor, style, disabled }) {
  const foreground = color || colors.brand.copper
  const background = backgroundColor || colors.white

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label || 'Action'}
      accessibilityHint={label ? `Opens ${label}` : undefined}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.72}
      style={[
        styles.button,
        { width: size, height: size, borderRadius: Math.round(size * 0.36), backgroundColor: background },
        disabled && styles.disabled,
        style,
      ]}
    >
      <MobileIcon name={icon} size={Math.round(size * 0.47)} color={foreground} />
    </TouchableOpacity>
  )
}

export function IconTile({ icon, color = colors.brand.copper, backgroundColor = colors.brand.blush, size = 44, style }) {
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: Math.round(size * 0.34), backgroundColor }, style]}>
      <MobileIcon name={icon} size={Math.round(size * 0.46)} color={color} />
    </View>
  )
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
})
