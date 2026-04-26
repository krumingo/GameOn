import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  TextInput, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { matchesApi } from '@/api/client';
import { GlassCard } from '@/components/GlassCard';
import { LoadingButton } from '@/components/LoadingButton';
import { theme } from '@/theme/darkTheme';

interface Props {
  match: any;
  rsvps: any[];
  members: any[];
  currentUserId?: string;
  isAdmin: boolean;
  onRefresh: () => Promise<void> | void;
}

export const PlayersTab: React.FC<Props> = ({
  match, rsvps, members, currentUserId, isAdmin, onRefresh,
}) => {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const going = rsvps.filter((r) => r.status === 'going');
  const pending = rsvps.filter((r) => r.status === 'pending');
  const waitlist = rsvps.filter((r) => r.status === 'waitlist');

  const handleApprove = async (userId: string, action: 'approve' | 'reject') => {
    try {
      await matchesApi.rsvpRemove; // suppress lint
      const path = action === 'approve' ? 'approve' : 'reject';
      await (await import('@/api/client')).default.post(
        `/matches/${match.id}/approve-request`, { user_id: userId, action }
      );
      await onRefresh();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    }
  };

  const handleRemove = (userId: string, name: string) => {
    const doIt = async () => {
      try {
        await matchesApi.rsvpRemove ? null : null;
        const client = (await import('@/api/client')).default;
        await client.post(`/matches/${match.id}/rsvp-remove`, { user_id: userId });
        await onRefresh();
      } catch (e: any) {
        Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Махни ${name}?`)) doIt();
    } else {
      Alert.alert('Махни', `Сигурен ли си за ${name}?`, [
        { text: 'Не' }, { text: 'Да', style: 'destructive', onPress: doIt },
      ]);
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    try {
      await matchesApi.cancel(match.id, reason);
      setCancelOpen(false);
      setReason('');
      await onRefresh();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      {pending.length > 0 && (
        <GlassCard style={[styles.section, { borderColor: 'rgba(245,158,11,0.4)' }]}>
          <Text style={[styles.sectionTitle, { color: '#F59E0B' }]}>
            {pending.length} чакащи одобрение
          </Text>
          {pending.map((r) => (
            <View key={r.id} style={styles.row} testID={`pending-${r.user_id}`}>
              <Text style={styles.name}>{r.name}</Text>
              {isAdmin && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: theme.colors.accent.success }]}
                    onPress={() => handleApprove(r.user_id, 'approve')}
                  >
                    <Text style={styles.smallBtnText}>✓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: theme.colors.accent.danger }]}
                    onPress={() => handleApprove(r.user_id, 'reject')}
                  >
                    <Text style={styles.smallBtnText}>✗</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </GlassCard>
      )}

      <GlassCard style={styles.section}>
        <Text style={styles.sectionTitle}>Записани ({going.length})</Text>
        {going.length === 0 ? (
          <Text style={styles.muted}>Все още няма записани</Text>
        ) : (
          going.map((r, idx) => {
            const isMe = r.user_id && r.user_id === currentUserId;
            return (
              <View key={r.id} style={styles.row} testID={`player-${r.user_id || r.guest_id}`}>
                <Text style={styles.name}>
                  <Text style={styles.muted}>#{idx + 1} </Text>
                  {r.name}
                  {isMe && <Text style={{ color: theme.colors.accent.secondary }}> (ти)</Text>}
                  {r.is_guest && (
                    <Text style={[styles.guestBadge]}> ГОСТ</Text>
                  )}
                </Text>
                {isAdmin && r.user_id !== currentUserId && (
                  <TouchableOpacity
                    onPress={() => handleRemove(r.user_id || r.guest_id, r.name)}
                    style={styles.iconBtn}
                  >
                    <Ionicons name="close" size={16} color={theme.colors.accent.danger} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </GlassCard>

      {waitlist.length > 0 && (
        <GlassCard style={[styles.section, { borderColor: 'rgba(139,92,246,0.4)' }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.status.waitlist }]}>
            Чакащи ({waitlist.length})
          </Text>
          {waitlist.map((r) => (
            <View key={r.id} style={styles.row}>
              <Text style={styles.name}>
                <Text style={styles.muted}>#{r.waitlist_position} </Text>{r.name}
              </Text>
            </View>
          ))}
        </GlassCard>
      )}

      {isAdmin && match.status !== 'CANCELLED' && (
        <View style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <LoadingButton
              title="Запиши човек"
              variant="outline"
              onPress={() => setBulkOpen(true)}
              style={{ flex: 1 }}
              testID="players-bulk"
            />
            <LoadingButton
              title="Гост"
              variant="outline"
              onPress={() => setGuestOpen(true)}
              style={{ flex: 1 }}
              testID="players-add-guest"
            />
          </View>
          <LoadingButton
            title="Отмени мача"
            variant="danger"
            onPress={() => setCancelOpen(true)}
            style={{ marginTop: 12 }}
            testID="players-cancel-match"
          />
        </View>
      )}

      <BulkAddModal
        visible={bulkOpen}
        onClose={() => setBulkOpen(false)}
        members={members}
        going={going}
        matchId={match.id}
        onDone={onRefresh}
      />
      <AddGuestModal
        visible={guestOpen}
        onClose={() => setGuestOpen(false)}
        groupId={match.group_id}
        matchId={match.id}
        onDone={onRefresh}
      />
      <Modal visible={cancelOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCancelOpen(false)}>
        <View style={{ flex: 1, backgroundColor: theme.colors.background.primary, padding: 20 }}>
          <Text style={[styles.sectionTitle, { fontSize: 18 }]}>Отмени мача</Text>
          <Text style={styles.muted}>Причината ще се покаже на записаните.</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Лошо време"
            placeholderTextColor={theme.colors.text.muted}
            style={styles.input}
            testID="cancel-reason"
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <LoadingButton title="Отказ" variant="outline" onPress={() => setCancelOpen(false)} style={{ flex: 1 }} />
            <LoadingButton title="Потвърди" variant="danger" onPress={handleCancel} loading={busy} style={{ flex: 1 }} testID="cancel-confirm" />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const BulkAddModal: React.FC<any> = ({ visible, onClose, members, going, matchId, onDone }) => {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const goingIds = new Set(going.filter((r: any) => r.user_id).map((r: any) => r.user_id));
  const availableMembers = members.filter((m) => !m.is_guest && !goingIds.has(m.user_id));
  const submit = async () => {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (!ids.length) { onClose(); return; }
    setBusy(true);
    try {
      const client = (await import('@/api/client')).default;
      await client.post(`/matches/${matchId}/rsvp-bulk`, { user_ids: ids, status: 'going' });
      onClose();
      setSelected({});
      onDone();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    } finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background.primary }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border.primary }}>
          <Text style={[styles.sectionTitle, { fontSize: 18 }]}>Запиши хора</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={theme.colors.text.primary} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {availableMembers.length === 0 && <Text style={styles.muted}>Всички са записани</Text>}
          {availableMembers.map((m: any) => (
            <TouchableOpacity
              key={m.user_id}
              style={[styles.row, { borderBottomColor: theme.colors.border.primary, borderBottomWidth: 1 }]}
              onPress={() => setSelected({ ...selected, [m.user_id]: !selected[m.user_id] })}
              testID={`bulk-row-${m.user_id}`}
            >
              <Text style={styles.name}>{m.name}</Text>
              <Ionicons
                name={selected[m.user_id] ? 'checkbox' : 'square-outline'}
                size={22}
                color={selected[m.user_id] ? theme.colors.accent.primary : theme.colors.text.muted}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={{ padding: 16 }}>
          <LoadingButton title="Запиши" onPress={submit} loading={busy} testID="bulk-submit" />
        </View>
      </View>
    </Modal>
  );
};

const AddGuestModal: React.FC<any> = ({ visible, onClose, groupId, matchId, onDone }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) { Alert.alert('Грешка', 'Името е задължително'); return; }
    setBusy(true);
    try {
      const client = (await import('@/api/client')).default;
      const guest = await client.post(`/groups/${groupId}/guests`, { name: name.trim(), phone: phone || undefined }).then((r) => r.data);
      await client.post(`/matches/${matchId}/rsvp-guest`, { guest_id: guest.id, status: 'going' });
      onClose(); setName(''); setPhone('');
      onDone();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно');
    } finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background.primary, padding: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
          <Text style={[styles.sectionTitle, { fontSize: 18 }]}>Добави гост</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={theme.colors.text.primary} /></TouchableOpacity>
        </View>
        <Text style={styles.label}>Име</Text>
        <TextInput value={name} onChangeText={setName} style={styles.input} testID="guest-name" />
        <Text style={styles.label}>Телефон (опц.)</Text>
        <TextInput value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad" testID="guest-phone" />
        <LoadingButton title="Запиши гост" onPress={submit} loading={busy} style={{ marginTop: 16 }} testID="guest-submit" />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  section: { marginBottom: 12 },
  sectionTitle: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  name: { color: theme.colors.text.primary, fontSize: 14, flex: 1 },
  muted: { color: theme.colors.text.muted, fontSize: 13 },
  guestBadge: { color: theme.colors.accent.secondary, fontWeight: '700', fontSize: 11 },
  iconBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  smallBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { color: '#fff', fontWeight: '800' },
  label: { color: theme.colors.text.secondary, fontSize: 13, marginTop: 12, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: theme.colors.background.input,
    color: theme.colors.text.primary,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, fontSize: 15,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
});
