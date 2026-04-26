import React, { useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { matchesApi } from '@/api/client';
import { LoadingButton } from '@/components/LoadingButton';
import { theme } from '@/theme/darkTheme';

const PRO_PLANS = ['PRO', 'TRIAL', 'GRACE'];
const MODES: Array<{ k: string; label: string }> = [
  { k: 'SPLIT', label: 'Дели на играчи' },
  { k: 'FIXED', label: 'Фиксирана' },
  { k: 'SPLIT_WITH_CASH', label: 'Фикс. + Каса' },
  { k: 'CASH_PAYS_ALL', label: 'Касата плаща' },
];

interface Props {
  visible: boolean;
  groupId: string;
  groupPlan: string;
  onClose: () => void;
  onCreated: () => void;
}

function tomorrow20h(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  // Format YYYY-MM-DDTHH:mm
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const CreateMatchModal: React.FC<Props> = ({ visible, groupId, groupPlan, onClose, onCreated }) => {
  const [name, setName] = useState('Вторник вечер');
  const [dt, setDt] = useState<string>(tomorrow20h());
  const [venue, setVenue] = useState('');
  const [pricingMode, setPricingMode] = useState<string>('SPLIT');
  const [totalCost, setTotalCost] = useState<string>('140');
  const [pricePerPlayer, setPricePerPlayer] = useState<string>('10');
  const [recurrenceWeekly, setRecurrenceWeekly] = useState(false);
  const [playerLimit, setPlayerLimit] = useState<number>(14);
  const [approvalMode, setApprovalMode] = useState(false);
  const [busy, setBusy] = useState(false);

  const isPro = PRO_PLANS.includes(groupPlan);
  const maxLimit = isPro ? 30 : 14;

  const livePrice = useMemo(() => {
    const tc = parseFloat(totalCost) || 0;
    const pp = parseFloat(pricePerPlayer) || 0;
    if (pricingMode === 'SPLIT') return playerLimit > 0 ? (tc / playerLimit) : 0;
    if (pricingMode === 'FIXED') return pp;
    if (pricingMode === 'SPLIT_WITH_CASH') return pp;
    return 0;
  }, [pricingMode, totalCost, pricePerPlayer, playerLimit]);

  const handleSubmit = async () => {
    if (!name.trim()) { Alert.alert('Грешка', 'Името е задължително'); return; }
    if (!dt) { Alert.alert('Грешка', 'Датата е задължителна'); return; }
    const start = new Date(dt);
    if (isNaN(start.getTime()) || start.getTime() <= Date.now()) {
      Alert.alert('Грешка', 'Изберете дата в бъдещето'); return;
    }
    if (!isPro && playerLimit > 14) {
      Alert.alert('FREE план', 'FREE план позволява до 14 играчи'); return;
    }
    setBusy(true);
    try {
      await matchesApi.create(groupId, {
        name: name.trim(),
        venue: venue || undefined,
        start_datetime: start.toISOString(),
        total_cost: parseFloat(totalCost) || 0,
        price_per_player: parseFloat(pricePerPlayer) || 0,
        pricing_mode: pricingMode,
        recurrence: recurrenceWeekly ? 'WEEKLY' : 'ONE_TIME',
        player_limit: playerLimit,
        join_mode: approvalMode ? 'APPROVAL' : 'AUTO',
      });
      onCreated();
      onClose();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно създаване');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Нов мач</Text>
          <TouchableOpacity onPress={onClose} testID="create-match-close"><Ionicons name="close" size={22} color={theme.colors.text.primary} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Field label="Име на мача">
            <TextInput value={name} onChangeText={setName} style={styles.input} testID="cm-name" />
          </Field>
          <Field label="Дата и час (ISO local: YYYY-MM-DDTHH:mm)">
            <TextInput value={dt} onChangeText={setDt} style={styles.input} placeholder="2026-05-05T20:00" placeholderTextColor={theme.colors.text.muted} testID="cm-dt" />
          </Field>
          <Field label="Място">
            <TextInput value={venue} onChangeText={setVenue} style={styles.input} placeholder="Борисова градина" placeholderTextColor={theme.colors.text.muted} testID="cm-venue" />
          </Field>

          <Text style={styles.section}>Цена</Text>
          <View style={styles.modeRow}>
            {MODES.map((m) => (
              <TouchableOpacity
                key={m.k}
                onPress={() => setPricingMode(m.k)}
                style={[styles.modeBtn, pricingMode === m.k && { backgroundColor: theme.colors.accent.primary }]}
                testID={`cm-mode-${m.k}`}
              >
                <Text style={[styles.modeText, pricingMode === m.k && { color: '#fff' }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Field label="Цена за терен (€)">
            <TextInput value={totalCost} onChangeText={setTotalCost} keyboardType="decimal-pad" style={styles.input} testID="cm-total" />
          </Field>
          {(pricingMode === 'FIXED' || pricingMode === 'SPLIT_WITH_CASH') && (
            <Field label="Цена на играч (€)">
              <TextInput value={pricePerPlayer} onChangeText={setPricePerPlayer} keyboardType="decimal-pad" style={styles.input} testID="cm-price" />
            </Field>
          )}

          <Text style={styles.section}>Настройки</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Всяка седмица</Text>
            <TouchableOpacity
              onPress={() => setRecurrenceWeekly(!recurrenceWeekly)}
              style={[styles.toggle, recurrenceWeekly && { backgroundColor: theme.colors.accent.primary }]}
              testID="cm-weekly"
            >
              <View style={[styles.toggleThumb, recurrenceWeekly && { transform: [{ translateX: 18 }] }]} />
            </TouchableOpacity>
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>С одобрение</Text>
            <TouchableOpacity
              onPress={() => setApprovalMode(!approvalMode)}
              style={[styles.toggle, approvalMode && { backgroundColor: theme.colors.accent.primary }]}
              testID="cm-approval"
            >
              <View style={[styles.toggleThumb, approvalMode && { transform: [{ translateX: 18 }] }]} />
            </TouchableOpacity>
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Лимит играчи</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity onPress={() => setPlayerLimit(Math.max(2, playerLimit - 1))} style={styles.stepperBtn} testID="cm-limit-minus">
                <Ionicons name="remove" size={16} color={theme.colors.text.primary} />
              </TouchableOpacity>
              <Text style={styles.stepperVal}>{playerLimit}</Text>
              <TouchableOpacity
                onPress={() => setPlayerLimit(Math.min(maxLimit, playerLimit + 1))}
                disabled={playerLimit >= maxLimit}
                style={[styles.stepperBtn, playerLimit >= maxLimit && { opacity: 0.4 }]}
                testID="cm-limit-plus"
              >
                <Ionicons name="add" size={16} color={theme.colors.text.primary} />
              </TouchableOpacity>
            </View>
          </View>
          {!isPro && (
            <Text style={[styles.muted, { marginTop: 6 }]}>FREE план: до 14 играчи</Text>
          )}

          <View style={styles.preview} testID="cm-preview">
            <Text style={styles.previewLabel}>Преглед</Text>
            <Text style={styles.previewValue}>
              ≈ {livePrice.toFixed(2)} €/играч при {playerLimit} играчи
            </Text>
          </View>

          <LoadingButton title="Създай мач" onPress={handleSubmit} loading={busy} style={{ marginTop: 16 }} testID="cm-submit" />
        </ScrollView>
      </View>
    </Modal>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <View style={{ marginTop: 12 }}>
    <Text style={{ color: theme.colors.text.secondary, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>{label}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border.primary,
  },
  headerTitle: { color: theme.colors.text.primary, fontSize: 18, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.background.input, color: theme.colors.text.primary,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, fontSize: 15,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  section: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  modeBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: theme.colors.background.input,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  modeText: { color: theme.colors.text.primary, fontSize: 12, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  toggleLabel: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '600' },
  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: theme.colors.background.input,
    padding: 2, borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  stepperBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: theme.colors.background.input,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperVal: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700', minWidth: 28, textAlign: 'center' },
  preview: {
    marginTop: 20, padding: 14, borderRadius: 12,
    backgroundColor: theme.colors.background.card,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  previewLabel: { color: theme.colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  previewValue: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700', marginTop: 4 },
  muted: { color: theme.colors.text.muted, fontSize: 12 },
});
