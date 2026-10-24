import React, { useEffect, useState } from 'react'
import { AppState, Linking, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import * as Location from 'expo-location'
import * as Notifications from 'expo-notifications'
import api from '../services/api'
import { useAuthStore } from '../hooks/useAuthStore'
import { mobileSettingsSections, settingsPalette, useMobileSettings } from '../hooks/useMobileSettings'
import { MobileIcon } from '../components/Icon'
import ContactNumberCard from '../components/ContactNumberCard'

export default function SettingsScreen({ navigation, route }) {
  const auth = useAuthStore()
  const { preferences, update } = useMobileSettings()
  const palette = settingsPalette(preferences)
  const insets = useSafeAreaInsets()
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [permissions, setPermissions] = useState({ location: 'unknown', notifications: 'unknown' })
  const selected = mobileSettingsSections.find((item) => item.id === route.params?.section)
  const section = selected?.id
  const fil = preferences.language === 'fil'
  const t = (en, translated) => fil ? translated : en
  const activity = useQuery({ queryKey: ['own-account-activity-mobile', auth.user?.id], queryFn: () => api.get('/account/activity').then((response) => response.data.data), enabled: section === 'activity' })

  useEffect(() => { setNotice('') }, [section])
  useEffect(() => {
    if (section !== 'privacy-checkup') return
    let active = true
    const check = async () => {
      try {
        const [location, notifications] = await Promise.all([Location.getForegroundPermissionsAsync(), Notifications.getPermissionsAsync()])
        if (active) setPermissions({ location: location.status, notifications: notifications.status })
      } catch { if (active) setPermissions({ location: 'unknown', notifications: 'unknown' }) }
    }
    check()
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') check() })
    return () => { active = false; listener.remove() }
  }, [section])

  const save = async (patch) => {
    setBusy(true)
    try { await update(patch); setNotice(t('Saved on this phone.', 'Nai-save sa cellphone na ito.')) }
    catch { setNotice(t('Could not save. Please try again.', 'Hindi na-save. Subukan muli.')) }
    finally { setBusy(false) }
  }
  const toggleBiometrics = async () => {
    setBusy(true)
    try {
      if (auth.biometricEnabled) { await auth.disableBiometricUnlock(); setNotice(t('Biometric unlock disabled.', 'Naka-disable ang biometric unlock.')) }
      else { const result = await auth.enableBiometricUnlock(); setNotice(result.success ? t('Biometric unlock enabled.', 'Naka-enable ang biometric unlock.') : result.error) }
    } catch { setNotice(t('Biometric settings could not be changed. Please try again.', 'Hindi mabago ang biometric settings. Subukan muli.')) }
    finally { setBusy(false) }
  }
  const openPermissions = () => Linking.openSettings().catch(() => setNotice(t('Open your phone Settings, then MWOS permissions.', 'Buksan ang Settings ng cellphone, saka MWOS permissions.')))
  const profile = () => auth.user?.role === 'patient' ? navigation.navigate('PatientNavigator', { screen: 'PatientProfile' }) : navigation.navigate('StaffProfile')
  const body = { color: palette.muted, fontSize: 14, lineHeight: 22 }
  const card = { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, borderRadius: 22, padding: 18, gap: 14 }
  const action = (label, onPress, disabled = false) => <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ backgroundColor: palette.accent, borderRadius: 14, padding: 14, opacity: disabled ? 0.5 : 1 }}><Text style={{ color: '#ffffff', fontWeight: '700', textAlign: 'center' }}>{label}</Text></TouchableOpacity>
  const choices = (label, key, options) => <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: 10 }}><Text style={{ color: palette.text, fontWeight: '700', fontSize: 16 }}>{label}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map(([value, text]) => <TouchableOpacity key={value} accessibilityRole="radio" accessibilityState={{ checked: preferences[key] === value, disabled: busy }} disabled={busy} onPress={() => save({ [key]: value })} style={{ borderWidth: 2, borderColor: preferences[key] === value ? palette.accent : palette.border, backgroundColor: palette.card, padding: 13, borderRadius: 14, minWidth: 90 }}><Text style={{ color: palette.text, fontWeight: preferences[key] === value ? '700' : '400' }}>{text}</Text></TouchableOpacity>)}</View></View>
  const permissionLabel = (value) => ({ granted: t('Allowed', 'Pinapayagan'), denied: t('Not allowed', 'Hindi pinapayagan'), undetermined: t('Not requested', 'Hindi pa hiniling'), unknown: t('Unable to check', 'Hindi masuri') })[value] || t('Unable to check', 'Hindi masuri')

  return <View style={{ flex: 1, backgroundColor: palette.background }}>
    <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 20, backgroundColor: palette.accent, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Back', 'Bumalik')} onPress={() => navigation.goBack()} style={{ padding: 10 }}><MobileIcon name="arrow-left" color="#ffffff" size={24} /></TouchableOpacity>
      <View style={{ flex: 1 }}><Text style={{ fontSize: 24, fontWeight: '700', color: '#ffffff' }}>{selected?.[preferences.language] || t('Settings', 'Mga setting')}</Text><Text style={{ color: '#ffffff', fontSize: 12, marginTop: 4 }}>TMC Copino MWOS</Text></View>
    </View>
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40, gap: 16 }}>
      {!selected ? <View style={[card, { padding: 6 }]}>{mobileSettingsSections.map((item) => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={item[preferences.language]} onPress={() => navigation.push('Settings', { section: item.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, minHeight: 64 }}><View style={{ padding: 10, borderRadius: 30, backgroundColor: palette.soft }}><MobileIcon name={item.icon} color={palette.text} size={23} /></View><Text style={{ flex: 1, fontSize: 16, color: palette.text }}>{item[preferences.language]}</Text><MobileIcon name="chevron-right" color={palette.muted} /></TouchableOpacity>)}</View> : null}
      {section === 'language' ? <View style={card}><Text style={body}>{t('Changes Settings menus and these preference panels on this phone. Clinical records and other screens keep their original language.', 'Binabago ang wika ng Settings menu at mga preference panel sa cellphone na ito. Hindi isinasalin ang clinical records at iba pang screen.')}</Text>{choices(t('Settings language', 'Wika ng Settings'), 'language', [['en', 'English'], ['fil', 'Filipino']])}</View> : null}
      {section === 'appearance' ? <View style={card}><Text style={body}>{t('Display theme for Settings on this phone. Other mobile screens keep their current clinic styling. These choices are not synced to your web account.', 'Theme ng Settings sa cellphone na ito. Mananatili ang kasalukuyang disenyo sa iba pang mobile screen. Hindi ito naka-sync sa web account.')}</Text>{choices(t('Settings theme', 'Theme ng Settings'), 'theme', [['light', t('Light', 'Maliwanag')], ['dark', t('Dark', 'Madilim')]])}{choices(t('Accent color', 'Kulay ng accent'), 'accent', [['coral', 'Coral'], ['teal', 'Teal'], ['graphite', 'Graphite']])}</View> : null}
      {section === 'account' ? <>
        <View style={card}><Text style={[body, { color: palette.text }]}>{auth.user?.email}</Text><Text style={body}>{t('Fingerprint and face unlock use the biometrics already enrolled on your phone.', 'Ginagamit ng fingerprint at face unlock ang biometrics na nakarehistro na sa cellphone.')}</Text><Text style={body}>{auth.biometricEnabled ? t('Biometric unlock: enabled', 'Biometric unlock: naka-enable') : t('Biometric unlock: not enabled', 'Biometric unlock: hindi naka-enable')}</Text>{action(auth.biometricEnabled ? t('Disable biometric unlock', 'I-disable ang biometric unlock') : t('Enable biometric unlock', 'I-enable ang biometric unlock'), toggleBiometrics, busy || (!auth.biometricEnabled && !auth.biometricAvailable))}{action(t('Review my profile', 'Suriin ang aking profile'), profile)}{action(t('Sign out', 'Mag-sign out'), auth.logout, busy)}</View>
        <ContactNumberCard />
      </> : null}
      {section === 'privacy-checkup' ? <View style={card}><Text style={body}>{t('Review individual controls; this is not a security certification or a guarantee of safety.', 'Suriin ang bawat control; hindi ito sertipikasyon o garantiya ng seguridad.')}</Text>{[
        [t('Sign-in email', 'Email sa pag-sign in'), auth.user?.email || t('Unavailable', 'Hindi available')],
        [t('Contact number', 'Contact number'), auth.user?.phone ? t('Saved; SMS ownership is not verified', 'Naka-save; hindi pa SMS-verified') : t('Not saved', 'Wala pang naka-save')],
        [t('Biometric unlock', 'Biometric unlock'), auth.biometricEnabled ? t('Enabled', 'Naka-enable') : t('Not enabled', 'Hindi naka-enable')],
        [t('Location permission', 'Pahintulot sa lokasyon'), permissionLabel(permissions.location)],
        [t('Notification permission', 'Pahintulot sa notifications'), permissionLabel(permissions.notifications)],
      ].map(([label, value]) => <View key={label} style={{ gap: 5, borderBottomWidth: 1, borderColor: palette.border, paddingBottom: 12 }}><Text style={{ color: palette.text, fontWeight: '700' }}>{label}</Text><Text style={body}>{value}</Text></View>)}{action(t('Open device permissions', 'Buksan ang device permissions'), openPermissions)}{action(t('Review account controls', 'Suriin ang account controls'), () => navigation.push('Settings', { section: 'account' }))}</View> : null}
      {section === 'privacy' ? <View style={card}><Text style={body}>{t('MWOS uses account, contact, appointment, and care information for clinic services. Access depends on your signed-in role. Lock your phone and never share passwords or verification codes.', 'Ginagamit ng MWOS ang account, contact, appointment, at care information para sa serbisyo ng klinika. Nakadepende ang access sa iyong role. I-lock ang cellphone at huwag ibahagi ang password o verification code.')}</Text><Text style={body}>{t('Fingerprint images are not collected by MWOS. The phone operating system verifies enrolled biometrics. Clinic videos may open a third-party service when you choose to view them.', 'Hindi kinokolekta ng MWOS ang larawan ng fingerprint. Ang operating system ng cellphone ang nagve-verify ng biometrics. Maaaring magbukas ng third-party service ang clinic videos kapag pinili mong panoorin ang mga ito.')}</Text><Text style={body}>{t('Ask the clinic to review correction, information-copy, or account-deletion requests after identity verification. This screen does not erase care records or promise deletion of records the clinic must retain.', 'Makipag-ugnayan sa klinika para sa pagwawasto, kopya ng impormasyon, o kahilingang burahin ang account matapos ang identity verification. Hindi binubura ng screen na ito ang care records.')}</Text>{action(t('Review my information', 'Suriin ang aking impormasyon'), profile)}{auth.user?.role === 'patient' ? action(t('Contact clinic securely', 'Ligtas na makipag-ugnayan sa klinika'), () => navigation.navigate('PatientNavigator', { screen: 'PatientMessages' })) : null}</View> : null}
      {section === 'activity' ? <View style={card}><Text style={body}>{t('Your latest 50 recorded clinic actions and Google sign-in notices. Not a complete device or login history. Sensitive audit payloads are never displayed.', 'Ang huling 50 naitalang clinic action at Google sign-in notice mo. Hindi ito kumpletong device o login history. Hindi ipinapakita ang sensitibong audit details.')}</Text>{activity.isLoading ? <Text style={body}>{t('Loading activity...', 'Kinukuha ang aktibidad...')}</Text> : activity.isError ? <><Text accessibilityRole="alert" style={body}>{t('Activity could not be loaded. No history has been cleared.', 'Hindi makuha ang aktibidad. Walang binurang history.')}</Text>{action(t('Retry', 'Subukan muli'), () => activity.refetch())}</> : !activity.data?.length ? <Text style={body}>{t('No recorded activity yet.', 'Wala pang naitalang aktibidad.')}</Text> : activity.data.map((item) => <View key={item.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: palette.border }}><Text style={{ color: palette.text, fontWeight: '700' }}>{item.action === 'GOOGLE_SIGN_IN' ? t('Google sign-in', 'Pag-sign in sa Google') : `${item.action} · ${item.area}`}</Text><Text style={body}>{Number.isFinite(Date.parse(item.createdAt)) ? new Date(item.createdAt).toLocaleString() : t('Date unavailable', 'Walang petsa')}</Text></View>)}</View> : null}
      {section === 'content' ? <View style={card}><Text style={body}>{t('Optional patient-dashboard content on this phone only. Appointments, care records, safety alerts, and the education library remain available. Staff work queues are unchanged.', 'Optional na nilalaman sa patient dashboard sa cellphone na ito. Mananatili ang appointments, care records, safety alerts, at education library. Hindi binabago ang staff work queues.')}</Text>{[
        ['showClinicMedia', t('Clinic videos and community events', 'Clinic videos at community events')],
        ['showTips', t('Health-tip previews', 'Mga preview ng health tips')],
      ].map(([key, label]) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={[body, { flex: 1, color: palette.text }]}>{label}</Text><Switch accessibilityLabel={label} value={preferences[key]} disabled={busy} onValueChange={(value) => save({ [key]: value })} trackColor={{ false: palette.border, true: palette.accent }} /></View>)}</View> : null}
      {notice ? <Text accessibilityRole="alert" style={{ color: palette.text, fontSize: 14, lineHeight: 20 }}>{notice}</Text> : null}
    </ScrollView>
  </View>
}
