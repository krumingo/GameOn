import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { matchesApi } from '@/api/client';
import { GlassCard } from '@/components/GlassCard';
import { LoadingButton } from '@/components/LoadingButton';
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
      {!locked ? (
        <View style={[styles.turnBanner, { backgroundColor: `${turnColor}26`, borderColor: turnColor }]} testID="teams-turn">
          <Text style={[styles.turnText, { color: turnColor }]}>
            Ред на избор: {turn === 'BLUE' ? '🔵 СИНИТЕ' : '🔴 ЧЕРВЕНИТЕ'}
          </Text>
        </View>
      ) : (
        <View style={[styles.turnBanner, { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: theme.colors.accent.success }]}>
          <Text style={[styles.turnText, { color: theme.colors.accent.success }]}>Отборите са заключени ✓</Text>
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
              <Text style={styles.name}>{p.name}{p.is_guest && <Text style={styles.guestBadge}>  ГОСТ</Text>}</Text>
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

const TeamPanel: React.FC<any> = ({ label, color, players, captainId, canEdit, onReturn, onTransfer, otherTeam }) => (
  <GlassCard style={[styles.teamCard, { borderColor: color, borderWidth: 1 }]}>
    <Text style={[styles.teamHeader, { color }]}>{label} ({players.length})</Text>
    {players.map((p: any) => {
      const isCap = p.user_id && p.user_id === captainId;
      return (
        <View key={p.user_id || p.guest_id} style={styles.row}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flex: 1 }}>
            {isCap && (
              <View style={styles.cBadge}><Text style={styles.cBadgeText}>C</Text></View>
            )}
            <Text style={[styles.name, { color }]}>{p.name}</Text>
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
  turnBanner: {
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1, marginBottom: 12, alignItems: 'center',
  },
  turnText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  title: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  label: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  capChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: theme.colors.background.input,
  },
  capChipText: { color: theme.colors.text.primary, fontSize: 13, fontWeight: '600' },
  teamCard: { marginBottom: 12 },
  teamHeader: { fontSize: 13, fontWeight: '800', marginBottom: 8, letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  name: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '600' },
  guestBadge: { color: theme.colors.accent.secondary, fontSize: 11, fontWeight: '700' },
  cBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.accent.gold, alignItems: 'center', justifyContent: 'center' },
  cBadgeText: { color: '#000', fontWeight: '900', fontSize: 11 },
  pickBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  pickText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  removeBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.15)', alignItems: 'center', justifyContent: 'center' },
  transferBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(59,130,246,0.15)', alignItems: 'center', justifyContent: 'center' },
});
