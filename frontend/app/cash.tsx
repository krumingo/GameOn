import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
  Modal, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cashApi, groupsApi, billingApi } from '@/api/client';
import { GlassCard } from '@/components/GlassCard';
import { LoadingButton } from '@/components/LoadingButton';
import { PaywallOverlay } from '@/components/PaywallOverlay';
import { theme } from '@/theme/darkTheme';
import { useTranslation } from 'react-i18next';

const PRO_PLANS = ['PRO', 'TRIAL', 'GRACE'];

export default function CashScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ groupId?: string }>();
  const router = useRouter();
  const [groupId, setGroupId] = useState<string>(params.groupId || '');
  const [groupName, setGroupName] = useState<string>('');
  const [groupRole, setGroupRole] = useState<string>('MEMBER');
  const [groupPlan, setGroupPlan] = useState<string>('FREE');
  const [groupCategories, setGroupCategories] = useState<string[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) {
      // pick first owned group
      try {
        const gs = await groupsApi.getMyGroups();
        const first = (gs || []).find((g: any) => g.role === 'OWNER' || g.role === 'ORGANIZER') || gs?.[0];
        if (first) {
          setGroupId(first.id);
          return; // re-trigger via useEffect on groupId
        }
      } catch {}
      setLoading(false); return;
    }
    try {
      const [gd, bill] = await Promise.all([
        groupsApi.getById(groupId),
        billingApi.getStatus(groupId).catch(() => ({ plan: 'FREE' })),
      ]);
      setGroupName(gd?.name || '');
      setGroupRole(gd?.role || 'MEMBER');
      setGroupPlan(bill?.plan || 'FREE');
      setGroupCategories(gd?.cash_categories || []);
      if (PRO_PLANS.includes(bill?.plan)) {
        const [s, txs] = await Promise.all([
          cashApi.getSummary(groupId),
          cashApi.getTransactions(groupId, { limit: 50 }),
        ]);
        setSummary(s);
        setTransactions(txs?.transactions || []);
      } else {
        setSummary(null);
        setTransactions([]);
      }
    } catch (e: any) {
      // ignore (no PRO etc.)
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isAdmin = groupRole === 'OWNER' || groupRole === 'ORGANIZER';
  const isPro = PRO_PLANS.includes(groupPlan);

  const handleExport = (format: 'csv' | 'json') => {
    if (!groupId) return;
    (async () => {
      try {
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || process.env.REACT_APP_BACKEND_URL || '';
        const token = await AsyncStorage.getItem('token');
        const url = `${apiUrl}/api/groups/${groupId}/cash/export?format=${format}`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) throw new Error(String(resp.status));
        if (Platform.OS === 'web') {
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = `cash_${groupId}.${format}`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } else {
          const text = await resp.text();
          Alert.alert('Експорт', text.slice(0, 500));
        }
      } catch (e: any) {
        Alert.alert('Грешка', 'Експорт неуспешен');
      }
    })();
  };

  const showExportSheet = () => {
    if (Platform.OS === 'web') {
      // simple confirm-style
      const choice = window.prompt('Експорт като (csv / json):', 'csv');
      if (choice === 'csv' || choice === 'json') handleExport(choice);
      return;
    }
    Alert.alert('Експорт', 'Избери формат', [
      { text: 'CSV', onPress: () => handleExport('csv') },
      { text: 'JSON', onPress: () => handleExport('json') },
      { text: 'Отказ', style: 'cancel' },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color={theme.colors.accent.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-cash">
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="cash-back">
          <Ionicons name="chevron-back" size={22} color={theme.colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('cash.title')}{groupName ? ` · ${groupName}` : ''}</Text>
        {isPro && isAdmin ? (
          <TouchableOpacity onPress={showExportSheet} style={styles.iconBtn} testID="cash-export">
            <Ionicons name="download-outline" size={20} color={theme.colors.text.primary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {!isPro ? (
        <PaywallOverlay feature={t('cash.title')} groupId={groupId} plan={groupPlan} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#fff" />}
        >
          <GlassCard style={{ marginBottom: 12 }} testID="cash-summary">
            <Text style={styles.balLabel}>{t('cash.balance')}</Text>
            <Text style={[styles.balVal, { color: (summary?.balance ?? 0) >= 0 ? theme.colors.accent.success : theme.colors.accent.danger }]}>
              {(summary?.balance ?? 0).toFixed(2)} €
            </Text>
            <View style={styles.ieRow}>
              <View style={styles.ieBox}>
                <Text style={[styles.ieLabel, { color: theme.colors.accent.success }]}>{t('cash.income')}</Text>
                <Text style={styles.ieVal}>+{(summary?.total_income ?? 0).toFixed(2)} €</Text>
              </View>
              <View style={styles.ieBox}>
                <Text style={[styles.ieLabel, { color: theme.colors.accent.danger }]}>{t('cash.expense')}</Text>
                <Text style={styles.ieVal}>-{(summary?.total_expense ?? 0).toFixed(2)} €</Text>
              </View>
            </View>
          </GlassCard>

          {(summary?.categories || []).length > 0 && (
            <GlassCard style={{ marginBottom: 12 }}>
              <Text style={styles.section}>{t('cash.categories')}</Text>
              {(summary?.categories || [])
                .filter((c: any) => c.is_active)
                .map((c: any) => (
                  <View key={c.name} style={styles.row}>
                    <Text style={styles.catName}>{c.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Text style={[styles.muted, { color: theme.colors.accent.success }]}>+{c.total_income.toFixed(2)}</Text>
                      <Text style={[styles.muted, { color: theme.colors.accent.danger }]}>-{c.total_expense.toFixed(2)}</Text>
                    </View>
                  </View>
                ))}
            </GlassCard>
          )}

          {(summary?.player_balances || []).length > 0 && (
            <GlassCard style={{ marginBottom: 12 }} testID="player-balances">
              <Text style={styles.section}>{t('cash.playerBalances')}</Text>
              {(summary?.player_balances || []).map((p: any) => (
                <View key={p.user_id || p.guest_id} style={styles.row}>
                  <Text style={styles.txnName}>{p.name}</Text>
                  <Text style={[styles.amount, { color: p.balance >= 0 ? theme.colors.accent.success : theme.colors.accent.danger }]}>
                    {p.balance >= 0 ? '+' : ''}{p.balance.toFixed(2)} €
                  </Text>
                </View>
              ))}
            </GlassCard>
          )}

          <Text style={styles.section}>{t('cash.transactions')}</Text>
          {transactions.length === 0 ? (
            <Text style={styles.muted}>{t('cash.noTxn')}</Text>
          ) : (
            transactions.map((tx: any) => (
              <GlassCard key={tx.id} style={{ marginBottom: 8 }} testID={`txn-${tx.id}`}>
                <View style={styles.txnHeader}>
                  <View style={[styles.typeDot, { backgroundColor: tx.type === 'INCOME' ? theme.colors.accent.success : theme.colors.accent.danger }]} />
                  <Text style={styles.txnName}>{tx.category}</Text>
                  <Text style={[styles.amount, { color: tx.type === 'INCOME' ? theme.colors.accent.success : theme.colors.accent.danger }]}>
                    {tx.type === 'INCOME' ? '+' : '-'}{(tx.amount || 0).toFixed(2)} €
                  </Text>
                </View>
                {tx.note && <Text style={styles.muted}>{tx.note}</Text>}
                {tx.counterparty && <Text style={styles.muted}>• {tx.counterparty}</Text>}
              </GlassCard>
            ))
          )}
        </ScrollView>
      )}

      {isPro && isAdmin && (
        <TouchableOpacity
          style={styles.createFab}
          onPress={() => setCreateOpen(true)}
          testID="cash-add"
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      <CreateTxnModal
        visible={createOpen}
        groupId={groupId}
        categories={groupCategories.length ? groupCategories : ['MATCH_FEES', 'BALLS', 'EQUIPMENT', 'KITS', 'BANQUET', 'PITCH_PAYMENT', 'OTHER']}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); load(); }}
      />
    </SafeAreaView>
  );
}

const CreateTxnModal: React.FC<{
  visible: boolean;
  groupId: string;
  categories: string[];
  onClose: () => void;
  onCreated: () => void;
}> = ({ visible, groupId, categories, onClose, onCreated }) => {
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('INCOME');
  const [category, setCategory] = useState<string>(categories[0] || 'OTHER');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setCategory(categories[0] || 'OTHER');
      setAmount('');
      setNote('');
      setCounterparty('');
      setType('INCOME');
    }
  }, [visible, categories]);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { Alert.alert('Грешка', 'Сумата трябва да е > 0'); return; }
    setBusy(true);
    try {
      await cashApi.createTransaction(groupId, {
        type, category, amount: amt,
        note: note || undefined,
        counterparty: counterparty || undefined,
        status: 'PAID',
      });
      onCreated();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background.primary }}>
        <View style={styles.modalHeader}>
          <Text style={styles.headerTitle}>Нова транзакция</Text>
          <TouchableOpacity onPress={onClose} testID="ct-close"><Ionicons name="close" size={22} color={theme.colors.text.primary} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={styles.typeRow}>
            <TouchableOpacity
              onPress={() => setType('INCOME')}
              style={[styles.typeBtn, type === 'INCOME' && { backgroundColor: theme.colors.accent.success, borderColor: theme.colors.accent.success }]}
              testID="ct-income"
            >
              <Text style={[styles.typeText, type === 'INCOME' && { color: '#fff' }]}>Приход</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setType('EXPENSE')}
              style={[styles.typeBtn, type === 'EXPENSE' && { backgroundColor: theme.colors.accent.danger, borderColor: theme.colors.accent.danger }]}
              testID="ct-expense"
            >
              <Text style={[styles.typeText, type === 'EXPENSE' && { color: '#fff' }]}>Разход</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Категория</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {categories.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setCategory(c)}
                style={[styles.catChip, category === c && { backgroundColor: theme.colors.accent.primary }]}
                testID={`ct-cat-${c}`}
              >
                <Text style={[styles.catChipText, category === c && { color: '#fff' }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.label}>Сума (€)</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.input} testID="ct-amount" />

          <Text style={styles.label}>Бележка</Text>
          <TextInput value={note} onChangeText={setNote} style={styles.input} testID="ct-note" />

          <Text style={styles.label}>Контрагент</Text>
          <TextInput value={counterparty} onChangeText={setCounterparty} placeholder="Иван П." placeholderTextColor={theme.colors.text.muted} style={styles.input} testID="ct-counterparty" />

          <LoadingButton title="Запази" onPress={submit} loading={busy} style={{ marginTop: 20 }} testID="ct-submit" />
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  headerTitle: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.background.card,
    alignItems: 'center', justifyContent: 'center',
  },
  balLabel: { color: theme.colors.text.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  balVal: { fontSize: 36, fontWeight: '900', marginTop: 4 },
  ieRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  ieBox: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: theme.colors.background.input },
  ieLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  ieVal: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700', marginTop: 4 },
  section: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  catName: { color: theme.colors.text.primary, fontSize: 13, fontWeight: '600' },
  muted: { color: theme.colors.text.muted, fontSize: 12 },
  txnHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  txnName: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700', flex: 1 },
  amount: { fontSize: 14, fontWeight: '700' },
  createFab: {
    position: 'absolute',
    bottom: 30, right: 20,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.accent.primary,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border.primary,
  },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    backgroundColor: theme.colors.background.input,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  typeText: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700' },
  label: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: theme.colors.background.input, color: theme.colors.text.primary,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, fontSize: 14,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  catChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: theme.colors.background.input,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  catChipText: { color: theme.colors.text.primary, fontSize: 12, fontWeight: '600' },
});
