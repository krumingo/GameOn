import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { playersApi } from '@/api/client';
import { GlassCard } from '@/components/GlassCard';
import { LoadingButton } from '@/components/LoadingButton';
import { theme } from '@/theme/darkTheme';
import { useTranslation } from 'react-i18next';

export default function SearchPlayerScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ groupId?: string }>();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  const search = useCallback(async (text: string) => {
    const query = (text || '').trim();
    if (query.length < 1) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await playersApi.search(query, params.groupId);
      setResults(Array.isArray(r) ? r : []);
    } catch (e: any) {
      const msg = e?.response?.data?.detail?.message || e?.response?.data?.detail;
      if (typeof msg === 'string' && msg.includes('PRO')) {
        Alert.alert('PRO функция', msg);
      }
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [params.groupId]);

  // debounced search
  useEffect(() => {
    const id = setTimeout(() => search(q), 350);
    return () => clearTimeout(id);
  }, [q, search]);

  const invite = async (uid: string) => {
    if (!params.groupId) {
      Alert.alert('Грешка', 'Изберете група за поканата');
      return;
    }
    setInvitingId(uid);
    try {
      await playersApi.invite(params.groupId, uid);
      setInvitedIds(new Set([...invitedIds, uid]));
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    } finally {
      setInvitingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-search-player">
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="search-back">
          <Ionicons name="chevron-back" size={22} color={theme.colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('search.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={theme.colors.text.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t('search.placeholder')}
          placeholderTextColor={theme.colors.text.muted}
          style={styles.input}
          autoFocus
          testID="search-input"
        />
        {loading && <ActivityIndicator color={theme.colors.accent.primary} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }} testID="search-results">
        {q.trim().length === 0 ? (
          <Text style={styles.emptyText}>{t('search.empty')}</Text>
        ) : results.length === 0 && !loading ? (
          <Text style={styles.emptyText}>Няма резултати</Text>
        ) : (
          results.map((u) => {
            const score = u.reliability_score ?? 100;
            const scoreColor = score >= 90 ? theme.colors.accent.success : score >= 70 ? '#F59E0B' : theme.colors.accent.danger;
            const isInvited = invitedIds.has(u.id);
            return (
              <GlassCard key={u.id} testID={`player-${u.id}`}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{u.name}</Text>
                    <Text style={styles.muted}>
                      {u.phone_masked} · {t('search.groupsCount', { n: u.groups_count ?? 0 })}
                    </Text>
                    <View style={styles.scoreRow}>
                      <View style={[styles.scoreDot, { backgroundColor: scoreColor }]} />
                      <Text style={[styles.muted, { color: scoreColor }]}>{score}/100</Text>
                    </View>
                  </View>
                  {params.groupId && (
                    <LoadingButton
                      title={isInvited ? '✓ Поканен' : t('search.invite')}
                      variant={isInvited ? 'outline' : 'primary'}
                      disabled={isInvited}
                      onPress={() => invite(u.id)}
                      loading={invitingId === u.id}
                      style={{ paddingHorizontal: 14 }}
                      testID={`invite-${u.id}`}
                    />
                  )}
                </View>
              </GlassCard>
            );
          })
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
  headerTitle: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.background.card,
    alignItems: 'center', justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, paddingHorizontal: 14,
    backgroundColor: theme.colors.background.input,
    borderRadius: 12,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  input: {
    flex: 1, color: theme.colors.text.primary,
    paddingVertical: 12, fontSize: 15,
  },
  emptyText: { color: theme.colors.text.muted, textAlign: 'center', marginTop: 32, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: theme.colors.text.primary, fontSize: 15, fontWeight: '700' },
  muted: { color: theme.colors.text.muted, fontSize: 12, marginTop: 2 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  scoreDot: { width: 8, height: 8, borderRadius: 4 },
});
