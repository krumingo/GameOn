import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Modal, View, TouchableOpacity, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PaywallOverlay } from '@/components/PaywallOverlay';
import { theme } from '@/theme/darkTheme';
import { events } from '@/utils/events';
import { injectWebAnimations } from '@/utils/webAnimations';
import {
  setupAndroidChannels,
  configureForegroundHandler,
  registerForPushAsync,
  getDeepLinkFromData,
} from '@/utils/push';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => { checkAuth(); }, []);

  useEffect(() => {
    if (isLoading) return;
    const inAdminGroup = segments[0] === 'admin';
    const inAuthGroup = segments[0] === '(tabs)' || segments[0] === 'room' ||
                        segments[0] === 'cash' || segments[0] === 'notifications' ||
                        segments[0] === 'search-player' ||
                        segments[0] === 'billing';
    if (inAdminGroup) return;
    if (!isAuthenticated && inAuthGroup) {
      router.replace('/');
    } else if (isAuthenticated && segments.length === 0) {
      router.replace('/(tabs)/my');
    }
  }, [isAuthenticated, isLoading, segments]);

  return <>{children}</>;
}

function GlobalPaywall() {
  const [data, setData] = useState<{ groupId: string; feature: string } | null>(null);
  useEffect(() => {
    const handler = (p: any) => setData(p || null);
    events.on('showPaywall', handler);
    return () => events.off('showPaywall', handler);
  }, []);
  if (!data) return null;
  return (
    <Modal visible animationType="fade" transparent onRequestClose={() => setData(null)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 16, paddingTop: Platform.OS === 'ios' ? 56 : 32 }}>
          <TouchableOpacity
            onPress={() => setData(null)}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}
            testID="global-paywall-close"
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <PaywallOverlay
          feature={data.feature}
          groupId={data.groupId}
          plan="FREE"
        />
      </View>
    </Modal>
  );
}

function PushSetup() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();

  useEffect(() => {
    setupAndroidChannels();
    configureForegroundHandler();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    registerForPushAsync().catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    let receivedSub: any;
    let responseSub: any;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        receivedSub = Notifications.addNotificationReceivedListener(() => {});
        responseSub = Notifications.addNotificationResponseReceivedListener((response: any) => {
          try {
            const data = response?.notification?.request?.content?.data || {};
            const link = getDeepLinkFromData(data);
            if (link) router.push(link as any);
          } catch {}
        });
      } catch {}
    })();
    return () => {
      try { receivedSub?.remove?.(); } catch {}
      try { responseSub?.remove?.(); } catch {}
    };
  }, [router]);

  return null;
}

export default function RootLayout() {
  const loadPrefs = useThemeStore((s) => s.loadPrefs);
  useEffect(() => { loadPrefs(); injectWebAnimations(); }, []);

  const rootBg: any = Platform.OS === 'web'
    ? {
        background:
          `radial-gradient(1200px 600px at 80% -10%, rgba(59,130,246,0.08), transparent 60%),
           radial-gradient(900px 500px at 0% 100%, rgba(139,92,246,0.06), transparent 60%),
           linear-gradient(180deg, ${theme.colors.background.primary} 0%, #0B1018 100%)`,
        minHeight: '100vh',
      }
    : { backgroundColor: theme.colors.background.primary };

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={[{ flex: 1 }, rootBg]}>
        <SafeAreaProvider>
          <View style={[{ flex: 1 }, rootBg]}>
            <OfflineBanner />
            <StatusBar style="light" />
            <AuthGuard>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background.primary } }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="room/[id]" />
                <Stack.Screen name="cash" />
                <Stack.Screen name="notifications" />
                <Stack.Screen name="search-player" />
                <Stack.Screen name="billing/success" />
                <Stack.Screen name="privacy" />
                <Stack.Screen name="terms" />
                <Stack.Screen name="admin/login" />
                <Stack.Screen name="admin/dashboard" />
                <Stack.Screen name="admin/groups" />
                <Stack.Screen name="admin/users" />
              </Stack>
            </AuthGuard>
            <PushSetup />
            <GlobalPaywall />
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
