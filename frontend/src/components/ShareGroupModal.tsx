import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Share, Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { LoadingButton } from './LoadingButton';
import { theme } from '@/theme/darkTheme';

interface Props {
  visible: boolean;
  groupId?: string;
  groupName: string;
  entryCode: string;
  onClose: () => void;
}

const APP_URL = 'https://gameon.app';

export const ShareGroupModal: React.FC<Props> = ({ visible, groupName, entryCode, onClose }) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const deepLink = `${APP_URL}/join?code=${encodeURIComponent(entryCode)}`;
  const shareMsg = `Присъедини се към ${groupName} в GameOn!\nКод: ${entryCode}\n\n${deepLink}`;

  const copyCode = async () => {
    try {
      await Clipboard.setStringAsync(entryCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {}
  };

  const copyLink = async () => {
    try {
      await Clipboard.setStringAsync(deepLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {}
  };

  const shareNative = async () => {
    if (Platform.OS === 'web') {
      // Web Share API fallback
      try {
        if ((navigator as any)?.share) {
          await (navigator as any).share({ title: `Покана за ${groupName}`, text: shareMsg });
          return;
        }
      } catch {}
      await Clipboard.setStringAsync(shareMsg);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
      return;
    }
    try {
      await Share.share({ message: shareMsg, title: `Покана за ${groupName}` });
    } catch {}
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Сподели {groupName}</Text>
            <TouchableOpacity onPress={onClose} testID="share-close">
              <Ionicons name="close" size={22} color={theme.colors.text.primary} />
            </TouchableOpacity>
          </View>

          <GlassCard style={{ marginTop: 12 }}>
            <Text style={styles.label}>Код за присъединяване</Text>
            <Text style={styles.code} testID="share-code">{entryCode}</Text>
            <TouchableOpacity onPress={copyCode} style={styles.copyBtn} testID="share-copy-code">
              <Ionicons name={copiedCode ? 'checkmark' : 'copy-outline'} size={16} color="#fff" />
              <Text style={styles.copyText}>{copiedCode ? 'Копирано' : 'Копирай'}</Text>
            </TouchableOpacity>
          </GlassCard>

          <GlassCard style={{ marginTop: 12 }}>
            <Text style={styles.label}>Линк</Text>
            <Text style={styles.link} numberOfLines={2}>{deepLink}</Text>
            <TouchableOpacity onPress={copyLink} style={[styles.copyBtn, { backgroundColor: theme.colors.background.input }]} testID="share-copy-link">
              <Ionicons name={copiedLink ? 'checkmark' : 'link-outline'} size={16} color={theme.colors.text.primary} />
              <Text style={[styles.copyText, { color: theme.colors.text.primary }]}>{copiedLink ? 'Копирано' : 'Копирай линк'}</Text>
            </TouchableOpacity>
          </GlassCard>

          <LoadingButton
            title="Сподели"
            onPress={shareNative}
            style={{ marginTop: 16 }}
            testID="share-native"
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.background.primary,
    padding: 20, paddingBottom: 32,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderColor: theme.colors.border.primary,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: theme.colors.text.primary, fontSize: 18, fontWeight: '800' },
  label: { color: theme.colors.text.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  code: {
    color: theme.colors.accent.primary, fontSize: 28, fontWeight: '900',
    letterSpacing: 2, marginTop: 6, marginBottom: 12,
  },
  link: { color: theme.colors.text.secondary, fontSize: 13, marginTop: 6, marginBottom: 12 },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: theme.colors.accent.primary,
  },
  copyText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
