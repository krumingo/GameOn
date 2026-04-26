import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TextInput, TouchableOpacity, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { groupsApi } from '@/api/client';
import { LoadingButton } from './LoadingButton';
import { theme } from '@/theme/darkTheme';

interface Props {
  visible: boolean;
  mode: 'create' | 'join';
  onClose: () => void;
  onCreated?: () => void;
}

export const GroupActionModal: React.FC<Props> = ({ visible, mode, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setName(''); setCode(''); };
  const close = () => { reset(); onClose(); };

  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert('Грешка', 'Името е задължително'); return; }
    setBusy(true);
    try {
      await groupsApi.create({ name: name.trim() });
      onCreated?.();
      close();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно създаване');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (!code.trim()) { Alert.alert('Грешка', 'Кодът е задължителен'); return; }
    setBusy(true);
    try {
      await groupsApi.join(code.trim().toUpperCase());
      onCreated?.();
      close();
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно присъединяване');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {mode === 'create' ? 'Нова група' : 'Присъедини се'}
          </Text>
          <TouchableOpacity onPress={close} style={styles.closeBtn} testID="group-action-close">
            <Ionicons name="close" size={22} color={theme.colors.text.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.body}>
          {mode === 'create' ? (
            <>
              <Text style={styles.label}>Име на групата</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                style={styles.input}
                placeholder="Спортна София"
                placeholderTextColor={theme.colors.text.muted}
                testID="create-group-name"
              />
              <Text style={styles.hint}>
                След създаване ще получиш код, който да споделиш с играчите си.
              </Text>
              <LoadingButton
                title="Създай"
                onPress={handleCreate}
                loading={busy}
                style={{ marginTop: 24 }}
                testID="create-group-submit"
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>Код на групата</Text>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.toUpperCase())}
                style={styles.input}
                placeholder="SPORT26"
                placeholderTextColor={theme.colors.text.muted}
                autoCapitalize="characters"
                testID="join-group-code"
              />
              <LoadingButton
                title="Присъедини се"
                onPress={handleJoin}
                loading={busy}
                style={{ marginTop: 24 }}
                testID="join-group-submit"
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border.primary,
  },
  title: { color: theme.colors.text.primary, fontSize: 18, fontWeight: '700' },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.background.card,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: 20 },
  label: {
    color: theme.colors.text.secondary, fontSize: 13,
    fontWeight: '600', marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.background.input,
    color: theme.colors.text.primary,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, fontSize: 16,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  hint: { color: theme.colors.text.muted, fontSize: 12, marginTop: 8 },
});
