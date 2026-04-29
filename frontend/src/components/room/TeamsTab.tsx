import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { matchesApi } from '@/api/client';
import { GlassCard } from '@/components/GlassCard';
import { LoadingButton } from '@/components/LoadingButton';
import { PaywallOverlay } from '@/components/PaywallOverlay';
import { Avatar } from '@/components/Avatar';
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

export const TeamsTab: React.FC<Props> = ({
  match, groupPlan, groupId, isAdmin, currentUserId, onRefresh,
}) => {
  const [data, setData] = useState<any>(null);
  const [blueCap, setBlueCap] = useState<string>('');
  const [redCap, setRedCap] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    try {
      const d = await matchesApi.getTeams(match.id);
      setData(d);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [match.id]);

  if (!PRO_PLANS.includes(groupPlan)) {
    return <PaywallOverlay feature="Отбори" groupId={groupId} plan={groupPlan} />;
  }
  if (loading || !data) return <View style={{ padding: 24 }}><Text style={{ color: theme.colors.text.muted }}>Зареждам...</Text></View>;

  const td = data.teams_data || {};
  const hasCaptains = !!td.blue_captain_id && !!td.red_captain_id;
  const locked = !!td.locked;

  const goingPlayers = data.going_players || [];

  if (!hasCaptains) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} testID="teams-tab">
        <GlassCard>
          <Text style={styles.title}>Изберете капитани</Text>
          <Text style={styles.label}>Капитан Сини</Text>
          <CaptainPicker
            value={blueCap}
            onChange={setBlueCap}
            options={goingPlayers.filter((p: any) => p.user_id !== redCap)}
            colorAccent={theme.colors.accent.blue_team}
            testID="captain-blue"
          />
          <Text style={[styles.label, { marginTop: 16 }]}>Капитан Червени</Text>
          <CaptainPicker
            value={redCap}
            onChange={setRedCap}
            options={goingPlayers.filter((p: any) => p.user_id !== blueCap)}
            colorAccent={theme.colors.accent.red_team}
            testID="captain-red"
          />
          <LoadingButton
            title="Започни драфт"
            onPress={async () => {
              if (!blueCap || !redCap) { Alert.alert('Грешка', 'Изберете двамата капитани'); return; }
              try {
                await matchesApi.setCaptains(match.id, blueCap, redCap);
                await fetch(); onRefresh();
              } catch (e: any) {
                Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
              }
            }}
            disabled={!isAdmin}
            style={{ marginTop: 16 }}
            testID="set-captains-submit"
          />
        </GlassCard>
      </ScrollView>
    );
  }

  const turn = td.turn || 'BLUE';
  const turnColor = turn === 'BLUE' ? theme.colors.accent.blue_team : theme.colors.accent.red_team;
  const blueIds = new Set((data.blue_players || []).map((p: any) => p.user_id || p.guest_id));
  const redIds = new Set((data.red_players || []).map((p: any) => p.user_id || p.guest_id));

  const handlePick = async (uid: string) => {
    try { await matchesApi.pickPlayer(match.id, uid); await fetch(); onRefresh(); }
    catch (e: any) { Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно'); }
  };
  const handleReturn = async (uid: string) => {
    try { await matchesApi.returnPlayer(match.id, uid); await fetch(); onRefresh(); }
    catch (e: any) { Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно'); }
  };
  const handleTransfer = async (uid: string, toTeam: 'BLUE' | 'RED') => {
    const fromTeam = toTeam === 'BLUE' ? 'RED' : 'BLUE';
    try { await matchesApi.transferPlayer(match.id, uid, fromTeam, toTeam); await fetch(); onRefresh(); }
    catch (e: any) { Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно'); }
  };
  const handleUndo = async () => {
    try { await matchesApi.undoPick(match.id); await fetch(); onRefresh(); }
    catch (e: any) { Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно'); }
  };
  const handleLock = async () => {
    try { await matchesApi.lockTeams(match.id, !locked); await fetch(); onRefresh(); }
    catch (e: any) { Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно'); }
  };
  const handleReset = async () => {
    const doIt = async () => {
      try { await matchesApi.resetTeams(match.id); await fetch(); onRefresh(); }
      catch (e: any) { Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно'); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Ще изтрие отборите и головете. Сигурен ли си?')) doIt();
    } else {
      Alert.alert('Нулирай', 'Ще изтрие отборите и головете.', [
        { text: 'Не' }, { text: 'Да', style: 'destructive', onPress: doIt },
      ]);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} testID="teams-tab">
      {/* Score counter */}
      <View style={styles.scoreCounter} testID="teams-score-counter">
        <View style={[styles.teamScoreBox, { borderColor: theme.colors.accent.blue_team }]}>
          <View style={[styles.teamDot, { backgroundColor: theme.colors.accent.blue_team }]} />
          <Text style={[styles.teamScoreNum, { color: theme.colors.accent.blue_team }]}>
            {(data.blue_players || []).length}
          </Text>
        </View>
        <Text style={styles.scoreVs}>vs</Text>
        <View style={[styles.teamScoreBox, { borderColor: theme.colors.accent.red_team }]}>
          <Text style={[styles.teamScoreNum, { color: theme.colors.accent.red_team }]}>
            {(data.red_players || []).length}
          </Text>
          <View style={[styles.teamDot, { backgroundColor: theme.colors.accent.red_team }]} />
        </View>
      </View>

      {!locked ? (
        <PulsingTurnBanner color={turnColor} turn={turn as 'BLUE' | 'RED'} />
      ) : (
        <View style={[styles.lockedOverlay]} testID="teams-locked">
          <Ionicons name="lock-closed" size={20} color={theme.colors.accent.success} />
          <Text style={styles.lockedText}>ОТБОРИТЕ СА ЗАКЛЮЧЕНИ</Text>
        </View>
      )}

      <TeamPanel
        label="Сини" color={theme.colors.accent.blue_team}
        players={data.blue_players || []} captainId={td.blue_captain_id}
        canEdit={isAdmin && !locked}
        onReturn={handleReturn}
        onTransfer={handleTransfer}
        otherTeam="RED"
      />
      <TeamPanel
        label="Червени" color={theme.colors.accent.red_team}
        players={data.red_players || []} captainId={td.red_captain_id}
        canEdit={isAdmin && !locked}
        onReturn={handleReturn}
        onTransfer={handleTransfer}
        otherTeam="BLUE"
      />

      {!locked && (
        <GlassCard style={{ marginBottom: 12 }}>
          <Text style={styles.title}>Налични играчи ({(data.available_players || []).length})</Text>
          {(data.available_players || []).map((p: any) => (
            <View key={p.user_id || p.guest_id} style={styles.row} testID={`avail-${p.user_id || p.guest_id}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Avatar name={p.name} size={28} />
                <Text style={styles.name} numberOfLines={1}>{p.name}{p.is_guest && <Text style={styles.guestBadge}>  ГОСТ</Text>}</Text>
              </View>
              {(isAdmin || (currentUserId && (td.blue_captain_id === currentUserId || td.red_captain_id === currentUserId))) && (
                <TouchableOpacity
                  onPress={() => handlePick(p.user_id || p.guest_id)}
                  style={[styles.pickBtn, { backgroundColor: turnColor }]}
                  testID={`pick-${p.user_id || p.guest_id}`}
                >
                  <Text style={styles.pickText}>Избери</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          {(data.available_players || []).length === 0 && (
            <Text style={{ color: theme.colors.text.muted, textAlign: 'center', paddingVertical: 12 }}>
              Всички играчи са разпределени
            </Text>
          )}
        </GlassCard>
      )}

      {isAdmin && (
        <View style={{ gap: 8 }}>
          {!locked && (
            <LoadingButton title="Undo последен избор" variant="outline" onPress={handleUndo} testID="teams-undo" />
          )}
          <LoadingButton
            title={locked ? 'Отключи отборите' : 'Заключи отборите'}
            variant="outline"
            onPress={handleLock}
            testID="teams-lock"
          />
          <LoadingButton title="Нулирай" variant="danger" onPress={handleReset} testID="teams-reset" />
        </View>
      )}
    </ScrollView>
  );
};

const CaptainPicker: React.FC<any> = ({ value, onChange, options, colorAccent, testID }) => (
  <View style={{ borderWidth: 1, borderColor: theme.colors.border.primary, borderRadius: 10, overflow: 'hidden' }}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 8, gap: 6 }}>
      {options.map((p: any) => {
        const sel = p.user_id === value;
        return (
          <TouchableOpacity
            key={p.user_id || p.id}
            onPress={() => onChange(p.user_id || p.id)}
            style={[styles.capChip, sel && { backgroundColor: colorAccent }]}
            testID={`${testID}-${p.user_id || p.id}`}
          >
            <Text style={[styles.capChipText, sel && { color: '#fff' }]}>{p.name}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  </View>
);

const PulsingTurnBanner: React.FC<{ color: string; turn: 'BLUE' | 'RED' }> = ({ color, turn }) => {
  const opacity = useSharedValue(0.85);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[styles.turnBanner, animStyle, { backgroundColor: `${color}33`, borderColor: color, shadowColor: color, shadowOpacity: 0.5, shadowRadius: 12 }]}
      testID="teams-turn"
    >
      <View style={[styles.turnDot, { backgroundColor: color }]} />
      <Text style={[styles.turnText, { color }]}>
        РЕД НА {turn === 'BLUE' ? 'СИНИТЕ' : 'ЧЕРВЕНИТЕ'}
      </Text>
    </Animated.View>
  );
};

const TeamPanel: React.FC<any> = ({ label, color, players, captainId, canEdit, onReturn, onTransfer, otherTeam }) => (
  <GlassCard style={[styles.teamCard, { borderColor: color, borderWidth: 1.5 }]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <Text style={[styles.teamHeader, { color }]}>{label}</Text>
      <View style={[styles.teamCountPill, { backgroundColor: `${color}22`, borderColor: `${color}66` }]}>
        <Text style={[styles.teamCountText, { color }]}>{players.length}</Text>
      </View>
    </View>
    {players.map((p: any) => {
      const isCap = p.user_id && p.user_id === captainId;
      return (
        <View key={p.user_id || p.guest_id} style={styles.row}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flex: 1 }}>
            <Avatar name={p.name} size={isCap ? 32 : 28} color={isCap ? color : undefined} />
            <Text style={[styles.name, { color }, isCap && { fontSize: 15, fontWeight: '800' }]} numberOfLines={1}>
              {p.name}
            </Text>
            {isCap && (
              <Text style={styles.crown} testID="captain-badge">👑</Text>
            )}
          </View>
          {canEdit && !isCap && (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                onPress={() => onTransfer(p.user_id || p.guest_id, otherTeam)}
                style={styles.transferBtn}
                testID={`transfer-${p.user_id || p.guest_id}`}
              >
                <Ionicons name="swap-horizontal" size={14} color={theme.colors.accent.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onReturn(p.user_id || p.guest_id)}
                style={styles.removeBtn}
                testID={`return-${p.user_id || p.guest_id}`}
              >
                <Ionicons name="close" size={14} color={theme.colors.accent.danger} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    })}
  </GlassCard>
);

const styles = StyleSheet.create({
  scoreCounter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16,
    paddingVertical: 12, marginBottom: 12,
  },
  teamScoreBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 14, borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  teamScoreNum: { fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  teamDot: { width: 12, height: 12, borderRadius: 6 },
  scoreVs: { color: theme.colors.text.muted, fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },

  lockedOverlay: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: 14,
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.5)',
    marginBottom: 12,
  },
  lockedText: { color: theme.colors.accent.success, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },

  turnBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12,
  },
  turnDot: { width: 10, height: 10, borderRadius: 5 },
  turnText: { fontSize: 14, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  label: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  capChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: theme.colors.background.input,
  },
  capChipText: { color: theme.colors.text.primary, fontSize: 13, fontWeight: '600' },
  teamCard: { marginBottom: 12 },
  teamHeader: { fontSize: 14, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  teamCountPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  teamCountText: { fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  name: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '600' },
  guestBadge: { color: theme.colors.accent.secondary, fontSize: 11, fontWeight: '700' },
  crown: { fontSize: 18, marginLeft: 2 },
  cBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.accent.gold, alignItems: 'center', justifyContent: 'center', shadowColor: theme.colors.accent.gold, shadowOpacity: 0.6, shadowRadius: 6 },
  cBadgeText: { color: '#000', fontWeight: '900', fontSize: 11 },
  pickBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  pickText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  removeBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.15)', alignItems: 'center', justifyContent: 'center' },
  transferBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(59,130,246,0.15)', alignItems: 'center', justifyContent: 'center' },
});
