// Push notifications setup. Web-safe: silently no-ops on web/unsupported.
import { Platform } from 'react-native';
import { pushApi } from '@/api/client';

let configured = false;

export async function setupAndroidChannels() {
  if (Platform.OS !== 'android') return;
  try {
    const Notifications = await import('expo-notifications');
    const importance = (Notifications as any).AndroidImportance;
    await Notifications.setNotificationChannelAsync('matches', {
      name: 'Мачове',
      importance: importance?.HIGH ?? 4,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('chat', {
      name: 'Чат',
      importance: importance?.DEFAULT ?? 3,
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('system', {
      name: 'Система',
      importance: importance?.HIGH ?? 4,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  } catch {}
}

export async function configureForegroundHandler() {
  if (configured) return;
  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      } as any),
    });
    configured = true;
  } catch {}
}

export async function registerForPushAsync(): Promise<string | null> {
  // Web does not support Expo push tokens
  if (Platform.OS === 'web') return null;
  try {
    const Notifications = await import('expo-notifications');
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const r = await Notifications.requestPermissionsAsync();
      status = r.status;
    }
    if (status !== 'granted') return null;
    let projectId: string | undefined;
    try {
      const Constants = (await import('expo-constants')).default as any;
      projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.easConfig?.projectId ||
        Constants?.manifest?.extra?.eas?.projectId;
    } catch {}
    const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined as any);
    const token = tokenData?.data;
    if (!token) return null;
    try {
      await pushApi.registerToken(token);
    } catch {
      // ignore — preference will be retried on next login
    }
    return token;
  } catch {
    return null;
  }
}

export type PushDataPayload = {
  type?: 'match' | 'invitation' | 'listing' | 'test';
  group_id?: string;
  match_id?: string;
};

export function getDeepLinkFromData(data: PushDataPayload): string | null {
  if (!data || !data.type) return null;
  if (data.type === 'match' && data.match_id) return `/room/${data.match_id}`;
  if (data.type === 'invitation') return '/notifications';
  if (data.type === 'listing') return '/(tabs)/discover';
  return null;
}
