import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { billingApi } from '@/api/client';
import { GlassCard } from '@/components/GlassCard';
import { LoadingButton } from '@/components/LoadingButton';
import { theme } from '@/theme/darkTheme';

const POLL_MS = 2000;
const MAX_POLL_TIME = 30000;

export default function BillingSuccessScreen() {
  const params = useLocalSearchParams<{ session_id?: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'paid' | 'pending' | 'error'>('checking');
  const [errMsg, setErrMsg] = useState('');
  const startedAt = useRef<number>(Date.now());
  const timerRef = useRef<any>(null);

  const poll = async () => {
    if (!params.session_id) {
      setStatus('error');
      setErrMsg('Липсва session_id');
      return;
    }
    try {
      const res = await billingApi.getCheckoutStatus(params.session_id);
      if (res?.payment_status === 'paid' || res?.status === 'paid') {
        setStatus('paid');
        if (timerRef.current) clearTimeout(timerRef.current);
        return;
      }
      // Not yet paid — keep polling
      const elapsed = Date.now() - startedAt.current;
      if (elapsed >= MAX_POLL_TIME) {
        setStatus('pending');
        return;
      }
      timerRef.current = setTimeout(poll, POLL_MS);
    } catch (e: any) {
      setStatus('error');
      setErrMsg(e?.response?.data?.detail || 'Грешка при проверка');
    }
  };

  useEffect(() => {
    startedAt.current = Date.now();
    poll();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [params.session_id]);

  const retry = () => {
    setStatus('checking');
    setErrMsg('');
    startedAt.current = Date.now();
    poll();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-billing-success">
      <View style={styles.center}>
        <GlassCard padding={28} style={{ alignItems: 'center', maxWidth: 420, width: '100%' }}>
          {status === 'checking' && (
            <View style={{ alignItems: 'center' }} testID="billing-checking">
              <ActivityIndicator color={theme.colors.accent.primary} size="large" />
              <Text style={[styles.title, { marginTop: 16 }]}>Проверяваме плащането...</Text>
              <Text style={styles.muted}>Моля, изчакай момент.</Text>
            </View>
          )}

          {status === 'paid' && (
            <View style={{ alignItems: 'center' }} testID="billing-paid">
              <View style={styles.iconWrapSuccess}>
                <Ionicons name="checkmark-circle" size={48} color={theme.colors.accent.success} />
              </View>
              <Text style={styles.title}>PRO е активиран!</Text>
              <Text style={styles.muted}>Благодарим за доверието!</Text>
              <LoadingButton
                title="Към групата"
                onPress={() => router.replace('/(tabs)/my')}
                style={{ marginTop: 20, alignSelf: 'stretch' }}
                testID="billing-go-home"
              />
            </View>
          )}

          {status === 'pending' && (
            <View style={{ alignItems: 'center' }} testID="billing-pending">
              <View style={styles.iconWrapWarn}>
                <Ionicons name="hourglass" size={40} color={'#F59E0B'} />
              </View>
              <Text style={styles.title}>Плащането се обработва</Text>
              <Text style={styles.muted}>
                Провери по-късно или ни пиши на support@gameon.bg
              </Text>
              <LoadingButton
                title="Към профила"
                variant="outline"
                onPress={() => router.replace('/(tabs)/my')}
                style={{ marginTop: 20, alignSelf: 'stretch' }}
                testID="billing-back-pending"
              />
            </View>
          )}

          {status === 'error' && (
            <View style={{ alignItems: 'center' }} testID="billing-error">
              <View style={styles.iconWrapErr}>
                <Ionicons name="alert-circle" size={40} color={theme.colors.accent.danger} />
              </View>
              <Text style={styles.title}>Нещо се обърка</Text>
              <Text style={styles.muted}>{errMsg}</Text>
              <LoadingButton
                title="Опитай отново"
                onPress={retry}
                style={{ marginTop: 20, alignSelf: 'stretch' }}
                testID="billing-retry"
              />
              <LoadingButton
                title="Към профила"
                variant="outline"
                onPress={() => router.replace('/(tabs)/my')}
                style={{ marginTop: 8, alignSelf: 'stretch' }}
              />
            </View>
          )}
        </GlassCard>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  iconWrapSuccess: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: 'rgba(34,197,94,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  iconWrapWarn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  iconWrapErr: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(239,68,68,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { color: theme.colors.text.primary, fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  muted: { color: theme.colors.text.muted, fontSize: 13, textAlign: 'center' },
});
