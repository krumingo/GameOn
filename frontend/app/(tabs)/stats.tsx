import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { groupsApi, statsApi, billingApi, seasonsApi } from '@/api/client';
import { GlassCard } from '@/components/GlassCard';
import { theme } from '@/theme/darkTheme';
import { useTranslation } from 'react-i18next';

const METRIC_OPTIONS = [
  { k: 'points', label: 'stats.metricPoints' },
  { k: 'goals', label: 'stats.metricGoals' },
  { k: 'matches', label: 'stats.metricMatches' },
];

const PRO_PLANS = ['PRO', 'TRIAL', 'GRACE'];

export default function StatsScreen() {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<any[]>([]);
  const [groupId, setGroupId] = useState<string>('');
  const [groupPlan, setGroupPlan] = useState<string>('FREE');
  const [stats, setStats] = useState<any>(null);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [seasonId, setSeasonId] = useState<string>('all');
  const [metric, setMetric] = useState<string>('points');
  const [leaderboard, setLeaderboard] = useState<any>(null);
  const [hallOfFame, setHallOfFame] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadGroups = useCallback(async () => {
    try {
      const gs = await groupsApi.getMyGroups();
      setGroups(gs || []);
      if ((gs || []).length > 0 && !groupId) {
        setGroupId(gs[0].id);
      }
    } catch {}
  }, [groupId]);

  const loadStats = useCallback(async () => {
    if (!groupId) { setLoading(false); return; }
    try {
      const [s, sList, bill] = await Promise.all([
        statsApi.getStats(groupId, seasonId),
        seasonsApi.getAll(groupId).catch(() => []),
        billingApi.getStatus(groupId).catch(() => ({ plan: 'FREE' })),
      ]);
      setStats(s);
      setSeasons(sList || []);
      setGroupPlan(bill?.plan || 'FREE');
      // Leaderboard requires PRO
      if (PRO_PLANS.includes(bill?.plan)) {
        try {
          const lb = await statsApi.getLeaderboard(groupId, metric, seasonId);
          setLeaderboard(lb);
        } catch {
          setLeaderboard(null);
        }
        try {
          const hof = await seasonsApi.getHallOfFame(groupId);
          setHallOfFame(Array.isArray(hof) ? hof : []);
        } catch {
          setHallOfFame([]);
        }
      } else {
        setLeaderboard(null);
        setHallOfFame([]);
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId, seasonId, metric]);

  useFocusEffect(useCallback(() => { loadGroups(); }, [loadGroups]));
  useEffect(() => { loadStats(); }, [loadStats]);

  if (loading) {
    return (
      <View style={styles.center} testID="screen-stats">
        <ActivityIndicator color={theme.colors.accent.primary} />
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <View style={styles.center} testID="screen-stats">
        <Ionicons name="bar-chart-outline" size={48} color={theme.colors.text.muted} />
        <Text style={styles.emptyText}>{t('stats.noGroup')}</Text>
      </View>
    );
  }

  const my = stats?.my_stats || {};
  const top = stats?.top_players || [];
  const recent = stats?.recent_matches || [];
  const isPro = PRO_PLANS.includes(groupPlan);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadStats(); }}
          tintColor="#fff"
        />
      }
      testID="screen-stats"
    >
      {/* Group selector */}
      {groups.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipBar} testID="stats-group-bar">
          {groups.map((g: any) => (
            <TouchableOpacity
              key={g.id}
              onPress={() => setGroupId(g.id)}
              style={[styles.chip, groupId === g.id && styles.chipActive]}
              testID={`stats-group-${g.id}`}
            >
              <Text style={[styles.chipText, groupId === g.id && styles.chipTextActive]}>{g.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Season selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipBar} testID="stats-season-bar">
        <TouchableOpacity
          onPress={() => setSeasonId('all')}
          style={[styles.chip, seasonId === 'all' && styles.chipActive]}
          testID="season-all"
        >
          <Text style={[styles.chipText, seasonId === 'all' && styles.chipTextActive]}>{t('stats.all')}</Text>
        </TouchableOpacity>
        {seasons.map((s: any) => (
          <TouchableOpacity
            key={s.id}
            onPress={() => setSeasonId(s.id)}
            style={[styles.chip, seasonId === s.id && styles.chipActive]}
            testID={`season-${s.id}`}
          >
            <Text style={[styles.chipText, seasonId === s.id && styles.chipTextActive]}>
              {s.name}{s.is_active ? ' ●' : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* My stats */}
      <Text style={styles.h2}>{t('stats.myStats')}</Text>
      <View style={styles.statsGrid}>
        <StatBox label={t('stats.matchesPlayed')} value={my.matches_played ?? 0} testID="stat-matches" />
        <StatBox label={t('stats.goals')} value={my.goals ?? 0} testID="stat-goals" />
        <StatBox label={t('stats.points')} value={my.points ?? 0} testID="stat-points" />
        <StatBox label={t('stats.coefficient')} value={(my.coefficient ?? 0).toFixed(2)} testID="stat-coef" />
        <StatBox label={t('stats.wins')} value={my.wins ?? 0} color={theme.colors.accent.success} testID="stat-wins" />
        <StatBox label={t('stats.draws')} value={my.draws ?? 0} color="#F59E0B" testID="stat-draws" />
        <StatBox label={t('stats.losses')} value={my.losses ?? 0} color={theme.colors.accent.danger} testID="stat-losses" />
        <StatBox label={t('stats.attendance')} value={`${my.attendance_rate ?? 0}%`} testID="stat-attendance" />
      </View>

      {/* Leaderboard (PRO) */}
      <Text style={styles.h2}>{t('stats.leaderboard')}</Text>
      {!isPro ? (
        <GlassCard style={{ alignItems: 'center', padding: 24 }} testID="lb-paywall">
          <Ionicons name="lock-closed" size={28} color={theme.colors.accent.gold} />
          <Text style={[styles.muted, { marginTop: 8, textAlign: 'center' }]}>
            Класацията е PRO функция
          </Text>
        </GlassCard>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipBar} testID="lb-metric-bar">
            {METRIC_OPTIONS.map((m) => (
              <TouchableOpacity
                key={m.k}
                onPress={() => setMetric(m.k)}
                style={[styles.chip, metric === m.k && styles.chipActive]}
                testID={`metric-${m.k}`}
              >
                <Text style={[styles.chipText, metric === m.k && styles.chipTextActive]}>{t(m.label)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <GlassCard testID="leaderboard-card">
            {(leaderboard?.entries || []).length === 0 ? (
              <Text style={[styles.muted, { padding: 16, textAlign: 'center' }]}>{t('common.noData')}</Text>
            ) : (
              (leaderboard?.entries || []).map((e: any, idx: number) => (
                <View key={e.user_id} style={styles.lbRow} testID={`lb-${e.user_id}`}>
                  <View style={[styles.rankBadge, idx === 0 && { backgroundColor: theme.colors.accent.gold },
                                                  idx === 1 && { backgroundColor: '#C0C0C0' },
                                                  idx === 2 && { backgroundColor: '#CD7F32' }]}>
                    <Text style={[styles.rankText, idx <= 2 && { color: '#000' }]}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.lbName}>{e.name}</Text>
                  <Text style={styles.lbValue}>{e.value}</Text>
                </View>
              ))
            )}
          </GlassCard>
          {leaderboard?.points_config && (
            <Text style={styles.pointsConfigText} testID="points-config">
              Точкуване: Победа={leaderboard.points_config.win}, Равен={leaderboard.points_config.draw}, Загуба={leaderboard.points_config.loss}
            </Text>
          )}

          {hallOfFame.length > 0 && (
            <>
              <Text style={styles.h2}>Хроники</Text>
              {hallOfFame.map((entry: any) => {
                const s = entry.season || entry;
                const champs = entry.champions || s.champions || [];
                return (
                  <GlassCard key={s.id} style={{ marginBottom: 8 }} testID={`hof-${s.id}`}>
                    <Text style={styles.hofTitle}>{s.name}</Text>
                    {(s.start_at || s.end_at) && (
                      <Text style={styles.muted}>
                        {(s.start_at || '').slice(0, 10)}{s.end_at ? ` — ${s.end_at.slice(0, 10)}` : ''}
                      </Text>
                    )}
                    <View style={{ marginTop: 10, gap: 6 }}>
                      {champs.slice(0, 3).map((c: any, idx: number) => {
                        const colors = [theme.colors.accent.gold, '#C0C0C0', '#CD7F32'];
                        const medals = ['🥇', '🥈', '🥉'];
                        return (
                          <View key={c.user_id || idx} style={styles.hofRow} testID={`hof-${s.id}-${idx}`}>
                            <Text style={[styles.hofMedal, { color: colors[idx] }]}>{medals[idx]}</Text>
                            <Text style={styles.hofName}>{c.name}</Text>
                            {c.points != null && <Text style={[styles.hofPts, { color: colors[idx] }]}>{c.points} т</Text>}
                            {c.coefficient != null && <Text style={styles.muted}>· {Number(c.coefficient).toFixed(2)}</Text>}
                          </View>
                        );
                      })}
                    </View>
                  </GlassCard>
                );
              })}
            </>
          )}
        </>
      )}

      {/* Top players (FREE+) */}
      {top.length > 0 && (
        <>
          <Text style={styles.h2}>{t('stats.topPlayers')}</Text>
          <GlassCard testID="top-players">
            {top.map((p: any, idx: number) => (
              <View key={p.user_id} style={styles.lbRow}>
                <View style={[styles.rankBadge, idx === 0 && { backgroundColor: theme.colors.accent.gold }]}>
                  <Text style={[styles.rankText, idx === 0 && { color: '#000' }]}>{idx + 1}</Text>
                </View>
                <Text style={styles.lbName}>{p.name}</Text>
                <Text style={styles.lbValue}>{p.goals} ⚽</Text>
              </View>
            ))}
          </GlassCard>
        </>
      )}

      {/* Recent matches */}
      {recent.length > 0 && (
        <>
          <Text style={styles.h2}>{t('stats.recent')}</Text>
          {recent.map((m: any) => (
            <GlassCard key={m.id} style={{ marginBottom: 8 }} testID={`recent-${m.id}`}>
              <Text style={styles.matchName}>{m.name}</Text>
              <View style={styles.scoreLine}>
                <Text style={[styles.scoreSide, { color: theme.colors.accent.blue_team }]}>СИНИ {m.blue_goals}</Text>
                <Text style={styles.scoreVs}>:</Text>
                <Text style={[styles.scoreSide, { color: theme.colors.accent.red_team }]}>{m.red_goals} ЧЕРВЕНИ</Text>
              </View>
            </GlassCard>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const StatBox: React.FC<{ label: string; value: any; color?: string; testID?: string }> = ({ label, value, color, testID }) => (
  <View style={styles.statBox} testID={testID}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, color && { color }]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background.primary, padding: 24 },
  emptyText: { color: theme.colors.text.muted, fontSize: 14, marginTop: 12 },
  chipBar: { gap: 6, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: theme.colors.background.card,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  chipActive: { backgroundColor: 'rgba(59,130,246,0.18)', borderColor: theme.colors.accent.primary },
  chipText: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: theme.colors.accent.primary },
  h2: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statBox: {
    width: '48%', padding: 14, borderRadius: 12,
    backgroundColor: theme.colors.background.card,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  statLabel: { color: theme.colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  statValue: { color: theme.colors.text.primary, fontSize: 22, fontWeight: '800', marginTop: 4 },
  muted: { color: theme.colors.text.muted, fontSize: 13 },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border.primary },
  rankBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.background.input, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: theme.colors.text.primary, fontSize: 12, fontWeight: '800' },
  lbName: { flex: 1, color: theme.colors.text.primary, fontSize: 14, fontWeight: '600' },
  lbValue: { color: theme.colors.accent.primary, fontSize: 14, fontWeight: '800' },
  matchName: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  scoreLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  scoreSide: { fontSize: 16, fontWeight: '800' },
  scoreVs: { color: theme.colors.text.muted, fontSize: 18 },
  pointsConfigText: { color: theme.colors.text.muted, fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginTop: 8 },
  hofTitle: { color: theme.colors.text.primary, fontSize: 15, fontWeight: '700' },
  hofRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hofMedal: { fontSize: 18 },
  hofName: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '600', flex: 1 },
  hofPts: { fontSize: 13, fontWeight: '800' },
});
