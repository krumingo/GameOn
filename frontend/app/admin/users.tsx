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

function maskPhone(p?: string): string {
  if (!p) return '';
  if (p.length < 6) return p;
  return p.slice(0, 4) + '***' + p.slice(-4);
}

export default function AdminUsersScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
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
      const res = await adminApi.getUsers(params);
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
  }, [search, skip, router]);

  useEffect(() => { load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const onSearchSubmit = () => { setSkip(0); load(true); };

  const showDetail = async (id: string) => {
    try {
      const u = await adminApi.getUserDetail(id);
      Alert.alert(u.name || 'Потребител',
        `Телефон: ${maskPhone(u.phone)}\nНадеждност: ${u.reliability_score}/100\nГрупи: ${u.groups?.length ?? 0}`);
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-admin-users">
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="admin-users-back">
          <Ionicons name="chevron-back" size={22} color={theme.colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.brand}>Потребители</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={theme.colors.text.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={onSearchSubmit}
          placeholder="Търси по име или телефон..."
          placeholderTextColor={theme.colors.text.muted}
          style={styles.searchInput}
          testID="au-search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => { setSearch(''); setSkip(0); load(true); }}>
            <Ionicons name="close-circle" size={18} color={theme.colors.text.muted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }} testID="au-list">
        {loading && items.length === 0 ? (
          <ActivityIndicator color={theme.colors.accent.primary} style={{ marginTop: 24 }} />
        ) : items.length === 0 ? (
          <Text style={styles.muted}>Няма резултати</Text>
        ) : (
          items.map((u) => {
            const score = u.reliability_score ?? 100;
            const scoreColor = score >= 90 ? theme.colors.accent.success : score >= 70 ? '#F59E0B' : theme.colors.accent.danger;
            return (
              <GlassCard key={u.id} onPress={() => showDetail(u.id)} testID={`au-item-${u.id}`}>
                <View style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{u.name}</Text>
                    <Text style={styles.muted}>{maskPhone(u.phone)} · {u.groups_count ?? 0} групи</Text>
                  </View>
                  <View style={[styles.scoreBadge, { backgroundColor: `${scoreColor}26`, borderColor: scoreColor }]}>
                    <Text style={[styles.scoreText, { color: scoreColor }]}>{score}</Text>
                  </View>
                </View>
              </GlassCard>
            );
          })
        )}
        {hasMore && items.length > 0 && (
          <LoadingButton
            title="Зареди още"
            variant="outline"
            onPress={() => load(false)}
            loading={busy}
            style={{ marginTop: 12 }}
            testID="au-load-more"
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
  muted: { color: theme.colors.text.muted, fontSize: 12, textAlign: 'center', marginTop: 24 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700' },
  scoreBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
    minWidth: 36, alignItems: 'center',
  },
  scoreText: { fontSize: 11, fontWeight: '800' },
});
