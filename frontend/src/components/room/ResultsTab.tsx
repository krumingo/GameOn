import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { matchesApi } from '@/api/client';
import { withRetry } from '@/utils/retry';
import { GlassCard } from '@/components/GlassCard';
import { PaywallOverlay } from '@/components/PaywallOverlay';
import { theme } from '@/theme/darkTheme';

const PRO_PLANS = ['PRO', 'TRIAL', 'GRACE'];

interface Props {
  match: any;
  groupPlan: string;
  groupId: string;
  isAdmin: boolean;
  currentUserId?: string;
  onRefresh: () => Promise<void> | void;
}

export const ResultsTab: React.FC<Props> = ({
  match, groupPlan, groupId, isAdmin, currentUserId, onRefresh,
}) => {
  const [blue, setBlue] = useState<number>(match.score_data?.blue_goals || 0);
  const [red, setRed] = useState<number>(match.score_data?.red_goals || 0);
  const [savedAt, setSavedAt] = useState<number>(0);
  const [results, setResults] = useState<any>(null);
  const scoreTimer = useRef<any>(null);

  useEffect(() => {
    setBlue(match.score_data?.blue_goals || 0);
    setRed(match.score_data?.red_goals || 0);
  }, [match.id]);

  useEffect(() => {
    let active = true;
    matchesApi.getResults(match.id).then((d) => { if (active) setResults(d); }).catch(() => {});
    return () => { active = false; };
  }, [match.id, savedAt]);

  if (!PRO_PLANS.includes(groupPlan)) {
    return <PaywallOverlay feature="Резултати" groupId={groupId} plan={groupPlan} />;
  }

  const debouncedSetScore = (b: number, r: number) => {
    if (scoreTimer.current) clearTimeout(scoreTimer.current);
    scoreTimer.current = setTimeout(async () => {
      try {
        await withRetry(() => matchesApi.setScore(match.id, b, r));
        setSavedAt(Date.now());
        onRefresh();
      } catch (e: any) {
        Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
        // revert
        setBlue(match.score_data?.blue_goals || 0);
        setRed(match.score_data?.red_goals || 0);
      }
    }, 1500);
  };

  const updScore = (color: 'B' | 'R', delta: number) => {
    if (!isAdmin) return;
    if (color === 'B') {
      const next = Math.max(0, blue + delta);
      setBlue(next); debouncedSetScore(next, red);
    } else {
      const next = Math.max(0, red + delta);
      setRed(next); debouncedSetScore(blue, next);
    }
  };

  const players = results?.players || [];
  const bluePlayers = players.filter((p: any) => p.team === 'BLUE');
  const redPlayers = players.filter((p: any) => p.team === 'RED');
  const noTeams = bluePlayers.length === 0 && redPlayers.length === 0;
  const maxGoals = Math.max(0, ...players.map((p: any) => p.goals || 0));

  const setGoalsFor = async (uid: string, newGoals: number) => {
    try {
      await matchesApi.setGoals(match.id, uid, newGoals);
      setSavedAt(Date.now());
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} testID="results-tab">
      <GlassCard style={{ alignItems: 'center', marginBottom: 12 }}>
        <View style={styles.scoreRow}>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={[styles.teamLabel, { color: theme.colors.accent.blue_team }]}>СИНИ</Text>
            <View style={styles.scoreCtrl}>
              {isAdmin && <TouchableOpacity onPress={() => updScore('B', -1)} style={styles.scoreBtn} testID="score-blue-minus"><Text style={styles.scoreBtnText}>−</Text></TouchableOpacity>}
              <Text style={[styles.scoreNum, { color: theme.colors.accent.blue_team }]} testID="score-blue">{blue}</Text>
              {isAdmin && <TouchableOpacity onPress={() => updScore('B', 1)} style={styles.scoreBtn} testID="score-blue-plus"><Text style={styles.scoreBtnText}>+</Text></TouchableOpacity>}
            </View>
          </View>
          <Text style={styles.colon}>:</Text>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={[styles.teamLabel, { color: theme.colors.accent.red_team }]}>ЧЕРВЕНИ</Text>
            <View style={styles.scoreCtrl}>
              {isAdmin && <TouchableOpacity onPress={() => updScore('R', -1)} style={styles.scoreBtn} testID="score-red-minus"><Text style={styles.scoreBtnText}>−</Text></TouchableOpacity>}
              <Text style={[styles.scoreNum, { color: theme.colors.accent.red_team }]} testID="score-red">{red}</Text>
              {isAdmin && <TouchableOpacity onPress={() => updScore('R', 1)} style={styles.scoreBtn} testID="score-red-plus"><Text style={styles.scoreBtnText}>+</Text></TouchableOpacity>}
            </View>
          </View>
        </View>
        {savedAt > 0 && Date.now() - savedAt < 2500 && (
          <Text style={{ color: theme.colors.accent.success, fontSize: 12, marginTop: 6 }}>Запазено ✓</Text>
        )}
      </GlassCard>

      {noTeams ? (
        <GlassCard>
          <Text style={{ color: theme.colors.text.secondary, textAlign: 'center', padding: 16 }}>
            Първо разделете отбори от таб "Отбори"
          </Text>
        </GlassCard>
      ) : (
        <>
          <PlayerGoals
            label="Сини" color={theme.colors.accent.blue_team}
            players={bluePlayers} maxGoals={maxGoals}
            isAdmin={isAdmin} currentUserId={currentUserId}
            onChange={setGoalsFor}
          />
          <PlayerGoals
            label="Червени" color={theme.colors.accent.red_team}
            players={redPlayers} maxGoals={maxGoals}
            isAdmin={isAdmin} currentUserId={currentUserId}
            onChange={setGoalsFor}
          />
        </>
      )}
    </ScrollView>
  );
};

const PlayerGoals: React.FC<any> = ({ label, color, players, maxGoals, isAdmin, currentUserId, onChange }) => (
  <GlassCard style={[{ marginBottom: 12, borderColor: color, borderWidth: 1 }]}>
    <Text style={[styles.teamSection, { color }]}>{label} ({players.length})</Text>
    {players.map((p: any, idx: number) => {
      const canEdit = isAdmin || p.user_id === currentUserId;
      const isMVP = maxGoals > 0 && p.goals === maxGoals;
      return (
        <View key={`${p.user_id || p.guest_id}-${idx}`} style={styles.goalRow} testID={`goal-${p.user_id || p.guest_id}`}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.goalName, { color }]}>{p.name}</Text>
            {isMVP && (
              <View style={styles.mvpBadge}>
                <Text style={styles.mvpText}>MVP</Text>
              </View>
            )}
          </View>
          <View style={styles.goalCtrl}>
            <TouchableOpacity
              disabled={!canEdit}
              onPress={() => onChange(p.user_id || p.guest_id, Math.max(0, (p.goals || 0) - 1))}
              style={[styles.goalBtn, !canEdit && { opacity: 0.3 }]}
              testID={`goal-minus-${p.user_id || p.guest_id}`}
            >
              <Ionicons name="remove" size={14} color={theme.colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.goalNum}>{p.goals || 0}</Text>
            <TouchableOpacity
              disabled={!canEdit}
              onPress={() => onChange(p.user_id || p.guest_id, (p.goals || 0) + 1)}
              style={[styles.goalBtn, !canEdit && { opacity: 0.3 }]}
              testID={`goal-plus-${p.user_id || p.guest_id}`}
            >
              <Ionicons name="add" size={14} color={theme.colors.text.primary} />
            </TouchableOpacity>
          </View>
        </View>
      );
    })}
  </GlassCard>
);

const styles = StyleSheet.create({
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 8 },
  teamLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  scoreCtrl: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  scoreBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.background.input, alignItems: 'center', justifyContent: 'center' },
  scoreBtnText: { color: theme.colors.text.primary, fontSize: 20, fontWeight: '700' },
  scoreNum: { fontSize: 36, fontWeight: '900', minWidth: 40, textAlign: 'center' },
  colon: { color: theme.colors.text.muted, fontSize: 32, fontWeight: '300' },
  teamSection: { fontSize: 13, fontWeight: '800', marginBottom: 8, letterSpacing: 1 },
  goalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  goalName: { fontSize: 14, fontWeight: '600' },
  goalCtrl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goalBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.background.input, alignItems: 'center', justifyContent: 'center' },
  goalNum: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  mvpBadge: { backgroundColor: 'rgba(255,215,0,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  mvpText: { color: theme.colors.accent.gold, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
});
