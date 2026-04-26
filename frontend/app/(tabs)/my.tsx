import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Alert, TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { groupsApi, matchesApi } from '@/api/client';
import { withRetry } from '@/utils/retry';
import { useAuthStore } from '@/store/authStore';
import { GroupCard } from '@/components/GroupCard';
import { WeeklyStats } from '@/components/WeeklyStats';
import { SeasonBadge } from '@/components/SeasonBadge';
import { GroupActionModal } from '@/components/GroupActionModal';
import { LoadingButton } from '@/components/LoadingButton';
import { theme } from '@/theme/darkTheme';

interface Group {
  id: string;
  name: string;
  plan: string;
  trial_days_left?: number;
  role: string;
  members_count: number;
  matches_count: number;
  matches_list?: any[];
  currency?: string;
  active_season_name?: string;
}

function startOfWeek(date: Date, offset: number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // 0 = Mon
  d.setDate(d.getDate() - day + offset * 7);
  return d;
}

function calcWeek(groups: Group[], offset: number, currentUserId?: string) {
  const monday = startOfWeek(new Date(), offset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const dailyMatches = [0, 0, 0, 0, 0, 0, 0];
  const dailyJoined = [0, 0, 0, 0, 0, 0, 0];
  let totalMatches = 0;
  let joined = 0;
  groups.forEach((g) => {
    (g.matches_list || []).forEach((m: any) => {
      const dt = new Date(m.start_datetime);
      if (dt >= monday && dt <= sunday) {
        const dow = (dt.getDay() + 6) % 7;
        dailyMatches[dow] += 1;
        totalMatches += 1;
        if (m.user_rsvp_status === 'going') {
          dailyJoined[dow] += 1;
          joined += 1;
        }
      }
    });
  });
  return { totalMatches, joined, dailyMatches, dailyJoined };
}

export default function MyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ action?: string }>();
  const { user } = useAuthStore();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [groupAction, setGroupAction] = useState<{ visible: boolean; mode: 'create' | 'join' }>(
    { visible: false, mode: 'create' }
  );

  const fetchGroups = useCallback(async () => {
    try {
      const data = await groupsApi.getMyGroups();
      setGroups(Array.isArray(data) ? data : []);
    } catch (e: any) {
      // 401 handled by interceptor
      setGroups([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchGroups(); }, [fetchGroups]));

  // Detect deep-linked actions from FAB
  useEffect(() => {
    if (params.action === 'newGroup') {
      setGroupAction({ visible: true, mode: 'create' });
      router.setParams({ action: undefined } as any);
    } else if (params.action === 'joinGroup') {
      setGroupAction({ visible: true, mode: 'join' });
      router.setParams({ action: undefined } as any);
    }
  }, [params.action]);

  const stats = useMemo(() => calcWeek(groups, weekOffset, user?.id), [groups, weekOffset, user?.id]);
  const todayIndex = (new Date().getDay() + 6) % 7;

  const activeSeason = groups.find((g: any) => g.active_season_name)?.active_season_name;

  const handleRsvpToggle = useCallback(
    async (matchId: string, newStatus: string) => {
      try {
        await withRetry(() => matchesApi.rsvp(matchId, newStatus));
        await fetchGroups();
      } catch (e: any) {
        const detail = e?.response?.data?.detail;
        if (typeof detail === 'string') {
          Alert.alert('Грешка', detail);
        } else if (detail?.code === 'PLAN_PRO_REQUIRED') {
          Alert.alert('PRO нужен', 'Тази функция изисква PRO план');
        } else {
          Alert.alert('Грешка', 'Неуспешно записване');
        }
        throw e;
      }
    },
    [fetchGroups]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGroups();
  }, [fetchGroups]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      testID="screen-my"
    >
      <WeeklyStats
        weekOffset={weekOffset}
        onShift={(d) => setWeekOffset((w) => w + d)}
        totalThisWeek={stats.totalMatches}
        joinedThisWeek={stats.joined}
        dailyMatches={stats.dailyMatches}
        dailyJoined={stats.dailyJoined}
        todayIndex={todayIndex}
      />

      {activeSeason && (
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/stats')}
          style={{ marginBottom: 16 }}
          testID="active-season-badge"
        >
          <SeasonBadge seasonName={activeSeason} />
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Зареждам...</Text>
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.empty} testID="my-empty-state">
          <View style={styles.emptyIconWrap}>
            <Ionicons name="football-outline" size={48} color={theme.colors.text.muted} />
          </View>
          <Text style={styles.emptyTitle}>Все още нямаш група</Text>
          <Text style={styles.emptySub}>Създай нова или се присъедини с код</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
            <LoadingButton
              title="Създай група"
              onPress={() => setGroupAction({ visible: true, mode: 'create' })}
              testID="empty-create-group"
              style={{ flex: 1 }}
            />
            <LoadingButton
              title="Присъедини се"
              onPress={() => setGroupAction({ visible: true, mode: 'join' })}
              variant="outline"
              testID="empty-join-group"
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : (
        groups.map((g, idx) => (
          <GroupCard
            key={g.id}
            group={g}
            currentUserId={user?.id}
            onRsvpToggle={handleRsvpToggle}
            defaultExpanded={idx === 0}
          />
        ))
      )}

      <View style={{ height: 80 }} />

      <GroupActionModal
        visible={groupAction.visible}
        mode={groupAction.mode}
        onClose={() => setGroupAction({ ...groupAction, visible: false })}
        onCreated={fetchGroups}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  content: { padding: 16, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: theme.colors.background.card,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  emptyTitle: {
    color: theme.colors.text.primary, fontSize: 18,
    fontWeight: '700', marginBottom: 6,
  },
  emptySub: { color: theme.colors.text.muted, fontSize: 14, textAlign: 'center' },
});
