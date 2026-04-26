import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Linking, Platform, Alert,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { matchesApi, billingApi, groupsApi } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { LoadingButton } from '@/components/LoadingButton';
import { GlassCard } from '@/components/GlassCard';
import { PlayersTab } from '@/components/room/PlayersTab';
import { PaymentsTab } from '@/components/room/PaymentsTab';
import { ResultsTab } from '@/components/room/ResultsTab';
import { TeamsTab } from '@/components/room/TeamsTab';
import { ChatTab } from '@/components/room/ChatTab';
import { CreateMatchModal } from '@/components/room/CreateMatchModal';
import { theme } from '@/theme/darkTheme';

const TABS = [
  { k: 'players', label: 'Играчи' },
  { k: 'payments', label: 'Плащания' },
  { k: 'results', label: 'Резултати' },
  { k: 'teams', label: 'Отбори' },
  { k: 'chat', label: 'Чат' },
];

const DAY_NAMES = ['Неделя', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'];
const MONTH_NAMES = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}, ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  } catch { return iso; }
}

export default function MatchRoom() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const [groupId, setGroupId] = useState<string>('');
  const [match, setMatch] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [billing, setBilling] = useState<any>(null);
  const [groupRole, setGroupRole] = useState<string>('MEMBER');
  const [tab, setTab] = useState<string>(params.tab || 'players');
  const [busyRsvp, setBusyRsvp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const loadEverything = useCallback(async () => {
    const id = params.id;
    if (!id || id === 'new') {
      // Handle /room/new — show create modal in context of first owned group
      try {
        const groups = await groupsApi.getMyGroups();
        const firstAdmin = groups.find((g: any) => g.role === 'OWNER' || g.role === 'ORGANIZER');
        if (firstAdmin) {
          setGroupId(firstAdmin.id);
          setGroupRole(firstAdmin.role);
          setBilling({ plan: firstAdmin.plan });
          setCreateOpen(true);
        } else {
          Alert.alert('Грешка', 'Нужна е група');
          router.back();
        }
      } catch { router.back(); }
      return;
    }
    // Try as match id first
    try {
      const m = await matchesApi.getById(id);
      setMatch(m);
      const gid = m.group_id;
      setGroupId(gid);
      // load related
      const [matchesList, membersList, bill] = await Promise.all([
        matchesApi.getUpcoming(gid).catch(() => []),
        groupsApi.getById(gid).catch(() => null),
        billingApi.getStatus(gid).catch(() => null),
      ]);
      setMatches(matchesList || []);
      setMembers(membersList?.members_list || []);
      setGroupRole(membersList?.role || 'MEMBER');
      setBilling(bill);
    } catch {
      // Treat as group id
      try {
        const [matchesList, group, bill] = await Promise.all([
          matchesApi.getUpcoming(id),
          groupsApi.getById(id),
          billingApi.getStatus(id),
        ]);
        setMatches(matchesList || []);
        setGroupId(id);
        setGroupRole(group?.role || 'MEMBER');
        setMembers(group?.members_list || []);
        setBilling(bill);
        if ((matchesList || []).length > 0) {
          const first = await matchesApi.getById(matchesList[0].id);
          setMatch(first);
        }
      } catch {
        Alert.alert('Грешка', 'Мачът не е намерен');
        router.back();
      }
    }
  }, [params.id]);

  useFocusEffect(useCallback(() => { loadEverything(); }, [loadEverything]));

  const refresh = useCallback(async () => {
    if (match?.id) {
      try {
        const m = await matchesApi.getById(match.id);
        setMatch(m);
        const matchesList = await matchesApi.getUpcoming(m.group_id).catch(() => []);
        setMatches(matchesList || []);
      } catch {}
    }
    setRefreshing(false);
  }, [match?.id]);

  const handleSelectMatch = useCallback(async (mid: string) => {
    try {
      const m = await matchesApi.getById(mid);
      setMatch(m);
    } catch {}
  }, []);

  const handleRsvp = async (newStatus: string) => {
    if (!match) return;
    setBusyRsvp(true);
    try {
      await matchesApi.rsvp(match.id, newStatus);
      await refresh();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    } finally {
      setBusyRsvp(false);
    }
  };

  const isAdmin = groupRole === 'OWNER' || groupRole === 'ORGANIZER';
  const plan = billing?.plan || 'FREE';

  if (!match && !createOpen) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: theme.colors.text.muted, padding: 24, textAlign: 'center' }}>Зареждам...</Text>
      </SafeAreaView>
    );
  }

  const status = match?.user_rsvp_status;
  const isCancelled = match?.status === 'CANCELLED';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="room-back">
          <Ionicons name="chevron-back" size={22} color={theme.colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.brand}>Match Room</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Match selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selector} testID="match-selector">
        {matches.map((m) => {
          const sel = m.id === match?.id;
          return (
            <TouchableOpacity
              key={m.id}
              onPress={() => handleSelectMatch(m.id)}
              style={[styles.selectorPill, sel && { borderColor: theme.colors.accent.primary, backgroundColor: 'rgba(59,130,246,0.15)' }]}
              testID={`selector-${m.id}`}
            >
              <Text style={[styles.selectorText, sel && { color: theme.colors.accent.primary }]}>
                {fmtDate(m.start_datetime).split(',')[0]}
              </Text>
            </TouchableOpacity>
          );
        })}
        {isAdmin && (
          <TouchableOpacity
            onPress={() => setCreateOpen(true)}
            style={[styles.selectorPill, { backgroundColor: theme.colors.accent.primary, borderColor: theme.colors.accent.primary }]}
            testID="selector-new"
          >
            <Ionicons name="add" size={16} color="#fff" />
          </TouchableOpacity>
        )}
      </ScrollView>

      {match && (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); refresh(); }} tintColor="#fff" />}
        >
          <GlassCard>
            <Text style={styles.matchTitle} testID="match-title">{match.name}</Text>
            <Text style={styles.matchDate}>{fmtDate(match.start_datetime)}</Text>
            {match.venue && (
              <TouchableOpacity onPress={() => match.location_link && Linking.openURL(match.location_link)} testID="match-venue">
                <Text style={styles.matchVenue}>📍 {match.venue}{match.location_link ? ' →' : ''}</Text>
              </TouchableOpacity>
            )}
            <View style={styles.metaRow}>
              <View style={styles.capBadge}>
                <Text style={styles.capText}>{match.going_count}/{match.player_limit ?? 14}</Text>
              </View>
              {isCancelled ? (
                <View style={[styles.statusPill, { backgroundColor: 'rgba(239,68,68,0.18)' }]}>
                  <Text style={{ color: theme.colors.accent.danger, fontSize: 11, fontWeight: '800' }}>
                    Отменен{match.cancel_reason ? `: ${match.cancel_reason}` : ''}
                  </Text>
                </View>
              ) : (
                <Text style={{ color: theme.colors.text.secondary, fontSize: 13 }}>
                  {match.free_spots > 0 ? `${match.free_spots} свободни` : 'Пълен'}
                  {(match.waitlist_count ?? 0) > 0 ? ` · Чакащи: ${match.waitlist_count}` : ''}
                </Text>
              )}
            </View>
            <Text style={styles.priceLine}>
              {(match.price_per_player ?? 0) > 0
                ? `${(match.price_per_player ?? 0).toFixed(2)} €/играч`
                : 'Безплатно'}
              {' · '}{match.pricing_mode}
            </Text>

            {!isCancelled && (
              <View style={{ marginTop: 14 }}>
                {status === 'going' ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={styles.goingBox}>
                      <Text style={styles.goingText}>✓ Записан</Text>
                    </View>
                    <LoadingButton
                      title="Откажи"
                      variant="danger"
                      onPress={() => handleRsvp('not_going')}
                      loading={busyRsvp}
                      style={{ paddingVertical: 8, minHeight: 40 }}
                      testID="room-rsvp-cancel"
                    />
                  </View>
                ) : status === 'pending' ? (
                  <LoadingButton title="Чакаш одобрение" variant="outline" onPress={() => {}} disabled testID="room-rsvp-pending" />
                ) : status === 'waitlist' ? (
                  <LoadingButton
                    title={`На чакащите (#${match.waitlist_count ?? 0})`}
                    variant="outline"
                    onPress={() => handleRsvp('not_going')}
                    loading={busyRsvp}
                    testID="room-rsvp-waitlist"
                  />
                ) : (
                  <LoadingButton
                    title={match.free_spots === 0 ? 'На чакащите' : 'Запиши се'}
                    onPress={() => handleRsvp('going')}
                    loading={busyRsvp}
                    testID="room-rsvp-signup"
                  />
                )}
              </View>
            )}
          </GlassCard>

          {/* Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsBar} testID="room-tabs">
            {TABS.map((tt) => (
              <TouchableOpacity
                key={tt.k}
                onPress={() => setTab(tt.k)}
                style={[styles.tabBtn, tab === tt.k && styles.tabBtnActive]}
                testID={`tab-${tt.k}`}
              >
                <Text style={[styles.tabText, tab === tt.k && styles.tabTextActive]}>{tt.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={{ marginTop: 12, minHeight: 200 }}>
            {tab === 'players' && (
              <PlayersTab
                match={match}
                rsvps={match.rsvps || []}
                members={members}
                currentUserId={user?.id}
                isAdmin={isAdmin}
                onRefresh={refresh}
              />
            )}
            {tab === 'payments' && (
              <PaymentsTab match={match} groupPlan={plan} groupId={groupId} isAdmin={isAdmin} onRefresh={refresh} />
            )}
            {tab === 'results' && (
              <ResultsTab match={match} groupPlan={plan} groupId={groupId} isAdmin={isAdmin} currentUserId={user?.id} onRefresh={refresh} />
            )}
            {tab === 'teams' && (
              <TeamsTab match={match} groupPlan={plan} groupId={groupId} isAdmin={isAdmin} currentUserId={user?.id} onRefresh={refresh} />
            )}
            {tab === 'chat' && (
              <ChatTab groupId={groupId} matchId={match.id} currentUserId={user?.id} />
            )}
          </View>
        </ScrollView>
      )}

      <CreateMatchModal
        visible={createOpen}
        groupId={groupId}
        groupPlan={plan}
        onClose={() => setCreateOpen(false)}
        onCreated={refresh}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  brand: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.background.card,
    alignItems: 'center', justifyContent: 'center',
  },
  selector: { paddingHorizontal: 12, gap: 8, paddingBottom: 8 },
  selectorPill: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    backgroundColor: theme.colors.background.card,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  selectorText: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: '700' },
  matchTitle: { color: theme.colors.text.primary, fontSize: 20, fontWeight: '800' },
  matchDate: { color: theme.colors.text.secondary, fontSize: 13, marginTop: 4 },
  matchVenue: { color: theme.colors.accent.primary, fontSize: 13, marginTop: 4, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  capBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: theme.colors.background.input },
  capText: { color: theme.colors.text.primary, fontSize: 13, fontWeight: '700' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  priceLine: { color: theme.colors.text.muted, fontSize: 12, marginTop: 8 },
  goingBox: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: theme.colors.accent.success,
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  goingText: { color: theme.colors.accent.success, fontWeight: '700' },
  tabsBar: { gap: 6, paddingHorizontal: 4, paddingVertical: 12 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  tabBtnActive: { backgroundColor: theme.colors.background.card, borderWidth: 1, borderColor: theme.colors.accent.primary },
  tabText: { color: theme.colors.text.muted, fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: theme.colors.accent.primary },
});
