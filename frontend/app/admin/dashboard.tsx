import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { adminApi } from '@/api/client';
import { GlassCard } from '@/components/GlassCard';
import { theme } from '@/theme/darkTheme';

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await adminApi.getStats();
      setStats(s);
    } catch {
      router.replace('/admin/login');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const logout = async () => {
    await AsyncStorage.removeItem('admin_token');
    router.replace('/admin/login');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color={theme.colors.accent.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-admin-dashboard">
      <View style={styles.topRow}>
        <Text style={styles.brand}>Admin Dashboard</Text>
        <TouchableOpacity onPress={logout} style={styles.iconBtn} testID="admin-logout">
          <Ionicons name="log-out-outline" size={20} color={theme.colors.text.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#fff" />}
      >
        <View style={styles.grid}>
          <Card label="Потребители" value={stats?.total_users ?? 0} icon="people-outline" testID="stat-users" />
          <Card label="Групи" value={stats?.total_groups ?? 0} icon="grid-outline" testID="stat-groups" />
          <Card label="Активни мачове" value={stats?.active_matches ?? 0} icon="football-outline" testID="stat-active-matches" />
          <Card label="PRO групи" value={stats?.pro_groups ?? 0} icon="star" color={theme.colors.accent.gold} testID="stat-pro" />
          <Card label="FREE групи" value={stats?.free_groups ?? 0} icon="ribbon-outline" testID="stat-free" />
          <Card label="Trial групи" value={stats?.trial_groups ?? 0} icon="hourglass-outline" color={theme.colors.accent.primary} testID="stat-trial" />
        </View>

        <Text style={styles.section}>Метрики</Text>
        <GlassCard style={{ marginBottom: 8 }} testID="revenue-card">
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Приход</Text>
            <Text style={styles.metricValue}>{(stats?.total_revenue_eur ?? 0).toFixed(2)} €</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Регистрации (последни 7 дни)</Text>
            <Text style={styles.metricValue}>{stats?.signups_last_7_days ?? 0}</Text>
          </View>
          <View style={[styles.metricRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.metricLabel}>Мачове (последни 7 дни)</Text>
            <Text style={styles.metricValue}>{stats?.matches_last_7_days ?? 0}</Text>
          </View>
        </GlassCard>

        <Text style={styles.section}>Навигация</Text>
        <View style={styles.navRow}>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => router.push('/admin/groups')}
            testID="nav-groups"
          >
            <Ionicons name="grid-outline" size={22} color={theme.colors.accent.primary} />
            <Text style={styles.navText}>Групи</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => router.push('/admin/users')}
            testID="nav-users"
          >
            <Ionicons name="people-outline" size={22} color={theme.colors.accent.primary} />
            <Text style={styles.navText}>Потребители</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const Card: React.FC<{ label: string; value: any; icon: any; color?: string; testID?: string }> = ({ label, value, icon, color, testID }) => (
  <View style={styles.card} testID={testID}>
    <Ionicons name={icon} size={20} color={color || theme.colors.text.muted} />
    <Text style={styles.cardLabel}>{label}</Text>
    <Text style={[styles.cardValue, color && { color }]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  brand: { color: theme.colors.text.primary, fontSize: 20, fontWeight: '800' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.background.card,
    alignItems: 'center', justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: {
    width: '32%', padding: 14, borderRadius: 12,
    backgroundColor: theme.colors.background.card,
    borderWidth: 1, borderColor: theme.colors.border.primary,
    minWidth: 120,
  },
  cardLabel: { color: theme.colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 8 },
  cardValue: { color: theme.colors.text.primary, fontSize: 22, fontWeight: '800', marginTop: 4 },
  section: { color: theme.colors.text.primary, fontSize: 15, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  metricRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border.primary,
  },
  metricLabel: { color: theme.colors.text.secondary, fontSize: 13 },
  metricValue: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700' },
  navRow: { flexDirection: 'row', gap: 8 },
  navBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12,
    backgroundColor: theme.colors.background.card,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  navText: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700' },
});
