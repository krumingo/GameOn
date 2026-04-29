import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { matchesApi } from '@/api/client';
import { LoadingButton } from './LoadingButton';
import { GlassCard } from './GlassCard';
import { theme } from '@/theme/darkTheme';

interface Props {
  match: any;
  visible: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  isOwner: boolean;
}

type Mode = 'menu' | 'edit' | 'cancel';

function toLocalIso(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ''; }
}

export const MatchActionsMenu: React.FC<Props> = ({ match, visible, onClose, onChanged, isOwner }) => {
  const [mode, setMode] = useState<Mode>('menu');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [name, setName] = useState(match?.name || '');
  const [venue, setVenue] = useState(match?.venue || '');
  const [dt, setDt] = useState(toLocalIso(match?.start_datetime || ''));
  const [limit, setLimit] = useState(String(match?.player_limit ?? 14));

  const reset = () => {
    setMode('menu');
    setReason('');
    setName(match?.name || '');
    setVenue(match?.venue || '');
    setDt(toLocalIso(match?.start_datetime || ''));
    setLimit(String(match?.player_limit ?? 14));
  };

  const close = () => { reset(); onClose(); };

  const isCancelled = match?.status === 'CANCELLED';
  const hasRecurrence = !!match?.recurrence_series_id && match?.recurrence_active;

  const doCancel = async () => {
    setBusy(true);
    try {
      await matchesApi.cancel(match.id, reason);
      await onChanged();
      close();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    } finally { setBusy(false); }
  };

  const doStopRec = async () => {
    setBusy(true);
    try {
      await matchesApi.stopRecurrence(match.id);
      await onChanged();
      close();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    const exec = async () => {
      setBusy(true);
      try {
        await matchesApi.delete(match.id);
        await onChanged();
        close();
      } catch (e: any) {
        Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
      } finally { setBusy(false); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Окончателно изтриване на мача? Това не може да бъде отменено.')) exec();
    } else {
      Alert.alert(
        'Изтрий мача',
        'Това окончателно ще изтрие мача и всички записвания. Сигурен ли си?',
        [{ text: 'Не' }, { text: 'Да, изтрий', style: 'destructive', onPress: exec }],
      );
    }
  };

  const doSaveEdit = async () => {
    setBusy(true);
    try {
      const payload: any = {};
      if (name && name !== match?.name) payload.name = name;
      if (venue !== (match?.venue || '')) payload.venue = venue || null;
      if (dt) {
        const newIso = new Date(dt).toISOString();
        if (newIso !== match?.start_datetime) payload.start_datetime = newIso;
      }
      const lim = parseInt(limit, 10);
      if (!Number.isNaN(lim) && lim !== match?.player_limit) payload.player_limit = lim;
      if (Object.keys(payload).length === 0) { close(); return; }
      await matchesApi.update(match.id, payload);
      await onChanged();
      close();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
      <TouchableOpacity activeOpacity={1} onPress={close} style={styles.backdrop} testID="match-menu-backdrop">
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.sheetWrap}>
          <GlassCard style={styles.sheet}>
            <View style={styles.handle} />
            {mode === 'menu' && (
              <ScrollView>
                <Text style={styles.title}>{match?.name}</Text>
                <Text style={styles.sub}>Управление на мач</Text>
                <View style={{ marginTop: 12 }}>
                  <ActionRow
                    icon="create-outline"
                    label="Редактирай мач"
                    color={theme.colors.text.primary}
                    onPress={() => setMode('edit')}
                    disabled={isCancelled}
                    testID="match-menu-edit"
                  />
                  {hasRecurrence && (
                    <ActionRow
                      icon="repeat-outline"
                      label="Спри повторението"
                      color={theme.colors.accent.secondary}
                      onPress={doStopRec}
                      busy={busy}
                      testID="match-menu-stop-rec"
                    />
                  )}
                  {!isCancelled && (
                    <ActionRow
                      icon="close-circle-outline"
                      label="Отмени мач"
                      color={theme.colors.accent.danger}
                      onPress={() => setMode('cancel')}
                      testID="match-menu-cancel"
                    />
                  )}
                  {isOwner && (
                    <ActionRow
                      icon="trash-outline"
                      label="Изтрий мач"
                      color={theme.colors.accent.danger}
                      onPress={doDelete}
                      busy={busy}
                      testID="match-menu-delete"
                    />
                  )}
                </View>
                <LoadingButton
                  title="Затвори"
                  variant="outline"
                  onPress={close}
                  style={{ marginTop: 12 }}
                  testID="match-menu-close"
                />
              </ScrollView>
            )}

            {mode === 'cancel' && (
              <View>
                <Text style={styles.title}>Отмени мача</Text>
                <Text style={styles.sub}>Причината ще се покаже на записаните.</Text>
                <Text style={styles.label}>Причина</Text>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Например: Лошо време"
                  placeholderTextColor={theme.colors.text.muted}
                  style={styles.input}
                  testID="match-menu-cancel-reason"
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <LoadingButton title="Назад" variant="outline" onPress={() => setMode('menu')} style={{ flex: 1 }} />
                  <LoadingButton
                    title="Потвърди"
                    variant="danger"
                    onPress={doCancel}
                    loading={busy}
                    style={{ flex: 1 }}
                    testID="match-menu-cancel-confirm"
                  />
                </View>
              </View>
            )}

            {mode === 'edit' && (
              <ScrollView>
                <Text style={styles.title}>Редактирай мач</Text>
                <Text style={styles.label}>Име</Text>
                <TextInput value={name} onChangeText={setName} style={styles.input} testID="match-edit-name" />
                <Text style={styles.label}>Място</Text>
                <TextInput value={venue} onChangeText={setVenue} style={styles.input} testID="match-edit-venue" />
                <Text style={styles.label}>Дата и час</Text>
                {Platform.OS === 'web' ? (
                  // @ts-ignore — react-native-web supports passing native HTML inputs
                  <input
                    type="datetime-local"
                    value={dt}
                    onChange={(e: any) => setDt(e.target.value)}
                    style={{
                      backgroundColor: theme.colors.background.input,
                      color: theme.colors.text.primary,
                      padding: '10px 12px', borderRadius: 10, border: `1px solid ${theme.colors.border.primary}`,
                      fontSize: 15,
                    }}
                    data-testid="match-edit-datetime"
                  />
                ) : (
                  <TextInput value={dt} onChangeText={setDt} style={styles.input} placeholder="2026-05-08T20:00" placeholderTextColor={theme.colors.text.muted} />
                )}
                <Text style={styles.label}>Капацитет</Text>
                <TextInput
                  value={limit}
                  onChangeText={setLimit}
                  style={styles.input}
                  keyboardType="number-pad"
                  testID="match-edit-limit"
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <LoadingButton title="Назад" variant="outline" onPress={() => setMode('menu')} style={{ flex: 1 }} />
                  <LoadingButton title="Запази" onPress={doSaveEdit} loading={busy} style={{ flex: 1 }} testID="match-edit-save" />
                </View>
              </ScrollView>
            )}
          </GlassCard>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const ActionRow: React.FC<{
  icon: any; label: string; color: string; onPress: () => void;
  disabled?: boolean; busy?: boolean; testID?: string;
}> = ({ icon, label, color, onPress, disabled, busy, testID }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled || busy}
    style={[styles.actionRow, (disabled || busy) && { opacity: 0.5 }]}
    testID={testID}
  >
    <Ionicons name={icon} size={20} color={color} />
    <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    <Ionicons name="chevron-forward" size={16} color={theme.colors.text.muted} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheetWrap: { padding: 12 },
  sheet: { padding: 20, maxHeight: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 12 },
  title: { color: theme.colors.text.primary, fontSize: 18, fontWeight: '800', marginBottom: 2 },
  sub: { color: theme.colors.text.muted, fontSize: 13 },
  label: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: theme.colors.background.input,
    color: theme.colors.text.primary,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, fontSize: 15,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  actionLabel: { fontSize: 15, fontWeight: '600', flex: 1 },
});
