import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listingsApi } from '@/api/client';
import { LoadingButton } from './LoadingButton';
import { theme } from '@/theme/darkTheme';

const TYPES = [
  { k: 'MATCH_AVAILABLE', label: 'Свободен мач' },
  { k: 'LOOKING_FOR_PLAYERS', label: 'Търся играчи' },
  { k: 'LOOKING_FOR_TEAM', label: 'Търся отбор' },
];

interface Props {
  visible: boolean;
  adminProGroups: any[];
  onClose: () => void;
  onCreated: () => void;
}

export const CreateListingModal: React.FC<Props> = ({ visible, adminProGroups, onClose, onCreated }) => {
  const [type, setType] = useState('LOOKING_FOR_PLAYERS');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [spotsNeeded, setSpotsNeeded] = useState('');
  const [pricePerPlayer, setPricePerPlayer] = useState('');
  const [groupId, setGroupId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible && adminProGroups.length > 0 && !groupId) {
      setGroupId(adminProGroups[0].id);
    }
  }, [visible, adminProGroups]);

  const reset = () => {
    setTitle(''); setDescription(''); setVenue(''); setDate(''); setTime('');
    setSpotsNeeded(''); setPricePerPlayer(''); setType('LOOKING_FOR_PLAYERS');
  };

  const submit = async () => {
    if (!title.trim()) { Alert.alert('Грешка', 'Заглавието е задължително'); return; }
    setBusy(true);
    try {
      await listingsApi.create({
        type, title: title.trim(),
        description: description || undefined,
        venue: venue || undefined,
        date: date || undefined,
        time: time || undefined,
        spots_needed: spotsNeeded ? parseInt(spotsNeeded, 10) : undefined,
        price_per_player: pricePerPlayer ? parseFloat(pricePerPlayer) : undefined,
        group_id: groupId || undefined,
      });
      reset();
      onCreated();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail?.message || e?.response?.data?.detail || 'Неуспешно');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Нова обява</Text>
          <TouchableOpacity onPress={onClose} testID="cl-close">
            <Ionicons name="close" size={22} color={theme.colors.text.primary} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.section}>Тип</Text>
          <View style={styles.typeRow}>
            {TYPES.map((tt) => (
              <TouchableOpacity
                key={tt.k}
                onPress={() => setType(tt.k)}
                style={[styles.typeBtn, type === tt.k && { backgroundColor: theme.colors.accent.primary, borderColor: theme.colors.accent.primary }]}
                testID={`cl-type-${tt.k}`}
              >
                <Text style={[styles.typeText, type === tt.k && { color: '#fff' }]}>{tt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Field label="Заглавие *">
            <TextInput value={title} onChangeText={setTitle} style={styles.input} testID="cl-title" />
          </Field>
          <Field label="Описание">
            <TextInput value={description} onChangeText={setDescription} style={[styles.input, { minHeight: 80 }]} multiline testID="cl-desc" />
          </Field>
          <Field label="Място">
            <TextInput value={venue} onChangeText={setVenue} placeholder="Борисова градина" placeholderTextColor={theme.colors.text.muted} style={styles.input} testID="cl-venue" />
          </Field>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field label="Дата (YYYY-MM-DD)">
                <TextInput value={date} onChangeText={setDate} placeholder="2026-05-10" placeholderTextColor={theme.colors.text.muted} style={styles.input} testID="cl-date" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Час">
                <TextInput value={time} onChangeText={setTime} placeholder="20:00" placeholderTextColor={theme.colors.text.muted} style={styles.input} testID="cl-time" />
              </Field>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field label="Нужни играчи">
                <TextInput value={spotsNeeded} onChangeText={setSpotsNeeded} keyboardType="number-pad" style={styles.input} testID="cl-spots" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Цена (€)">
                <TextInput value={pricePerPlayer} onChangeText={setPricePerPlayer} keyboardType="decimal-pad" style={styles.input} testID="cl-price" />
              </Field>
            </View>
          </View>

          {adminProGroups.length > 1 && (
            <Field label="Група">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {adminProGroups.map((g: any) => (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => setGroupId(g.id)}
                    style={[styles.groupChip, groupId === g.id && { backgroundColor: theme.colors.accent.primary }]}
                    testID={`cl-group-${g.id}`}
                  >
                    <Text style={[styles.groupChipText, groupId === g.id && { color: '#fff' }]}>{g.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Field>
          )}

          <LoadingButton title="Публикувай" onPress={submit} loading={busy} style={{ marginTop: 20 }} testID="cl-submit" />
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
  section: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: theme.colors.background.input,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  typeText: { color: theme.colors.text.primary, fontSize: 12, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.background.input, color: theme.colors.text.primary,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, fontSize: 14,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  groupChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: theme.colors.background.input,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  groupChipText: { color: theme.colors.text.primary, fontSize: 12, fontWeight: '600' },
});
