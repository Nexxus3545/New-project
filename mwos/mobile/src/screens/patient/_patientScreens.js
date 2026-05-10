import React from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useAuthStore } from '../../hooks/useAuthStore';
import { Card, Badge, SectionHeader, EmptyState, LoadingScreen, AlertBox, StatCard, ListItem } from '../../components/ui';
import { colors, spacing } from '../../components/theme';

// ── Patient Home ──────────────────────────────────────────────
export function PatientHomeScreen() {
  const user = useAuthStore(s => s.user);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['patient-dashboard-mobile'],
    queryFn: () => api.get('/reports/patient-dashboard').then(r => r.data.data),
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingScreen message="Loading your health dashboard..." />;

  const d = data || {};

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>Hello, {user?.firstName}! 👋</Text>
          <Text style={s.headerSub}>Your health overview</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.rose[500]} />}
      >
        {/* Stats */}
        <View style={s.statsRow}>
          <StatCard icon="📅" label="Next Appointment" value={d.nextAppointment ? new Date(d.nextAppointment.scheduled_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : 'None'} patient />
          <StatCard icon="🤰" label="Due Date" value={d.activePregnancy ? new Date(d.activePregnancy.edd).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : 'N/A'} patient />
        </View>

        <View style={[s.statsRow, { marginTop: spacing.sm }]}>
          <StatCard icon="💓" label="Last BP" value={d.latestVitals?.bp_systolic ? `${d.latestVitals.bp_systolic}/${d.latestVitals.bp_diastolic}` : '—'} patient />
          <StatCard icon="💳" label="Unpaid" value={d.unpaidAmount > 0 ? `₱${d.unpaidAmount.toLocaleString()}` : 'None'} patient />
        </View>

        {/* Active pregnancy */}
        {d.activePregnancy && (
          <>
            <SectionHeader title="My Pregnancy" style={{ marginTop: spacing.lg }} />
            <Card patient>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.gray[900] }}>EDD: {new Date(d.activePregnancy.edd).toLocaleDateString('en-PH')}</Text>
                  <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 4 }}>G{d.activePregnancy.gravida}P{d.activePregnancy.para} · LMP: {new Date(d.activePregnancy.lmp).toLocaleDateString('en-PH')}</Text>
                </View>
                <Badge label={d.activePregnancy.risk_level + ' risk'} variant={d.activePregnancy.risk_level === 'high' ? 'danger' : d.activePregnancy.risk_level === 'moderate' ? 'warning' : 'success'} />
              </View>
            </Card>
          </>
        )}

        {/* Next appointment */}
        {d.nextAppointment && (
          <>
            <SectionHeader title="Next Visit" style={{ marginTop: spacing.lg }} />
            <Card>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.rose[600] }}>
                {new Date(d.nextAppointment.scheduled_date).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </Text>
              <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 4 }}>
                {d.nextAppointment.scheduled_time?.slice(0, 5)} · {d.nextAppointment.appointment_type}
              </Text>
            </Card>
          </>
        )}

        {/* Health tips preview */}
        <SectionHeader title="Health Tips" style={{ marginTop: spacing.lg }} />
        <HealthTipsPreview />
      </ScrollView>
    </View>
  );
}

function HealthTipsPreview() {
  const { data } = useQuery({
    queryKey: ['education-mobile-preview'],
    queryFn: () => api.get('/education').then(r => r.data.data?.slice(0, 3)),
  });
  if (!data?.length) return <EmptyState icon="📚" title="No tips available yet" />;
  return (
    <>
      {data.map(e => (
        <Card key={e.id} style={{ marginVertical: 4, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 28 }}>📖</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[900] }}>{e.title}</Text>
            <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 4, lineHeight: 17 }} numberOfLines={2}>{e.content}</Text>
          </View>
        </Card>
      ))}
    </>
  );
}

// ── Patient Appointments ──────────────────────────────────────
export function PatientAppointmentsScreen() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['patient-appts-mobile'],
    queryFn: () => api.get('/appointments').then(r => r.data.data),
  });

  const statusVariant = { scheduled: 'info', confirmed: 'success', completed: 'gray', cancelled: 'danger' };

  return (
    <View style={s.root}>
      <View style={s.patientHeader}><Text style={s.headerTitle}>My Appointments</Text></View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.rose[500]} />}>
        {isLoading ? null : !data?.length ?
          <EmptyState icon="📅" title="No appointments" subtitle="Your appointments will appear here" /> :
          data.map(a => (
            <Card key={a.id} style={{ marginVertical: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.gray[900] }}>
                    {new Date(a.scheduled_date).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>
                    {a.scheduled_time?.slice(0, 5)} · {a.appointment_type}
                  </Text>
                </View>
                <Badge label={a.status} variant={statusVariant[a.status] || 'gray'} />
              </View>
            </Card>
          ))
        }
      </ScrollView>
    </View>
  );
}

// ── Patient Vitals ────────────────────────────────────────────
export function PatientVitalsScreen() {
  const { data: me } = useQuery({ queryKey: ['patient-me-mobile'], queryFn: () => api.get('/patients/me').then(r => r.data.data) });
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['patient-vitals-mobile'],
    queryFn: () => api.get(`/vitals/patient/${me.id}`).then(r => r.data.data),
    enabled: !!me?.id,
  });

  const bpVariant = (cat) => (['stage2_hypertension','hypertensive_crisis'].includes(cat) ? 'danger' : cat === 'elevated' || cat?.includes('stage1') ? 'warning' : 'success');

  return (
    <View style={s.root}>
      <View style={s.patientHeader}><Text style={s.headerTitle}>My Vitals</Text></View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.rose[500]} />}>
        {isLoading ? null : !data?.length ?
          <EmptyState icon="💓" title="No vitals recorded yet" subtitle="Your healthcare provider will record your vitals at each visit" /> :
          data.map(v => (
            <Card key={v.id} style={{ marginVertical: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '600' }}>{new Date(v.visit_date).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                <Badge label={v.bp_category?.replace(/_/g, ' ')} variant={bpVariant(v.bp_category)} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                {[['Blood Pressure', `${v.bp_systolic}/${v.bp_diastolic} mmHg`], ['Weight', v.weight_kg ? `${v.weight_kg} kg` : null], ['Fetal HR', v.fetal_heart_rate ? `${v.fetal_heart_rate} bpm` : null], ['Movement', v.fetal_movement]].filter(([,val]) => val).map(([k, val]) => (
                  <View key={k}>
                    <Text style={{ fontSize: 10, color: colors.gray[400] }}>{k}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[800] }}>{val}</Text>
                  </View>
                ))}
              </View>
            </Card>
          ))
        }
      </ScrollView>
    </View>
  );
}

// ── Patient Records ───────────────────────────────────────────
export function PatientRecordsScreen() {
  const { data: me } = useQuery({ queryKey: ['patient-me-mobile'], queryFn: () => api.get('/patients/me').then(r => r.data.data) });
  const { data: labs } = useQuery({ queryKey: ['labs-mobile-me'], queryFn: () => api.get(`/emr/labs/${me.id}`).then(r => r.data.data), enabled: !!me?.id });
  const { data: rx } = useQuery({ queryKey: ['rx-mobile-me'], queryFn: () => api.get(`/emr/prescriptions/${me.id}`).then(r => r.data.data), enabled: !!me?.id });

  return (
    <View style={s.root}>
      <View style={s.patientHeader}><Text style={s.headerTitle}>My Records</Text></View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <SectionHeader title="Lab Results" />
        {!labs?.length ? <EmptyState icon="🔬" title="No lab results yet" /> :
          labs.map(l => (
            <Card key={l.id} style={{ marginVertical: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600' }}>{l.test_name}</Text>
                  <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 2 }}>{new Date(l.test_date).toLocaleDateString('en-PH')} · {l.result_value} {l.unit}</Text>
                </View>
                <Badge label={l.status} variant={l.status === 'normal' ? 'success' : l.status === 'critical' ? 'danger' : 'warning'} />
              </View>
            </Card>
          ))
        }

        <SectionHeader title="Prescriptions" style={{ marginTop: spacing.lg }} />
        {!rx?.length ? <EmptyState icon="💊" title="No prescriptions yet" /> :
          rx.map(r => (
            <Card key={r.id} style={{ marginVertical: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600' }}>{r.medication_name}</Text>
              <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 4 }}>{r.dosage} · {r.frequency} · {r.route}</Text>
              {r.instructions && <Text style={{ fontSize: 11, color: colors.gray[400], marginTop: 4, fontStyle: 'italic' }}>{r.instructions}</Text>}
            </Card>
          ))
        }
      </ScrollView>
    </View>
  );
}

// ── Patient Education ─────────────────────────────────────────
export function PatientEducationScreen() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['education-mobile'],
    queryFn: () => api.get('/education').then(r => r.data.data),
  });

  return (
    <View style={s.root}>
      <View style={s.patientHeader}><Text style={s.headerTitle}>Health Tips</Text></View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.rose[500]} />}>
        {isLoading ? null : !data?.length ? <EmptyState icon="📚" title="No tips yet" /> :
          data.map(e => (
            <Card key={e.id} style={{ marginVertical: 4 }}>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <Badge label={e.category || 'General'} variant="patient" />
                {e.trimester_target !== 'all' && <Badge label={e.trimester_target} variant="gray" />}
              </View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.gray[900], marginBottom: 6 }}>{e.title}</Text>
              <Text style={{ fontSize: 13, color: colors.gray[600], lineHeight: 20 }}>{e.content}</Text>
            </Card>
          ))
        }
      </ScrollView>
    </View>
  );
}

// ── Patient Profile ───────────────────────────────────────────
export function PatientProfileScreen() {
  const { user, logout } = useAuthStore();
  const { data: me, isLoading } = useQuery({ queryKey: ['patient-me-mobile'], queryFn: () => api.get('/patients/me').then(r => r.data.data) });

  if (isLoading) return <LoadingScreen />;
  const p = me || {};

  return (
    <View style={s.root}>
      <View style={[s.patientHeader, { flexDirection: 'column', alignItems: 'center', paddingBottom: 24 }]}>
        <View style={s.profileAvatar}>
          <Text style={s.profileAvatarText}>{p.first_name?.[0]}{p.last_name?.[0]}</Text>
        </View>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.white, marginTop: 10 }}>{p.first_name} {p.last_name}</Text>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>{p.city || 'Tabaco City'}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <Card>
          {[
            ['Date of Birth', p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString('en-PH') : '—'],
            ['Blood Type', p.blood_type || '—'],
            ['PhilHealth ID', p.philhealth_id || '—'],
            ['Civil Status', p.civil_status || '—'],
            ['Phone', p.phone || '—'],
            ['Allergies', p.allergies || 'None known'],
            ['Conditions', p.existing_conditions || 'None'],
            ['Emergency Contact', p.emergency_contact_name || '—'],
            ['Emergency Phone', p.emergency_contact_phone || '—'],
          ].map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}>
              <Text style={{ fontSize: 13, color: colors.gray[400], width: 120 }}>{k}</Text>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: k === 'Allergies' && v !== 'None known' ? colors.danger : colors.gray[800] }}>{v}</Text>
            </View>
          ))}
        </Card>

        <TouchableOpacity onPress={logout} style={s.logoutBig} activeOpacity={0.8}>
          <Text style={{ fontSize: 16 }}>🚪</Text>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.danger }}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.gray[50] },
  header: { backgroundColor: colors.rose[600], paddingTop: 52, paddingBottom: 20, paddingHorizontal: spacing.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  patientHeader: { backgroundColor: colors.rose[600], paddingTop: 52, paddingBottom: 16, paddingHorizontal: spacing.xl },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.white },
  greeting: { fontSize: 20, fontWeight: '700', color: colors.white },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  profileAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  profileAvatarText: { fontSize: 30, fontWeight: '700', color: colors.white },
  logoutBig: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, paddingVertical: 14, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: '#fecaca' },
});
