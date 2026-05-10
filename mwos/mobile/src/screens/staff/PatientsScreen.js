import React, { useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Badge, EmptyState, LoadingScreen, AlertBox } from '../../components/ui';
import { colors, spacing, radius } from '../../components/theme';

export default function PatientsScreen({ navigation }) {
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch, isRefetching, error } = useQuery({
    queryKey: ['patients-mobile', search],
    queryFn: () => api.get('/patients', { params: { search, limit: 100 } }).then((r) => r.data.data),
    keepPreviousData: true,
  });

  const patients = data || [];

  const renderItem = ({ item: p }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('PatientDetail', { patientId: p.id, patientName: `${p.first_name} ${p.last_name}` })}
      style={styles.card}
      activeOpacity={0.8}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{p.first_name[0]}{p.last_name[0]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{p.first_name} {p.last_name}</Text>
        <Text style={styles.sub}>{p.phone || 'No phone'} · {p.city || 'Tabaco City'}</Text>
        {p.allergies && p.allergies !== 'None known' && (
          <Text style={styles.allergy}>⚠️ Allergy: {p.allergies}</Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Badge
          label={p.risk_level || 'low'}
          variant={p.risk_level === 'high' ? 'danger' : p.risk_level === 'moderate' ? 'warning' : 'success'}
        />
        {p.pregnancy_status === 'active' && <Badge label="Pregnant" variant="info" />}
      </View>
    </TouchableOpacity>
  );

  if (isLoading) return <LoadingScreen message="Loading patients..." />;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Patients</Text>
        <Text style={styles.headerSub}>{patients.length} registered</Text>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, phone, PhilHealth ID..."
          placeholderTextColor={colors.gray[400]}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={{ color: colors.gray[400], fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {error && <AlertBox type="critical" message={error.response?.data?.message || 'Failed to load patients'} />}

      <FlatList
        data={patients}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        ListEmptyComponent={
          <EmptyState icon="👩‍⚕️" title="No patients found" subtitle={search ? 'Try a different search term' : 'No patients registered yet'} />
        }
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.teal[600]} />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.gray[50] },
  header: {
    backgroundColor: colors.teal[600], paddingTop: 52,
    paddingBottom: 16, paddingHorizontal: spacing.xl,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.white },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.sm,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.gray[200],
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.gray[800] },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    borderRadius: 14, padding: spacing.md, marginVertical: 4,
    borderWidth: 1, borderColor: colors.gray[100], gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, elevation: 2,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.teal[100],
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '700', color: colors.teal[700] },
  name: { fontSize: 14, fontWeight: '600', color: colors.gray[900] },
  sub: { fontSize: 12, color: colors.gray[500], marginTop: 2 },
  allergy: { fontSize: 11, color: colors.danger, marginTop: 3 },
});
