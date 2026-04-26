/**
 * IAP service (placeholder for future Apple/Google In-App Purchases).
 *
 * For MVP all platforms route through Stripe checkout via the backend.
 * On native we still hit the Stripe URL inside an in-app browser since
 * App Store will reject digital goods that bypass IAP — switch to real
 * IAP via expo-in-app-purchases / react-native-iap before submission.
 */
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { billingApi } from '@/api/client';

// Product IDs that will need to be created in App Store Connect / Play Console
export const PRO_MONTHLY_IOS = 'com.gameon.pro.monthly';
export const PRO_MONTHLY_ANDROID = 'gameon_pro_monthly';

export const getProductId = () =>
  Platform.OS === 'ios' ? PRO_MONTHLY_IOS : PRO_MONTHLY_ANDROID;

export interface PurchaseResult {
  method: 'stripe' | 'iap';
  url?: string | null;
  error?: string;
}

export async function startPurchase(groupId: string, originUrl?: string): Promise<PurchaseResult> {
  const fallbackOrigin =
    Platform.OS === 'web'
      ? (typeof window !== 'undefined' ? window.location.origin : '')
      : 'gameon://billing/success';
  const origin = originUrl || fallbackOrigin;
  try {
    const res = await billingApi.createCheckout(groupId, origin);
    const url = res?.checkout_url || null;
    if (url) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(url, '_blank');
      } else {
        try { await Linking.openURL(url); } catch {}
      }
    }
    return { method: 'stripe', url };
  } catch (e: any) {
    return { method: 'stripe', error: e?.response?.data?.detail || 'Грешка при стартиране на плащането' };
  }
}

// Future: when switching to real IAP, validate receipts via this helper.
export async function validateReceipt(receipt: string, platform: 'ios' | 'android', groupId: string) {
  return billingApi.validateIapReceipt({ receipt_data: receipt, platform, group_id: groupId });
}
