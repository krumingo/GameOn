import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Modal, TextInput, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { matchesApi } from '@/api/client';
import { withRetry } from '@/utils/retry';
import { GlassCard } from '@/components/GlassCard';
import { LoadingButton } from '@/components/LoadingButton';
import { PaywallOverlay } from '@/components/PaywallOverlay';
import { StatusPill } from '@/components/StatusPill';
import { theme } from '@/theme/darkTheme';

const PRO_PLANS = ['PRO', 'TRIAL', 'GRACE'];

interface Props {
  match: any;
  groupPlan: string;
  groupId: string;
  isAdmin: boolean;
  onRefresh: () => Promise<void> | void;
}

const MODE_LABELS: Record<string, string> = {
  SPLIT: 'SPLIT',
  FIXED: 'Фиксирана',
  SPLIT_WITH_CASH: 'SPLIT + КАСА',
  CASH_PAYS_ALL: 'Касата плаща',
};

export const PaymentsTab: React.FC<Props> = ({ match, groupPlan, groupId, isAdmin, onRefresh }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [markFor, setMarkFor] = useState<any>(null);

  const fetch = async () => {
    try {
      const d = await matchesApi.getPayments(match.id);
      setData(d);
    } catch (e: any) {
      // PRO required handled via PaywallOverlay below
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [match.id]);

  if (!PRO_PLANS.includes(groupPlan)) {
    return <PaywallOverlay feature="Плащания" groupId={groupId} plan={groupPlan} />;
  }

  if (loading || !data) return <View style={styles.loadingWrap}><Text style={styles.muted}>Зареждам...</Text></View>;

  const collectedPct = data.expected_from_players > 0
    ? Math.min(100, (data.collected_total / data.expected_from_players) * 100)
    : 0;

  const handleMark = async (paid_amount: number) => {
    try {
      await withRetry(() => matchesApi.markPayment(match.id, {
        user_id: markFor.user_id, guest_id: markFor.guest_id || undefined,
        status: 'PAID', paid_amount,
      }));
      setMarkFor(null);
      await fetch();
      await onRefresh();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    }
  };

  const handleRecord = async () => {
    try {
      await matchesApi.recordToCash(match.id);
      Alert.alert('Готово', `Прехвърлени ${data.collected_total.toFixed(2)} € в касата`);
      await fetch();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} testID="payments-tab">
      <GlassCard style={{ marginBottom: 12 }}>
        <View style={styles.summaryRow}>
          <Stat label="Терен" value={`${data.total_cost.toFixed(2)} €`} />
          <Stat label="Участници" value={`${data.total_participants}`} />
          <Stat label="Дял" value={`${data.price_per_player.toFixed(2)} €`} />
        </View>
        <View style={[styles.modePill, { alignSelf: 'flex-start', marginTop: 12 }]}>
          <Text style={styles.modeText}>{MODE_LABELS[data.pricing_mode] || data.pricing_mode}</Text>
        </View>
        {data.cash_contribution > 0 && (
          <Text style={[styles.muted, { marginTop: 8 }]}>
            Касата покрива: <Text style={{ color: theme.colors.accent.gold, fontWeight: '700' }}>
              {data.cash_contribution.toFixed(2)} €
            </Text>
          </Text>
        )}
        <View style={{ marginTop: 12 }}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${collectedPct}%` }]} />
          </View>
          <Text style={[styles.muted, { marginTop: 6 }]}>
            Събрано: {data.collected_total.toFixed(2)} € / {data.expected_from_players.toFixed(2)} €
          </Text>
        </View>
      </GlassCard>

      <GlassCard style={{ marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>Играчи</Text>
        {(data.per_player || []).map((p: any) => {
          const status = p.status;
          return (
            <View key={`${p.user_id || p.guest_id}`} style={styles.row} testID={`pay-${p.user_id || p.guest_id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {p.name}
                  {p.is_guest && <Text style={{ color: theme.colors.accent.secondary, fontSize: 11 }}>  ГОСТ</Text>}
                </Text>
                <Text style={styles.muted}>{p.amount.toFixed(2)} € • платено {p.paid_amount.toFixed(2)} €</Text>
                {p.overpaid_to_cash > 0 && (
                  <Text style={[styles.muted, { color: theme.colors.accent.gold }]}>
                    +{p.overpaid_to_cash.toFixed(2)} € за касата
                  </Text>
                )}
              </View>
              <StatusPill status={status} size="sm" testID={`pay-status-${p.user_id || p.guest_id}`} />
              {isAdmin && (
                <TouchableOpacity
                  onPress={() => setMarkFor(p)}
                  style={styles.markBtn}
                  testID={`pay-mark-${p.user_id || p.guest_id}`}
                >
                  <Ionicons name="cash-outline" size={16} color={theme.colors.accent.primary} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </GlassCard>

      {isAdmin && data.collected_total > 0 && (
        <LoadingButton
          title={`Прехвърли ${data.collected_total.toFixed(2)} € в касата`}
          onPress={handleRecord}
          testID="pay-record-cash"
        />
      )}

      <MarkModal
        item={markFor}
        currency="€"
        onClose={() => setMarkFor(null)}
        onSubmit={handleMark}
      />
    </ScrollView>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const MarkModal: React.FC<any> = ({ item, currency, onClose, onSubmit }) => {
  const [paid, setPaid] = useState('');
  useEffect(() => {
    if (item) setPaid(item.amount?.toString() || '0');
  }, [item]);
  if (!item) return null;
  const amt = parseFloat(paid) || 0;
  const expected = item.amount || 0;
  const surplus = amt > expected ? amt - expected : 0;
  return (
    <Modal visible={!!item} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background.primary, padding: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
          <Text style={[styles.sectionTitle, { fontSize: 18 }]}>Маркирай платил</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={theme.colors.text.primary} /></TouchableOpacity>
        </View>
        <Text style={[styles.muted, { marginBottom: 8 }]}>{item.name} — дължи {expected.toFixed(2)} {currency}</Text>
        <Text style={styles.label}>Платена сума</Text>
        <TextInput
          value={paid}
          onChangeText={setPaid}
          keyboardType="decimal-pad"
          style={styles.input}
          testID="mark-paid-amount"
        />
        {surplus > 0 && (
          <Text style={[styles.muted, { color: theme.colors.accent.gold, marginTop: 8 }]}>
            {surplus.toFixed(2)} {currency} отиват в касата
          </Text>
        )}
        <LoadingButton title="Маркирай" onPress={() => onSubmit(amt)} style={{ marginTop: 16 }} testID="mark-paid-submit" />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  loadingWrap: { padding: 24 },
  muted: { color: theme.colors.text.muted, fontSize: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  statLabel: { color: theme.colors.text.muted, fontSize: 11, fontWeight: '600' },
  statValue: { color: theme.colors.text.primary, fontSize: 18, fontWeight: '700', marginTop: 2 },
  modePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.colors.background.input },
  modeText: { color: theme.colors.text.secondary, fontWeight: '700', fontSize: 11 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: theme.colors.background.input, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: theme.colors.accent.success, borderRadius: 3 },
  sectionTitle: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border.primary },
  name: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '600' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '800' },
  markBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(59,130,246,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  label: { color: theme.colors.text.secondary, fontSize: 13, marginTop: 12, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: theme.colors.background.input, color: theme.colors.text.primary,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, fontSize: 15,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
});
