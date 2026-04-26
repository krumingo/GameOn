import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { playersApi, pushApi } from '@/api/client';
import { GlassCard } from '@/components/GlassCard';
import { LoadingButton } from '@/components/LoadingButton';
import { theme } from '@/theme/darkTheme';
import { useTranslation } from 'react-i18next';

const REMINDER_OPTIONS = [
  { v: 1, label: '1 час' },
  { v: 2, label: '2 часа' },
  { v: 24, label: '1 ден' },
  { v: 48, label: '2 дни' },
];

const DEFAULT_PREFS = {
  new_matches: true,
  reminders: true,
  reminder_hours: 24,
  rsvp_changes: false,
  chat: true,
};

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<any>(DEFAULT_PREFS);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const load = useCallback(async () => {
    try {
      const [inv, p] = await Promise.all([
        playersApi.getInvitations().catch(() => []),
        pushApi.getPrefs().catch(() => DEFAULT_PREFS),
      ]);
      setInvitations(Array.isArray(inv) ? inv : []);
      setPrefs({ ...DEFAULT_PREFS, ...(p || {}) });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const respond = async (id: string, action: 'accept' | 'decline') => {
    setBusyId(id);
    try {
      await playersApi.respondInvitation(id, action);
      await load();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    } finally {
      setBusyId(null);
    }
  };

  const togglePref = (key: string, value: any) => {
    setPrefs((p: any) => ({ ...p, [key]: value }));
  };

  const savePrefs = async () => {
    setSavingPrefs(true);
    try {
      const updated = await pushApi.updatePrefs(prefs);
      setPrefs({ ...DEFAULT_PREFS, ...(updated || {}) });
      Alert.alert('Готово', 'Настройките са запазени');
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-notifications">
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="notif-back">
          <Ionicons name="chevron-back" size={22} color={theme.colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#fff" />}
      >
        {loading ? (
          <ActivityIndicator color={theme.colors.accent.primary} style={{ marginTop: 32 }} />
        ) : (
          <>
            <Text style={styles.section}>{t('notifications.invitations')}</Text>
            {invitations.length === 0 ? (
              <GlassCard style={{ alignItems: 'center', padding: 32 }} testID="empty-invitations">
                <Ionicons name="mail-open-outline" size={36} color={theme.colors.text.muted} />
                <Text style={styles.emptyText}>{t('notifications.noInv')}</Text>
              </GlassCard>
            ) : (
              invitations.map((inv: any) => (
                <GlassCard key={inv.id} style={{ marginBottom: 8 }} testID={`inv-${inv.id}`}>
                  <Text style={styles.invTitle}>{inv.group_name}</Text>
                  <Text style={styles.muted}>Покана от {inv.from_user_name}</Text>
                  {inv.message && <Text style={[styles.muted, { marginTop: 4 }]}>"{inv.message}"</Text>}
                  <View style={styles.actionRow}>
                    <LoadingButton
                      title={t('notifications.decline')}
                      variant="outline"
                      onPress={() => respond(inv.id, 'decline')}
                      loading={busyId === inv.id}
                      style={{ flex: 1 }}
                      testID={`inv-decline-${inv.id}`}
                    />
                    <LoadingButton
                      title={t('notifications.accept')}
                      onPress={() => respond(inv.id, 'accept')}
                      loading={busyId === inv.id}
                      style={{ flex: 1 }}
                      testID={`inv-accept-${inv.id}`}
                    />
                  </View>
                </GlassCard>
              ))
            )}

            <Text style={styles.section}>Настройки на известия</Text>
            <GlassCard testID="push-prefs-card">
              <PrefRow
                label="Нови мачове"
                hint="Уведомление при създаване на нов мач в твоите групи"
                value={!!prefs.new_matches}
                onChange={(v) => togglePref('new_matches', v)}
                testID="pref-new-matches"
              />
              <PrefRow
                label="Напомняне преди мач"
                hint="Изпращаме ти напомняне преди час на мача"
                value={!!prefs.reminders}
                onChange={(v) => togglePref('reminders', v)}
                testID="pref-reminders"
              />
              {prefs.reminders && (
                <View style={{ paddingHorizontal: 4, paddingBottom: 12 }} testID="pref-reminder-hours">
                  <Text style={styles.muted}>Колко време преди?</Text>
                  <View style={styles.optRow}>
                    {REMINDER_OPTIONS.map((o) => (
                      <TouchableOpacity
                        key={o.v}
                        onPress={() => togglePref('reminder_hours', o.v)}
                        style={[styles.optChip, prefs.reminder_hours === o.v && styles.optChipActive]}
                        testID={`pref-rh-${o.v}`}
                      >
                        <Text style={[styles.optText, prefs.reminder_hours === o.v && styles.optTextActive]}>{o.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              <PrefRow
                label="Записвания/отписвания"
                hint="Известяване при записване или отписване на играч"
                value={!!prefs.rsvp_changes}
                onChange={(v) => togglePref('rsvp_changes', v)}
                testID="pref-rsvp-changes"
              />
              <PrefRow
                label="Чат съобщения"
                hint="Известие при ново съобщение в групов или мач чат"
                value={!!prefs.chat}
                onChange={(v) => togglePref('chat', v)}
                testID="pref-chat"
              />

              <LoadingButton
                title="Запази настройки"
                onPress={savePrefs}
                loading={savingPrefs}
                style={{ marginTop: 16 }}
                testID="pref-save"
              />
            </GlassCard>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const PrefRow: React.FC<{ label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; testID?: string }> = ({ label, hint, value, onChange, testID }) => (
  <View style={styles.prefRow} testID={testID}>
    <View style={{ flex: 1 }}>
      <Text style={styles.prefLabel}>{label}</Text>
      {hint && <Text style={styles.prefHint}>{hint}</Text>}
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: '#444', true: theme.colors.accent.primary }}
      thumbColor="#fff"
    />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  headerTitle: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.background.card,
    alignItems: 'center', justifyContent: 'center',
  },
  section: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700', marginTop: 16, marginBottom: 12 },
  emptyText: { color: theme.colors.text.muted, fontSize: 13, marginTop: 12 },
  invTitle: { color: theme.colors.text.primary, fontSize: 15, fontWeight: '700' },
  muted: { color: theme.colors.text.muted, fontSize: 12, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  prefRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, gap: 12,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border.primary,
  },
  prefLabel: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700' },
  prefHint: { color: theme.colors.text.muted, fontSize: 11, marginTop: 2 },
  optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  optChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: theme.colors.background.input,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  optChipActive: { backgroundColor: 'rgba(59,130,246,0.18)', borderColor: theme.colors.accent.primary },
  optText: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: '700' },
  optTextActive: { color: theme.colors.accent.primary },
});
