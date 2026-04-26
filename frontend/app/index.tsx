import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { LoadingButton } from '@/components/LoadingButton';
import { theme } from '@/theme/darkTheme';

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const { login } = useAuthStore();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+359');
  const [groupCode, setGroupCode] = useState('');
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [devMode, setDevMode] = useState(false);
  const otpRefs = useRef<Array<TextInput | null>>([]);

  // Pre-fill entry code from deep link (?code=SPORT26 or initial URL gameon://join?code=...)
  useEffect(() => {
    if (params.code) {
      setGroupCode(String(params.code).toUpperCase());
      return;
    }
    (async () => {
      try {
        const url = await Linking.getInitialURL();
        if (!url) return;
        const parsed = Linking.parse(url);
        const code = (parsed.queryParams as any)?.code;
        if (code) setGroupCode(String(code).toUpperCase());
      } catch {}
    })();
  }, [params.code]);

  // Resend countdown
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const validatePhone = (p: string) => /^\+\d{10,15}$/.test(p);

  const handleStart = async () => {
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('auth.errorName'));
      return;
    }
    if (!validatePhone(phone)) {
      Alert.alert(t('common.error'), t('auth.errorPhone'));
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.start(phone);
      setDevMode(!!res.dev_mode);
      setStep('otp');
      setResendIn(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 200);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.response?.data?.detail || 'Грешка');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    try {
      await authApi.start(phone);
      setResendIn(60);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.response?.data?.detail || 'Грешка');
    }
  };

  const handleOtpChange = (idx: number, value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[idx] = cleaned;
    setOtp(next);
    if (cleaned && idx < 5) {
      otpRefs.current[idx + 1]?.focus();
    }
    // Auto-submit when complete
    const code = next.join('');
    if (code.length === 6 && next.every((c) => c)) {
      handleVerify(code);
    }
  };

  const handleOtpKey = (idx: number, e: any) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handleVerify = async (code?: string) => {
    const otpCode = code || otp.join('');
    if (otpCode.length !== 6) return;
    setLoading(true);
    try {
      if (groupCode.trim()) {
        // Use /auth/join → creates user (if needed) and adds membership
        const res = await authApi.join(name, phone, groupCode.trim().toUpperCase(), otpCode);
        await login(res.token, res.user);
        router.replace('/(tabs)/my');
        return;
      }
      const v = await authApi.verify(phone, otpCode);
      if (v.user_exists) {
        await login(v.token, v.user);
        router.replace('/(tabs)/my');
      } else {
        // No group code & user doesn't exist → cannot create user without entry_code in current backend.
        Alert.alert(
          'Нужен е код на група',
          'Моля въведете код на група. Можеш да си направиш собствена след вход.'
        );
        setStep('form');
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      Alert.alert(t('common.error'), typeof detail === 'string' ? detail : t('auth.errorOtp'));
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleSuperTest = async () => {
    setLoading(true);
    try {
      const res = await authApi.superTestLogin();
      await login(res.token, res.user);
      router.replace('/(tabs)/my');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.response?.data?.detail || 'Грешка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandWrap}>
          <Text style={styles.title} testID="login-title">{t('auth.title')}</Text>
          <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
        </View>

        {step === 'form' && (
          <View style={styles.formWrap}>
            <Text style={styles.label}>{t('auth.name')}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Иван Иванов"
              placeholderTextColor={theme.colors.text.muted}
              style={styles.input}
              autoCapitalize="words"
              testID="login-name-input"
            />

            <Text style={styles.label}>{t('auth.phone')}</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+359888123456"
              placeholderTextColor={theme.colors.text.muted}
              style={styles.input}
              keyboardType="phone-pad"
              testID="login-phone-input"
            />

            <Text style={styles.label}>{t('auth.groupCode')}</Text>
            <TextInput
              value={groupCode}
              onChangeText={(v) => setGroupCode(v.toUpperCase())}
              placeholder="SPORT26"
              placeholderTextColor={theme.colors.text.muted}
              style={styles.input}
              autoCapitalize="characters"
              testID="login-group-code-input"
            />

            <LoadingButton
              title={t('auth.continue')}
              onPress={handleStart}
              loading={loading}
              testID="login-continue-button"
              style={{ marginTop: 24 }}
            />

            <LoadingButton
              title={t('auth.skipLogin')}
              onPress={handleSuperTest}
              variant="outline"
              testID="login-super-test-button"
              style={{ marginTop: 12 }}
            />
          </View>
        )}

        {step === 'otp' && (
          <View style={styles.formWrap}>
            <Text style={styles.otpTitle} testID="login-otp-title">{t('auth.otpTitle')}</Text>
            <Text style={styles.otpSent}>
              {t('auth.otpSent')} {phone}
            </Text>

            <View style={styles.otpRow}>
              {otp.map((v, idx) => (
                <TextInput
                  key={idx}
                  ref={(r) => { otpRefs.current[idx] = r; }}
                  value={v}
                  onChangeText={(val) => handleOtpChange(idx, val)}
                  onKeyPress={(e) => handleOtpKey(idx, e)}
                  style={styles.otpInput}
                  keyboardType="number-pad"
                  maxLength={1}
                  testID={`login-otp-${idx}`}
                  textAlign="center"
                />
              ))}
            </View>

            {(devMode || isDev) && (
              <View style={styles.devBanner} testID="login-dev-banner">
                <Text style={styles.devText}>{t('auth.devMode')}</Text>
              </View>
            )}

            <LoadingButton
              title={t('auth.continue')}
              onPress={() => handleVerify()}
              loading={loading}
              disabled={otp.some((c) => !c)}
              testID="login-verify-button"
              style={{ marginTop: 16 }}
            />

            <TouchableOpacity
              onPress={handleResend}
              disabled={resendIn > 0}
              testID="login-resend-button"
              style={{ marginTop: 16, alignSelf: 'center' }}
            >
              <Text style={[styles.linkText, resendIn > 0 && { opacity: 0.4 }]}>
                {resendIn > 0
                  ? t('auth.resendIn', { seconds: resendIn })
                  : t('auth.resend')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setStep('form')}
              style={{ marginTop: 8, alignSelf: 'center' }}
              testID="login-back-button"
            >
              <Text style={[styles.linkText, { color: theme.colors.text.muted }]}>
                ← Назад
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.termsWrap}>
          <Text style={styles.terms}>
            {t('auth.terms')}{' '}
            <Text style={styles.link} onPress={() => router.push('/terms')}>
              {t('auth.termsLink')}
            </Text>{' '}
            {t('auth.and')}{' '}
            <Text style={styles.link} onPress={() => router.push('/privacy')}>
              {t('auth.privacyLink')}
            </Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  scroll: { padding: 24, paddingTop: 80, paddingBottom: 40, minHeight: '100%' },
  brandWrap: { alignItems: 'center', marginBottom: 48 },
  title: {
    fontSize: 36, fontWeight: '800', color: theme.colors.text.primary,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 14, color: theme.colors.text.secondary,
    marginTop: 8, textAlign: 'center',
  },
  formWrap: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  label: {
    color: theme.colors.text.secondary, fontSize: 13,
    marginBottom: 6, marginTop: 14, fontWeight: '600',
  },
  input: {
    backgroundColor: theme.colors.background.input,
    color: theme.colors.text.primary,
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1, borderColor: theme.colors.border.primary,
    fontSize: 16,
  },
  otpTitle: {
    fontSize: 22, fontWeight: '700',
    color: theme.colors.text.primary,
    textAlign: 'center', marginBottom: 8,
  },
  otpSent: {
    fontSize: 14, color: theme.colors.text.secondary,
    textAlign: 'center', marginBottom: 24,
  },
  otpRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    gap: 8, marginBottom: 16,
  },
  otpInput: {
    flex: 1, height: 56,
    backgroundColor: theme.colors.background.input,
    color: theme.colors.text.primary,
    borderRadius: theme.borderRadius.md,
    fontSize: 22, fontWeight: '700',
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  devBanner: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderColor: 'rgba(245,158,11,0.4)',
    borderWidth: 1, borderRadius: theme.borderRadius.md,
    padding: 12, marginTop: 8,
  },
  devText: { color: '#FBBF24', textAlign: 'center', fontSize: 13 },
  linkText: { color: theme.colors.accent.primary, fontSize: 14, fontWeight: '600' },
  termsWrap: { marginTop: 32, alignItems: 'center' },
  terms: {
    color: theme.colors.text.muted, fontSize: 12, textAlign: 'center',
    lineHeight: 18,
  },
  link: { color: theme.colors.accent.primary, textDecorationLine: 'underline' },
});
