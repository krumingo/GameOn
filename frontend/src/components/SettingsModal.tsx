import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import i18n from 'i18next';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { authApi } from '@/api/client';
import { LoadingButton } from './LoadingButton';
import { theme } from '@/theme/darkTheme';

const ACCENT_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444',
  '#F97316', '#22C55E', '#14B8A6', '#06B6D4',
];

interface Props { visible: boolean; onClose: () => void; }

export const SettingsModal: React.FC<Props> = ({ visible, onClose }) => {
  const router = useRouter();
  const { user, updateUser, logout } = useAuthStore();
  const { accentColor, setAccentColor } = useThemeStore();
  const [name, setName] = useState(user?.name || '');
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [lang, setLang] = useState(i18n.language || 'bg');

  const initials = (user?.name || 'GO')
    .split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  const score = user?.reliability_score ?? 100;
  const scoreColor =
    score >= 90 ? theme.colors.accent.success :
    score >= 70 ? '#F59E0B' : theme.colors.accent.danger;

  const phoneMasked = user?.phone
    ? user.phone.length > 8 ? `${user.phone.slice(0, 4)}***${user.phone.slice(-4)}` : user.phone
    : '';

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await authApi.updateProfile({ name: name.trim(), nickname, email });
      await updateUser(updated);
      Alert.alert('Готово', 'Профилът е обновен');
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно запазване');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-restricted-globals
      const ok = typeof window !== 'undefined' ? window.confirm('Сигурен ли си, че искаш да излезеш?') : true;
      if (ok) doLogout();
      return;
    }
    Alert.alert('Изход', 'Сигурен ли си, че искаш да излезеш?', [
      { text: 'Откажи', style: 'cancel' },
      { text: 'Изход', style: 'destructive', onPress: doLogout },
    ]);
  };

  const doLogout = async () => {
    onClose();
    await logout();
    router.replace('/');
  };

  const switchLang = async (l: 'bg' | 'en') => {
    setLang(l);
    await i18n.changeLanguage(l);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Настройки</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} testID="settings-close">
            <Ionicons name="close" size={22} color={theme.colors.text.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Profile */}
          <View style={styles.profileTop}>
            <View style={[styles.avatar, { backgroundColor: accentColor }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={[styles.scoreBadge, { borderColor: scoreColor }]}>
              <Text style={[styles.scoreText, { color: scoreColor }]}>{score}% надеждност</Text>
            </View>
          </View>

          <Text style={styles.label}>Име</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} testID="settings-name" />

          <Text style={styles.label}>Прякор</Text>
          <TextInput
            value={nickname || ''}
            onChangeText={setNickname}
            style={styles.input}
            placeholder="Незадължително"
            placeholderTextColor={theme.colors.text.muted}
            testID="settings-nickname"
          />

          <Text style={styles.label}>Телефон</Text>
          <TextInput value={phoneMasked} editable={false} style={[styles.input, { opacity: 0.6 }]} testID="settings-phone" />

          <Text style={styles.label}>Имейл</Text>
          <TextInput
            value={email || ''}
            onChangeText={setEmail}
            style={styles.input}
            placeholder="email@example.com"
            placeholderTextColor={theme.colors.text.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            testID="settings-email"
          />

          <LoadingButton
            title="Запази профил"
            onPress={handleSave}
            loading={saving}
            style={{ marginTop: 16 }}
            testID="settings-save"
          />

          {/* Accent color */}
          <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Акцентен цвят</Text>
          <View style={styles.colorGrid}>
            {ACCENT_COLORS.map((c) => {
              const selected = c.toLowerCase() === accentColor.toLowerCase();
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => setAccentColor(c)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    selected && styles.colorDotSelected,
                  ]}
                  testID={`settings-color-${c}`}
                />
              );
            })}
          </View>

          {/* Language */}
          <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Език</Text>
          <View style={styles.langRow}>
            {(['bg', 'en'] as const).map((l) => (
              <TouchableOpacity
                key={l}
                onPress={() => switchLang(l)}
                style={[styles.langBtn, lang === l && { backgroundColor: accentColor }]}
                testID={`settings-lang-${l}`}
              >
                <Text style={[styles.langText, lang === l && { color: '#fff' }]}>
                  {l.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Links */}
          <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Други</Text>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => { onClose(); router.push('/terms'); }}
            testID="settings-terms"
          >
            <Text style={styles.linkText}>Условия за ползване</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.text.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => { onClose(); router.push('/privacy'); }}
            testID="settings-privacy"
          >
            <Text style={styles.linkText}>Политика за поверителност</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.text.muted} />
          </TouchableOpacity>

          {/* Logout — separated by ample space from color picker */}
          <View style={{ height: 60 }} />
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} testID="settings-logout">
            <Ionicons name="log-out-outline" size={18} color={theme.colors.accent.danger} />
            <Text style={styles.logoutText}>Изход</Text>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
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
  headerTitle: { color: theme.colors.text.primary, fontSize: 18, fontWeight: '700' },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.background.card,
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { padding: 20 },
  profileTop: { alignItems: 'center', marginBottom: 16 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '800' },
  scoreBadge: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1,
  },
  scoreText: { fontSize: 12, fontWeight: '700' },
  label: {
    color: theme.colors.text.secondary, fontSize: 12,
    fontWeight: '600', marginTop: 14, marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.background.input,
    color: theme.colors.text.primary,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, fontSize: 15,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  sectionTitle: {
    color: theme.colors.text.primary, fontSize: 14,
    fontWeight: '700', marginBottom: 12,
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorDot: { width: 44, height: 44, borderRadius: 22 },
  colorDotSelected: { borderWidth: 3, borderColor: '#fff' },
  langRow: { flexDirection: 'row', gap: 8 },
  langBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12,
    backgroundColor: theme.colors.background.input,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  langText: { color: theme.colors.text.primary, fontWeight: '700' },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border.primary,
  },
  linkText: { color: theme.colors.text.primary, fontSize: 14 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  logoutText: { color: theme.colors.accent.danger, fontWeight: '700', fontSize: 15 },
});
