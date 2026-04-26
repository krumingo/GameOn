import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { adminApi } from '@/api/client';
import { GlassCard } from '@/components/GlassCard';
import { LoadingButton } from '@/components/LoadingButton';
import { theme } from '@/theme/darkTheme';

const PLAN_FILTERS = ['ALL', 'PRO', 'FREE', 'TRIAL'];
const PLAN_COLORS: Record<string, string> = {
  PRO: theme.colors.accent.gold,
  TRIAL: theme.colors.accent.primary,
  GRACE: '#F59E0B',
  FREE: theme.colors.text.muted,
};

export default function AdminGroupsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState<string>('ALL');
  const [items, setItems] = useState<any[]>([]);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (reset = false) => {
    setBusy(true);
    try {
      const params: any = { skip: reset ? 0 : skip, limit: 20 };
      if (search.trim()) params.search = search.trim();
      if (plan !== 'ALL') params.plan = plan;
      const res = await adminApi.getGroups(params);
      const arr = Array.isArray(res) ? res : [];
      if (reset) {
        setItems(arr);
        setSkip(arr.length);
      } else {
        setItems((prev) => [...prev, ...arr]);
        setSkip(skip + arr.length);
      }
      setHasMore(arr.length >= 20);
    } catch (e: any) {
      if (e?.response?.status === 401) router.replace('/admin/login');
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }, [search, plan, skip, router]);

  useEffect(() => { load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [plan]);

  const onSearchSubmit = () => { setSkip(0); load(true); };

  const showDetail = async (id: string) => {
    try {
      const d = await adminApi.getGroupDetail(id);
      Alert.alert(d.name || 'Група',
        `Код: ${d.entry_code}\nПлан: ${d.plan}\nЧленове: ${d.members?.length ?? 0}\nМачове: ${d.matches_count}\nТранзакции: ${d.cash_transactions_count}`);
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-admin-groups">
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="admin-groups-back">
          <Ionicons name="chevron-back" size={22} color={theme.colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.brand}>Групи</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={theme.colors.text.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={onSearchSubmit}
          placeholder="Търси по име или код..."
          placeholderTextColor={theme.colors.text.muted}
          style={styles.searchInput}
          testID="ag-search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => { setSearch(''); setSkip(0); load(true); }}>
            <Ionicons name="close-circle" size={18} color={theme.colors.text.muted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
        {PLAN_FILTERS.map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => setPlan(p)}
            style={[styles.chip, plan === p && styles.chipActive]}
            testID={`ag-plan-${p}`}
          >
            <Text style={[styles.chipText, plan === p && styles.chipTextActive]}>
              {p === 'ALL' ? 'Всички' : p}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }} testID="ag-list">
        {loading && items.length === 0 ? (
          <ActivityIndicator color={theme.colors.accent.primary} style={{ marginTop: 24 }} />
        ) : items.length === 0 ? (
          <Text style={styles.muted}>Няма резултати</Text>
        ) : (
          items.map((g) => (
            <GlassCard key={g.id} onPress={() => showDetail(g.id)} testID={`ag-item-${g.id}`}>
              <View style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{g.name}</Text>
                  <Text style={styles.muted}>{g.entry_code} · {g.members_count} членове</Text>
                </View>
                <View style={[styles.planPill, { backgroundColor: `${PLAN_COLORS[g.plan] || theme.colors.text.muted}26`, borderColor: PLAN_COLORS[g.plan] || theme.colors.text.muted }]}>
                  <Text style={[styles.planText, { color: PLAN_COLORS[g.plan] || theme.colors.text.muted }]}>{g.plan}</Text>
                </View>
              </View>
            </GlassCard>
          ))
        )}
        {hasMore && items.length > 0 && (
          <LoadingButton
            title="Зареди още"
            variant="outline"
            onPress={() => load(false)}
            loading={busy}
            style={{ marginTop: 12 }}
            testID="ag-load-more"
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  brand: { color: theme.colors.text.primary, fontSize: 18, fontWeight: '800' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.background.card,
    alignItems: 'center', justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, paddingHorizontal: 14,
    backgroundColor: theme.colors.background.input, borderRadius: 12,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  searchInput: { flex: 1, color: theme.colors.text.primary, paddingVertical: 12, fontSize: 14 },
  filterBar: { gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: theme.colors.background.card,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  chipActive: { backgroundColor: 'rgba(59,130,246,0.18)', borderColor: theme.colors.accent.primary },
  chipText: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: theme.colors.accent.primary },
  muted: { color: theme.colors.text.muted, fontSize: 12, textAlign: 'center', marginTop: 24 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700' },
  planPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  planText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
});
