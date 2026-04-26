import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';
import { theme } from '@/theme/darkTheme';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => { checkAuth(); }, []);

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === '(tabs)' || segments[0] === 'room' ||
                        segments[0] === 'cash' || segments[0] === 'notifications' ||
                        segments[0] === 'search-player' || segments[0] === 'admin' ||
                        segments[0] === 'billing';
    if (!isAuthenticated && inAuthGroup) {
      router.replace('/');
    } else if (isAuthenticated && segments.length === 0) {
      router.replace('/(tabs)/my');
    }
  }, [isAuthenticated, isLoading, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  const loadPrefs = useThemeStore((s) => s.loadPrefs);
  useEffect(() => { loadPrefs(); }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background.primary }}>
        <SafeAreaProvider>
          <View style={{ flex: 1, backgroundColor: theme.colors.background.primary }}>
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
              </Stack>
            </AuthGuard>
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
