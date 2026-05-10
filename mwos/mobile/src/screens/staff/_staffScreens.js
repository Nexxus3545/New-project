import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useAuthStore } from '../../hooks/useAuthStore';
import { Card, Badge, SectionHeader, EmptyState, LoadingScreen, AlertBox, Button, Input, StatCard } from '../../components/ui';
import { colors, spacing, radius } from '../../components/theme';

// ── Patient Detail ────────────────────────────────────────────
export function PatientDetailScreen({ route, navigation }) {
  const { patientId } = route.params;
  const [tab, setTab] = useState('Overview');
  const tabs = ['Overview', 'Vitals', 'Pregnancies', 'Labs'];

  const { data: summary, isLoading, error, refetch } = useQuery({
    queryKey: ['patient-summary-mobile', patientId],
    queryFn: () => api.get(`/patients/${patientId}/summary`).then(r => r.data.data),
  });

  const { data: vitals } = useQuery({
    queryKey: ['vitals-mobile', patientId],
    queryFn: () => api.get(`/vitals/patient/${patientId}`).then(r => r.data.data),
    enabled: tab === 'Vitals',
  });

  const { data: labs } = useQuery({
    queryKey: ['labs-mobile', patientId],
    queryFn: () => api.get(`/emr/labs/${patientId}`).then(r => r.data.data),
    enabled: tab === 'Labs',
  });

  if (isLoading) return <LoadingScreen />;
  if (error) return <View style={{ padding: 20 }}><AlertBox type="critical" message={error.response?.data?.message || 'Failed to load patient'} /></View>;

  const p = summary?.patient || {};
  const bpBadge = (cat) => (['stage2_hypertension','hypertensive_crisis'].includes(cat) ? 'danger' : cat === 'elevated' || cat === 'stage1_hypertension' ? 'warning' : 'success');

  return (
    <View style={s.root}>
      {/* Patient header */}
      <View style={s.patientHeader}>
        <View style={s.patientAvatar}>
          <Text style={s.patientAvatarText}>{p.first_name?.[0]}{p.last_name?.[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.patientName}>{p.first_name} {p.last_name}</Text>
          <Text style={s.patientSub}>{p.phone} · {p.blood_type || 'Blood type unknown'}</Text>
          {p.allergies && p.allergies !== 'None known' && (
            <Text style={{ fontSize: 11, color: '#fca5a5', marginTop: 2 }}>⚠️ {p.allergies}</Text>
          )}
        </View>
        <Badge label={p.risk_level} variant={p.risk_level === 'high' ? 'danger' : p.risk_level === 'moderate' ? 'warning' : 'success'} />
      </View>

      {/* Active pregnancy banner */}
      {summary?.activePregnancy && (
        <View style={s.pregnancyBanner}>
          <Text style={{ fontSize: 14 }}>🤰</Text>
          <Text style={s.pregnancyText}>EDD: {new Date(summary.activePregnancy.edd).toLocaleDateString('en-PH')} · {summary.activePregnancy.risk_level} risk</Text>
        </View>
      )}

      {/* Tabs */}
      <View style={s.tabs}>
        {tabs.map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[s.tab, tab === t && s.tabActive]}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.teal[600]} />}>

        {tab === 'Overview' && (
          <>
            <SectionHeader title="Recent Vitals" />
            {!summary?.recentVitals?.length ? <EmptyState icon="💓" title="No vitals yet" /> :
              summary.recentVitals.map(v => (
                <Card key={v.id} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={{ fontWeight: '600', fontSize: 14 }}>{new Date(v.visit_date).toLocaleDateString('en-PH')}</Text>
                      <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 2 }}>BP: {v.bp_systolic}/{v.bp_diastolic} · Wt: {v.weight_kg}kg</Text>
                    </View>
                    <Badge label={v.bp_category?.replace(/_/g,' ')} variant={bpBadge(v.bp_category)} />
                  </View>
                </Card>
              ))
            }
            <Button title="+ Record Vitals" onPress={() => navigation.navigate('VitalsForm', { patientId, pregnancyId: summary?.activePregnancy?.id })} style={{ marginTop: 8 }} />

            <SectionHeader title="Upcoming Appointments" style={{ marginTop: 16 }} />
            {!summary?.upcomingAppointments?.length ? <EmptyState icon="📅" title="No upcoming appointments" /> :
              summary.upcomingAppointments.map(a => (
                <Card key={a.id} style={{ marginBottom: 8 }}>
                  <Text style={{ fontWeight: '600', fontSize: 14 }}>{new Date(a.scheduled_date).toLocaleDateString('en-PH')} · {a.scheduled_time?.slice(0,5)}</Text>
                  <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 2, textTransform: 'capitalize' }}>{a.appointment_type}</Text>
                </Card>
              ))
            }
          </>
        )}

        {tab === 'Vitals' && (
          <>
            {!vitals?.length ? <EmptyState icon="💓" title="No vitals recorded" /> :
              vitals.map(v => (
                <Card key={v.id} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '600', fontSize: 13 }}>{new Date(v.visit_date).toLocaleDateString('en-PH')}</Text>
                    <Badge label={v.bp_category?.replace(/_/g,' ')} variant={bpBadge(v.bp_category)} />
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
                    {[['BP', `${v.bp_systolic}/${v.bp_diastolic}`], ['Weight', `${v.weight_kg}kg`], ['FHR', `${v.fetal_heart_rate}bpm`], ['Movement', v.fetal_movement]].map(([k, val]) => val && val !== 'null' && (
                      <View key={k}><Text style={{ fontSize: 10, color: colors.gray[400] }}>{k}</Text><Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[800] }}>{val}</Text></View>
                    ))}
                  </View>
                </Card>
              ))
            }
          </>
        )}

        {tab === 'Pregnancies' && (
          <>{summary?.patient?.pregnancies?.filter(Boolean).length === 0 ?
            <EmptyState icon="🤰" title="No pregnancy records" /> :
            (summary?.patient?.pregnancies || []).filter(Boolean).map(pr => (
              <Card key={pr.id} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '600' }}>EDD: {new Date(pr.edd).toLocaleDateString('en-PH')}</Text>
                  <Badge label={pr.status} variant={pr.status === 'active' ? 'success' : 'gray'} />
                </View>
                <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 4 }}>G{pr.gravida}P{pr.para} · LMP: {new Date(pr.lmp).toLocaleDateString('en-PH')}</Text>
              </Card>
            ))
          }</>
        )}

        {tab === 'Labs' && (
          <>{!labs?.length ? <EmptyState icon="🔬" title="No lab results" /> :
            labs.map(l => (
              <Card key={l.id} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '600', fontSize: 14 }}>{l.test_name}</Text>
                  <Badge label={l.status} variant={l.status === 'normal' ? 'success' : l.status === 'critical' ? 'danger' : 'warning'} />
                </View>
                <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 4 }}>{new Date(l.test_date).toLocaleDateString('en-PH')} · {l.result_value} {l.unit}</Text>
              </Card>
            ))
          }</>
        )}
      </ScrollView>
    </View>
  );
}

// ── Appointments Screen ───────────────────────────────────────
export function AppointmentsScreen() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['appointments-mobile'],
    queryFn: () => api.get('/appointments/today').then(r => r.data.data),
    refetchInterval: 30000,
  });

  const qc = useQueryClient();
  const updateMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/appointments/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries(['appointments-mobile']),
  });

  const statusColor = { scheduled: 'info', confirmed: 'success', completed: 'gray', cancelled: 'danger', no_show: 'warning' };

  return (
    <View style={s.root}>
      <View style={s.header}><Text style={s.headerTitle}>Today's Appointments</Text></View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.teal[600]} />}>
        {isLoading ? null : !data?.length ? <EmptyState icon="📅" title="No appointments today" subtitle="All clear for today!" /> :
          data.map(a => (
            <Card key={a.id} style={{ marginVertical: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.gray[900] }}>{a.patient_name}</Text>
                  <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 2 }}>{a.scheduled_time?.slice(0,5)} · {a.appointment_type}</Text>
                </View>
                <Badge label={a.status} variant={statusColor[a.status] || 'gray'} />
              </View>
              {a.status === 'scheduled' && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity onPress={() => updateMut.mutate({ id: a.id, status: 'completed' })} style={[s.actionBtn, { backgroundColor: colors.teal[50] }]}>
                    <Text style={{ fontSize: 12, color: colors.teal[700], fontWeight: '600' }}>✓ Done</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => updateMut.mutate({ id: a.id, status: 'no_show' })} style={[s.actionBtn, { backgroundColor: '#fff7ed' }]}>
                    <Text style={{ fontSize: 12, color: '#92400e', fontWeight: '600' }}>No Show</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => updateMut.mutate({ id: a.id, status: 'cancelled' })} style={[s.actionBtn, { backgroundColor: '#fef2f2' }]}>
                    <Text style={{ fontSize: 12, color: colors.danger, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          ))
        }
      </ScrollView>
    </View>
  );
}

// ── Vitals Form Screen ────────────────────────────────────────
export function VitalsFormScreen({ route, navigation }) {
  const { patientId, pregnancyId } = route.params || {};
  const qc = useQueryClient();
  const [form, setForm] = useState({ visitDate: new Date().toISOString().split('T')[0], bpSystolic: '', bpDiastolic: '', weightKg: '', fetalHeartRate: '', fetalMovement: 'present', pulseRate: '', temperature: '', notes: '' });
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState([]);

  const mut = useMutation({
    mutationFn: (body) => api.post('/vitals', body),
    onSuccess: (res) => {
      setAlerts(res.data.alerts || []);
      qc.invalidateQueries(['vitals-mobile', patientId]);
      qc.invalidateQueries(['patient-summary-mobile', patientId]);
      if (!res.data.alerts?.length) navigation.goBack();
    },
    onError: (err) => setError(err.response?.data?.message || 'Failed to save vitals'),
  });

  const handleSubmit = () => {
    if (!form.visitDate) return setError('Visit date is required');
    setError('');
    mut.mutate({ patientId, pregnancyId: pregnancyId || null, ...form });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
      {alerts.map((a, i) => <AlertBox key={i} type={a.type === 'critical' ? 'critical' : 'warning'} message={a.message} />)}
      {error && <AlertBox type="critical" message={error} />}

      <Input label="Visit Date" value={form.visitDate} onChangeText={t => setForm(f => ({ ...f, visitDate: t }))} placeholder="YYYY-MM-DD" />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Input label="BP Systolic" value={form.bpSystolic} onChangeText={t => setForm(f => ({ ...f, bpSystolic: t }))} placeholder="120" keyboardType="numeric" /></View>
        <View style={{ flex: 1 }}><Input label="BP Diastolic" value={form.bpDiastolic} onChangeText={t => setForm(f => ({ ...f, bpDiastolic: t }))} placeholder="80" keyboardType="numeric" /></View>
      </View>
      <Input label="Weight (kg)" value={form.weightKg} onChangeText={t => setForm(f => ({ ...f, weightKg: t }))} placeholder="55.0" keyboardType="decimal-pad" />
      <Input label="Fetal Heart Rate (bpm)" value={form.fetalHeartRate} onChangeText={t => setForm(f => ({ ...f, fetalHeartRate: t }))} placeholder="140" keyboardType="numeric" />
      <View style={{ marginBottom: 16 }}>
        <Text style={s.formLabel}>Fetal Movement</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {['present', 'decreased', 'absent'].map(opt => (
            <TouchableOpacity key={opt} onPress={() => setForm(f => ({ ...f, fetalMovement: opt }))}
              style={[s.optBtn, form.fetalMovement === opt && s.optBtnActive]}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: form.fetalMovement === opt ? colors.white : colors.gray[600], textTransform: 'capitalize' }}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Input label="Pulse Rate" value={form.pulseRate} onChangeText={t => setForm(f => ({ ...f, pulseRate: t }))} placeholder="80" keyboardType="numeric" />
      <Input label="Temperature (°C)" value={form.temperature} onChangeText={t => setForm(f => ({ ...f, temperature: t }))} placeholder="36.8" keyboardType="decimal-pad" />
      <Input label="Notes" value={form.notes} onChangeText={t => setForm(f => ({ ...f, notes: t }))} placeholder="Any observations..." multiline numberOfLines={3} style={{ height: 80, textAlignVertical: 'top' }} />
      <Button title={mut.isPending ? 'Saving...' : 'Save Vitals'} onPress={handleSubmit} loading={mut.isPending} />
    </ScrollView>
  );
}

// ── Deliveries Screen ─────────────────────────────────────────
export function DeliveriesScreen() {
  const { data: patients } = useQuery({ queryKey: ['patients-mobile-list'], queryFn: () => api.get('/patients', { params: { limit: 200 } }).then(r => r.data.data) });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ patientId: '', deliveryDate: new Date().toISOString().split('T')[0], deliveryType: 'NSD', newbornSex: '', birthWeightKg: '', apgar1min: '', apgar5min: '', notes: '' });
  const [error, setError] = useState('');
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: (body) => api.post('/deliveries', body),
    onSuccess: () => { qc.invalidateQueries(['dashboard-mobile']); setShowForm(false); setError(''); },
    onError: (err) => setError(err.response?.data?.message || 'Failed to record delivery'),
  });

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Deliveries</Text>
        <TouchableOpacity onPress={() => setShowForm(true)} style={s.headerBtn}><Text style={{ color: colors.white, fontWeight: '600', fontSize: 13 }}>+ Record</Text></TouchableOpacity>
      </View>
      {showForm ? (
        <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 16 }}>Record Delivery</Text>
          {error && <AlertBox type="critical" message={error} />}
          <View style={{ marginBottom: 16 }}>
            <Text style={s.formLabel}>Patient</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              {(patients || []).slice(0, 15).map(p => (
                <TouchableOpacity key={p.id} onPress={() => setForm(f => ({ ...f, patientId: p.id }))} style={[s.optBtn, form.patientId === p.id && s.optBtnActive, { marginRight: 6 }]}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: form.patientId === p.id ? colors.white : colors.gray[600] }}>{p.first_name} {p.last_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <Input label="Delivery Date" value={form.deliveryDate} onChangeText={t => setForm(f => ({ ...f, deliveryDate: t }))} placeholder="YYYY-MM-DD" />
          <View style={{ marginBottom: 16 }}>
            <Text style={s.formLabel}>Delivery Type</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['NSD','CS','Forceps','Vacuum'].map(opt => (
                <TouchableOpacity key={opt} onPress={() => setForm(f => ({ ...f, deliveryType: opt }))} style={[s.optBtn, form.deliveryType === opt && s.optBtnActive]}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: form.deliveryType === opt ? colors.white : colors.gray[600] }}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><Input label="APGAR 1min" value={form.apgar1min} onChangeText={t => setForm(f => ({ ...f, apgar1min: t }))} keyboardType="numeric" /></View>
            <View style={{ flex: 1 }}><Input label="APGAR 5min" value={form.apgar5min} onChangeText={t => setForm(f => ({ ...f, apgar5min: t }))} keyboardType="numeric" /></View>
          </View>
          <Input label="Birth Weight (kg)" value={form.birthWeightKg} onChangeText={t => setForm(f => ({ ...f, birthWeightKg: t }))} placeholder="3.200" keyboardType="decimal-pad" />
          <Input label="Notes / Complications" value={form.notes} onChangeText={t => setForm(f => ({ ...f, notes: t }))} multiline numberOfLines={3} style={{ height: 80, textAlignVertical: 'top' }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button title={mut.isPending ? 'Saving...' : 'Save'} onPress={() => mut.mutate(form)} loading={mut.isPending} style={{ flex: 1 }} />
            <Button title="Cancel" onPress={() => setShowForm(false)} variant="secondary" style={{ flex: 1 }} />
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🏥</Text>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.gray[700] }}>Delivery Management</Text>
          <Text style={{ fontSize: 13, color: colors.gray[400], marginTop: 6, textAlign: 'center', paddingHorizontal: 40 }}>Tap "+ Record" to document a new delivery</Text>
        </View>
      )}
    </View>
  );
}

// ── Inventory Screen ──────────────────────────────────────────
export function InventoryScreen() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['inventory-mobile'],
    queryFn: () => api.get('/inventory').then(r => r.data.data),
  });

  const adjMut = useMutation({
    mutationFn: ({ id, adj }) => api.patch(`/inventory/${id}/adjust`, { adjustment: adj }),
    onSuccess: () => qc.invalidateQueries(['inventory-mobile']),
  });

  const items = data || [];
  const lowStock = items.filter(i => i.quantity <= i.reorder_level);

  return (
    <View style={s.root}>
      <View style={s.header}><Text style={s.headerTitle}>Inventory</Text></View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.teal[600]} />}>
        {lowStock.length > 0 && <AlertBox type="warning" message={`${lowStock.length} item${lowStock.length > 1 ? 's' : ''} at or below reorder level`} />}
        {isLoading ? null : items.map(item => (
          <Card key={item.id} style={{ marginVertical: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{item.item_name}</Text>
                <Text style={{ fontSize: 12, color: colors.gray[500], marginTop: 2 }}>{item.category} · Reorder at {item.reorder_level}</Text>
              </View>
              <Badge label={item.quantity <= 0 ? 'Out' : item.quantity <= item.reorder_level ? 'Low' : 'OK'} variant={item.quantity <= 0 ? 'danger' : item.quantity <= item.reorder_level ? 'warning' : 'success'} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.teal[700] }}>{item.quantity} <Text style={{ fontSize: 13, fontWeight: '400', color: colors.gray[500] }}>{item.unit}</Text></Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => adjMut.mutate({ id: item.id, adj: -1 })} style={[s.adjBtn, { backgroundColor: '#fef2f2' }]}><Text style={{ color: colors.danger, fontWeight: '700' }}>−</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => adjMut.mutate({ id: item.id, adj: 1 })} style={[s.adjBtn, { backgroundColor: colors.teal[50] }]}><Text style={{ color: colors.teal[700], fontWeight: '700' }}>+</Text></TouchableOpacity>
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

// ── Staff Profile Screen ──────────────────────────────────────
export function StaffProfileScreen() {
  const { user, logout } = useAuthStore();
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
      <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.teal[100], alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.teal[700] }}>{user?.firstName?.[0]}{user?.lastName?.[0]}</Text>
        </View>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.gray[900] }}>{user?.firstName} {user?.lastName}</Text>
        <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 4, textTransform: 'capitalize' }}>{user?.role}</Text>
      </Card>
      <Card style={{ marginTop: 12 }}>
        {[['Email', user?.email], ['Role', user?.role], ['ID', user?.id?.slice(0,8) + '...']].map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}>
            <Text style={{ fontSize: 13, color: colors.gray[500], width: 80 }}>{k}</Text>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: colors.gray[800], textTransform: 'capitalize' }}>{v}</Text>
          </View>
        ))}
      </Card>
      <Button title="Sign Out" variant="danger" onPress={logout} style={{ marginTop: 20 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.gray[50] },
  header: { backgroundColor: colors.teal[600], paddingTop: 52, paddingBottom: 16, paddingHorizontal: spacing.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.white },
  headerBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  patientHeader: { backgroundColor: colors.teal[600], paddingTop: 8, paddingBottom: 16, paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: 12 },
  patientAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  patientAvatarText: { fontSize: 18, fontWeight: '700', color: colors.white },
  patientName: { fontSize: 17, fontWeight: '700', color: colors.white },
  patientSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  pregnancyBanner: { backgroundColor: '#eff6ff', paddingHorizontal: spacing.lg, paddingVertical: 10, flexDirection: 'row', gap: 8, alignItems: 'center' },
  pregnancyText: { fontSize: 13, fontWeight: '500', color: colors.info },
  tabs: { flexDirection: 'row', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.teal[600] },
  tabText: { fontSize: 13, fontWeight: '500', color: colors.gray[500] },
  tabTextActive: { color: colors.teal[700], fontWeight: '600' },
  actionBtn: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  formLabel: { fontSize: 13, fontWeight: '500', color: colors.gray[600], marginBottom: 6 },
  optBtn: { borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  optBtnActive: { backgroundColor: colors.teal[600], borderColor: colors.teal[600] },
  adjBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

export default PatientDetailScreen;
