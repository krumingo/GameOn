import React, { useState } from 'react';
import { View, Text, StyleSheet, Linking, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { LoadingButton } from './LoadingButton';
import { billingApi } from '@/api/client';
import { theme } from '@/theme/darkTheme';

interface Props {
  feature: string;
  groupId: string;
  plan: string;
  trialDaysLeft?: number | null;
  graceUntil?: string | null;
}

export const PaywallOverlay: React.FC<Props> = ({
  feature, groupId, plan, trialDaysLeft, graceUntil,
}) => {
  const [busy, setBusy] = useState(false);
  const handleCheckout = async () => {
    setBusy(true);
    try {
      const origin = Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : 'https://gameon.app';
      const res = await billingApi.createCheckout(groupId, origin);
      if (res?.checkout_url) {
        Linking.openURL(res.checkout_url);
      } else {
        Alert.alert('Грешка', 'Checkout не е наличен');
      }
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Неуспешно отваряне на checkout');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.overlay} testID="paywall-overlay">
      <GlassCard style={styles.card} padding={24}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={32} color={theme.colors.accent.gold} />
        </View>
        <Text style={styles.title}>{feature} е PRO функция</Text>
        {plan === 'TRIAL' && trialDaysLeft != null && (
          <Text style={[styles.sub, { color: theme.colors.accent.success }]}>
            PRO trial: остават {trialDaysLeft} дни
          </Text>
        )}
        {plan === 'GRACE' && (
          <Text style={[styles.sub, { color: '#F59E0B' }]}>
            Абонаментът изтича!
          </Text>
        )}
        {plan === 'FREE' && (
          <Text style={styles.sub}>Активирай PRO за достъп до тази функция.</Text>
        )}
        <LoadingButton
          title="Активирай PRO — 5.00 €/мес"
          onPress={handleCheckout}
          loading={busy}
          style={{ marginTop: 16, alignSelf: 'stretch' }}
          testID="paywall-activate"
        />
      </GlassCard>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: { alignItems: 'center', maxWidth: 420, width: '100%' },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,215,0,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: {
    color: theme.colors.text.primary, fontSize: 18,
    fontWeight: '700', textAlign: 'center', marginBottom: 8,
  },
  sub: { color: theme.colors.text.secondary, fontSize: 13, textAlign: 'center' },
});
