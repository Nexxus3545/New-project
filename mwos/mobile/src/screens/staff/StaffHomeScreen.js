import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, StyleSheet,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import api from '../../services/api';
import { useAuthStore } from '../../hooks/useAuthStore';
import {
  Card, StatCard, SectionHeader, LoadingScreen,
  AlertBox, ListItem, Badge,
} from '../../components/ui';
import { colors, spacing } from '../../components/theme';

export default function StaffHomeScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const { logout } = useAuthStore();

  const { data, isLoading, refetch, isRefetching, error } = useQuery({
    queryKey: ['dashboard-mobile'],
    queryFn: () => api.get('/reports/dashboard').then((r) => r.data.data),
    refetchInterval: 60000,
  });

  const handleLogout = async () => {
    await logout();
  };

  if (isLoading) return <LoadingScreen message="Loading dashboard..." />;

  const stats = data?.stats || {};
  const todayAppts = data?.todayAppointments || [];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good day, {user?.firstName}! 👋</Text>
          <Text style={styles.headerSub}>TMC Copino MWOS</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={{ fontSize: 16 }}>🚪</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.teal[600]} />
        }
      >
        {/* Error */}
        {error && (
          <AlertBox type="critical" message={error.response?.data?.message || 'Failed to load dashboard'} />
        )}

        {/* Critical alerts */}
        {stats.recentAlerts > 0 && (
          <AlertBox
            type="critical"
            message={`${stats.recentAlerts} critical alert${stats.recentAlerts > 1 ? 's' : ''} in the last 24 hours — check patient vitals immediately`}
          />
        )}

        {/* Stats grid */}
        <SectionHeader title="Overview" />
        <View style={styles.statsGrid}>
          <StatCard icon="👩" label="Patients" value={stats.totalPatients} color="teal" />
          <StatCard icon="🤰" label="Active Pregnancies" value={stats.activePregnancies} color="blue" />
        </View>
        <View style={[styles.statsGrid, { marginTop: spacing.sm }]}>
          <StatCard icon="📅" label="Today" value={stats.todayAppointments} color="teal" />
          <StatCard icon="🏥" label="This Month" value={stats.deliveriesThisMonth} color="teal" />
        </View>
        <View style={[styles.statsGrid, { marginTop: spacing.sm, marginBottom: spacing.lg }]}>
          <StatCard icon="⚠️" label="High Risk" value={stats.highRiskPatients} color="red" />
          <StatCard icon="📦" label="Low Stock" value={stats.lowInventory} color="amber" />
        </View>

        {/* Today's appointments */}
        <SectionHeader
          title="Today's Appointments"
          action="View All"
          onAction={() => navigation.navigate('Appointments')}
        />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {todayAppts.length === 0 ? (
            <View style={styles.emptyAppts}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>📅</Text>
              <Text style={{ fontSize: 14, color: colors.gray[400] }}>No appointments today</Text>
            </View>
          ) : (
            todayAppts.map((appt, i) => (
              <View key={i} style={[styles.apptItem, i === todayAppts.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.apptTime}>
                  <Text style={styles.apptTimeText}>{appt.scheduled_time?.slice(0, 5)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.apptName}>{appt.patient_name}</Text>
                  <Text style={styles.apptType}>{appt.appointment_type}</Text>
                </View>
                <Badge
                  label={appt.risk_level || 'low'}
                  variant={appt.risk_level === 'high' ? 'danger' : appt.risk_level === 'moderate' ? 'warning' : 'success'}
                />
              </View>
            ))
          )}
        </Card>

        {/* Quick actions */}
        <SectionHeader title="Quick Actions" style={{ marginTop: spacing.lg }} />
        <View style={styles.quickActions}>
          {[
            { icon: '👩‍⚕️', label: 'Patients', screen: 'Patients' },
            { icon: '📅', label: 'Schedule', screen: 'Appointments' },
            { icon: '🏥', label: 'Deliveries', screen: 'Deliveries' },
            { icon: '📦', label: 'Inventory', screen: 'Inventory' },
          ].map((action) => (
            <TouchableOpacity
              key={action.screen}
              onPress={() => navigation.navigate(action.screen)}
              style={styles.quickBtn}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 28 }}>{action.icon}</Text>
              <Text style={styles.quickBtnLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.gray[50] },
  header: {
    backgroundColor: colors.teal[600], paddingTop: 52, paddingBottom: 20,
    paddingHorizontal: spacing.xl, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'flex-end',
  },
  greeting: { fontSize: 20, fontWeight: '700', color: colors.white },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10,
    padding: 8, alignItems: 'center', justifyContent: 'center',
  },
  scroll: { padding: spacing.lg, paddingBottom: 100 },
  statsGrid: { flexDirection: 'row', gap: spacing.sm },
  emptyAppts: { alignItems: 'center', paddingVertical: 32 },
  apptItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.gray[100], gap: 12,
  },
  apptTime: { backgroundColor: colors.teal[50], borderRadius: 8, padding: 6, minWidth: 50, alignItems: 'center' },
  apptTimeText: { fontSize: 12, fontWeight: '700', color: colors.teal[700], fontVariant: ['tabular-nums'] },
  apptName: { fontSize: 14, fontWeight: '500', color: colors.gray[900] },
  apptType: { fontSize: 12, color: colors.gray[500], marginTop: 1, textTransform: 'capitalize' },
  quickActions: { flexDirection: 'row', gap: spacing.sm },
  quickBtn: {
    flex: 1, backgroundColor: colors.white, borderRadius: 14, padding: 14,
    alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.gray[100],
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 2,
  },
  quickBtnLabel: { fontSize: 11, fontWeight: '600', color: colors.gray[600], textAlign: 'center' },
});
