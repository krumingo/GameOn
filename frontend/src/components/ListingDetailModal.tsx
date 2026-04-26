import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listingsApi } from '@/api/client';
import { LoadingButton } from './LoadingButton';
import { useAuthStore } from '@/store/authStore';
import { theme } from '@/theme/darkTheme';

interface Props {
  listingId: string | null;
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  MATCH_AVAILABLE: 'Свободен мач',
  LOOKING_FOR_PLAYERS: 'Търсят играчи',
  LOOKING_FOR_TEAM: 'Търсят отбор',
};

export const ListingDetailModal: React.FC<Props> = ({ listingId, visible, onClose, onChanged }) => {
  const { user } = useAuthStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [respMsg, setRespMsg] = useState('');

  useEffect(() => {
    if (!listingId) { setData(null); return; }
    setLoading(true);
    listingsApi.getById(listingId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [listingId]);

  if (!visible) return null;

  const isAuthor = data && user && data.author_id === user.id;
  const myResp = data?.responses?.find?.((r: any) => r.user_id === user?.id);

  const handleRespond = async () => {
    if (!listingId) return;
    setBusy(true);
    try {
      await listingsApi.respond(listingId, respMsg || undefined);
      const fresh = await listingsApi.getById(listingId);
      setData(fresh);
      setRespMsg('');
      onChanged();
      Alert.alert('Готово', 'Отговорът е изпратен');
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async (uid: string) => {
    if (!listingId) return;
    try {
      await listingsApi.acceptResponse(listingId, uid);
      const fresh = await listingsApi.getById(listingId);
      setData(fresh);
      onChanged();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    }
  };

  const handleClose = async () => {
    if (!listingId) return;
    try {
      await listingsApi.close(listingId);
      onChanged();
      onClose();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{data ? TYPE_LABEL[data.type] || 'Обява' : 'Обява'}</Text>
          <TouchableOpacity onPress={onClose} testID="listing-detail-close">
            <Ionicons name="close" size={22} color={theme.colors.text.primary} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {loading && <Text style={styles.muted}>Зареждам...</Text>}
          {!loading && data && (
            <>
              <Text style={styles.title}>{data.title}</Text>
              {data.description && <Text style={styles.body}>{data.description}</Text>}

              <View style={styles.metaGrid}>
                {data.venue && <Meta icon="location-outline" text={data.venue} />}
                {data.date && <Meta icon="calendar-outline" text={`${data.date}${data.time ? ' · ' + data.time : ''}`} />}
                {data.spots_needed != null && <Meta icon="people-outline" text={`${data.spots_needed} играчи`} />}
                {data.price_per_player != null && data.price_per_player > 0 && (
                  <Meta icon="cash-outline" text={`${data.price_per_player.toFixed(2)} €`} />
                )}
              </View>

              <View style={styles.authorBox}>
                <Text style={styles.muted}>От</Text>
                <Text style={styles.authorName}>
                  {data.author_name}{data.author_phone_masked ? `  ·  ${data.author_phone_masked}` : ''}
                </Text>
                <Text style={styles.muted}>Надеждност: {data.author_reliability_score ?? 100}/100</Text>
              </View>

              {!isAuthor && data.status === 'ACTIVE' && !myResp && (
                <View style={styles.respondBox}>
                  <Text style={styles.label}>Съобщение (опц.)</Text>
                  <TextInput
                    value={respMsg}
                    onChangeText={setRespMsg}
                    placeholder="Здрасти, искам да участвам..."
                    placeholderTextColor={theme.colors.text.muted}
                    multiline
                    style={styles.input}
                    testID="listing-respond-msg"
                  />
                  <LoadingButton
                    title="Отговори"
                    onPress={handleRespond}
                    loading={busy}
                    style={{ marginTop: 12 }}
                    testID="listing-respond-submit"
                  />
                </View>
              )}

              {!isAuthor && myResp && (
                <View style={styles.respondedBox} testID="listing-already-responded">
                  <Ionicons name="checkmark-circle" size={20} color={theme.colors.accent.success} />
                  <Text style={[styles.body, { color: theme.colors.accent.success }]}>
                    Отговорено · {myResp.status}
                  </Text>
                </View>
              )}

              {isAuthor && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.section}>Отговори ({data.responses?.length || 0})</Text>
                  {(data.responses || []).map((r: any) => (
                    <View key={r.user_id} style={styles.respRow} testID={`response-${r.user_id}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.authorName}>{r.user_name}</Text>
                        {r.message && <Text style={styles.muted}>{r.message}</Text>}
                        <Text style={styles.muted}>Надеждност: {r.reliability_score ?? 100} · {r.status}</Text>
                      </View>
                      {r.status === 'PENDING' && (
                        <TouchableOpacity
                          onPress={() => handleAccept(r.user_id)}
                          style={styles.acceptBtn}
                          testID={`response-accept-${r.user_id}`}
                        >
                          <Text style={styles.acceptText}>Приеми</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  {data.status === 'ACTIVE' && (
                    <LoadingButton
                      title="Затвори обявата"
                      variant="outline"
                      onPress={handleClose}
                      style={{ marginTop: 16 }}
                      testID="listing-close"
                    />
                  )}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const Meta: React.FC<{ icon: any; text: string }> = ({ icon, text }) => (
  <View style={styles.metaPill}>
    <Ionicons name={icon} size={12} color={theme.colors.text.secondary} />
    <Text style={styles.metaText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border.primary,
  },
  headerTitle: { color: theme.colors.text.primary, fontSize: 18, fontWeight: '700' },
  title: { color: theme.colors.text.primary, fontSize: 22, fontWeight: '800', marginBottom: 8 },
  body: { color: theme.colors.text.secondary, fontSize: 14, lineHeight: 20 },
  muted: { color: theme.colors.text.muted, fontSize: 12 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  metaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: theme.colors.background.input,
  },
  metaText: { color: theme.colors.text.primary, fontSize: 12, fontWeight: '600' },
  authorBox: {
    marginTop: 16, padding: 12, borderRadius: 12,
    backgroundColor: theme.colors.background.card,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  authorName: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700', marginVertical: 2 },
  respondBox: { marginTop: 20 },
  label: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: theme.colors.background.input, color: theme.colors.text.primary,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, fontSize: 14, minHeight: 80,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  respondedBox: {
    marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 12,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
  },
  section: { color: theme.colors.text.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  respRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border.primary,
  },
  acceptBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: theme.colors.accent.success,
  },
  acceptText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
