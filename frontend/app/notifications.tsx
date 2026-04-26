import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { playersApi } from '@/api/client';
import { GlassCard } from '@/components/GlassCard';
import { LoadingButton } from '@/components/LoadingButton';
import { theme } from '@/theme/darkTheme';
import { useTranslation } from 'react-i18next';

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const inv = await playersApi.getInvitations();
      setInvitations(Array.isArray(inv) ? inv : []);
    } catch {
      setInvitations([]);
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
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#fff" />}
      >
        {loading ? (
          <ActivityIndicator color={theme.colors.accent.primary} style={{ marginTop: 32 }} />
        ) : (
          <>
            <Text style={styles.section}>{t('notifications.invitations')}</Text>
            {invitations.length === 0 ? (
              <GlassCard style={{ alignItems: 'center', padding: 32 }}>
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
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

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
  section: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700', marginBottom: 12 },
  emptyText: { color: theme.colors.text.muted, fontSize: 13, marginTop: 12 },
  invTitle: { color: theme.colors.text.primary, fontSize: 15, fontWeight: '700' },
  muted: { color: theme.colors.text.muted, fontSize: 12, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
});
