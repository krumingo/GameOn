import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { adminApi } from '@/api/client';
import { GlassCard } from '@/components/GlassCard';
import { LoadingButton } from '@/components/LoadingButton';
import { theme } from '@/theme/darkTheme';

export default function AdminLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Грешка', 'Попълни email и парола');
      return;
    }
    setBusy(true);
    try {
      const res = await adminApi.login(email.trim(), password);
      const token = res?.admin_token;
      if (!token) throw new Error('No token');
      await AsyncStorage.setItem('admin_token', token);
      router.replace('/admin/dashboard');
    } catch (e: any) {
      Alert.alert('Грешка', e?.response?.data?.detail || 'Грешна парола');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-admin-login">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.center}>
          <GlassCard padding={24} style={{ width: '100%', maxWidth: 420 }}>
            <View style={styles.iconWrap}>
              <Ionicons name="shield-checkmark" size={32} color={theme.colors.accent.gold} />
            </View>
            <Text style={styles.title}>Вход в администрация</Text>
            <Text style={styles.muted}>Достъп само за оторизирани администратори.</Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="admin@gameon.bg"
              placeholderTextColor={theme.colors.text.muted}
              style={styles.input}
              testID="admin-email"
            />

            <Text style={styles.label}>Парола</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                placeholder="••••••••"
                placeholderTextColor={theme.colors.text.muted}
                style={styles.input}
                testID="admin-password"
              />
              <TouchableOpacity
                onPress={() => setShowPw(!showPw)}
                style={styles.eyeBtn}
                testID="admin-toggle-pw"
              >
                <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={theme.colors.text.muted} />
              </TouchableOpacity>
            </View>

            <LoadingButton
              title="Вход"
              onPress={handleSubmit}
              loading={busy}
              style={{ marginTop: 20 }}
              testID="admin-submit"
            />

            <TouchableOpacity onPress={() => router.replace('/')} style={{ marginTop: 16, alignSelf: 'center' }}>
              <Text style={[styles.muted, { color: theme.colors.accent.primary }]}>← Към приложението</Text>
            </TouchableOpacity>
          </GlassCard>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,215,0,0.15)',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16,
  },
  title: { color: theme.colors.text.primary, fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  muted: { color: theme.colors.text.muted, fontSize: 13, textAlign: 'center' },
  label: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: theme.colors.background.input, color: theme.colors.text.primary,
    paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, fontSize: 15,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  eyeBtn: { position: 'absolute', right: 10, top: 12, padding: 6 },
});
