import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, Platform } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { SettingsModal } from '@/components/SettingsModal';
import { theme } from '@/theme/darkTheme';
import { useTranslation } from 'react-i18next';

function HeaderBar({ onAvatarPress }: { onAvatarPress: () => void }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const initials = (user?.name || 'GO')
    .split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  const accentColor = useThemeStore((s) => s.accentColor);

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.colors.background.primary }}>
      <View style={styles.header} testID="app-header">
        <Text style={styles.brand}>GameOn</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.push('/notifications')}
            testID="header-bell"
          >
            <Ionicons name="notifications-outline" size={22} color={theme.colors.text.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.avatar, { backgroundColor: accentColor }]}
            onPress={onAvatarPress}
            testID="header-avatar"
          >
            <Text style={styles.avatarText}>{initials}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function FabSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View style={styles.sheet} testID="fab-sheet">
          <TouchableOpacity
            style={styles.sheetItem}
            onPress={() => { onClose(); router.push('/room/new'); }}
            testID="fab-new-match"
          >
            <Ionicons name="football-outline" size={22} color={theme.colors.accent.primary} />
            <Text style={styles.sheetItemText}>{t('common.newMatch')}</Text>
          </TouchableOpacity>
          <View style={styles.sheetDivider} />
          <TouchableOpacity
            style={styles.sheetItem}
            onPress={() => { onClose(); router.push('/(tabs)/my?action=newGroup'); }}
            testID="fab-new-group"
          >
            <Ionicons name="people-outline" size={22} color={theme.colors.accent.primary} />
            <Text style={styles.sheetItemText}>{t('common.newGroup')}</Text>
          </TouchableOpacity>
          <View style={styles.sheetDivider} />
          <TouchableOpacity
            style={styles.sheetItem}
            onPress={() => { onClose(); router.push('/(tabs)/my?action=joinGroup'); }}
            testID="fab-join-group"
          >
            <Ionicons name="enter-outline" size={22} color={theme.colors.accent.primary} />
            <Text style={styles.sheetItemText}>{t('common.joinGroup')}</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const accentColor = useThemeStore((s) => s.accentColor);
  const [fabOpen, setFabOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background.primary }}>
      <HeaderBar onAvatarPress={() => setSettingsOpen(true)} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.colors.background.secondary,
            borderTopColor: theme.colors.border.primary,
            borderTopWidth: 1,
            height: Platform.OS === 'ios' ? 84 : 64,
            paddingBottom: Platform.OS === 'ios' ? 28 : 8,
            paddingTop: 8,
          },
          tabBarActiveTintColor: accentColor,
          tabBarInactiveTintColor: theme.colors.text.muted,
          sceneStyle: { backgroundColor: theme.colors.background.primary },
        }}
      >
        <Tabs.Screen
          name="my"
          options={{
            title: t('tabs.profile'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" color={color} size={size} />
            ),
            tabBarTestID: 'tab-my',
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: t('tabs.discover'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="compass-outline" color={color} size={size} />
            ),
            tabBarTestID: 'tab-discover',
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: t('tabs.stats'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="bar-chart-outline" color={color} size={size} />
            ),
            tabBarTestID: 'tab-stats',
          }}
        />
      </Tabs>

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: accentColor }]}
        onPress={() => setFabOpen(true)}
        testID="fab-button"
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <FabSheet visible={fabOpen} onClose={() => setFabOpen(false)} />
      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: theme.colors.background.primary,
  },
  brand: { color: theme.colors.text.primary, fontSize: 22, fontWeight: '800' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: theme.colors.background.card,
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: theme.colors.accent.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: Platform.OS === 'ios' ? 100 : 80,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.background.secondary,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: 1, borderColor: theme.colors.border.primary,
  },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 16, paddingHorizontal: 8,
  },
  sheetItemText: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '600' },
  sheetDivider: { height: 1, backgroundColor: theme.colors.border.primary },
});
