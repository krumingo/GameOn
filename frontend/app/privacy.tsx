import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '@/components/GlassCard';
import { theme } from '@/theme/darkTheme';

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-privacy">
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="privacy-back">
          <Ionicons name="chevron-back" size={22} color={theme.colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.brand}>Политика за поверителност</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={styles.updated}>Последна актуализация: 26.04.2026</Text>

        <Section title="1. Какви данни събираме">
          <P>Когато използваш GameOn, ние събираме само минималните данни, необходими за работата на услугата:</P>
          <Bullet>Телефонен номер (за вход чрез OTP)</Bullet>
          <Bullet>Име и (опционално) псевдоним и email</Bullet>
          <Bullet>Push токен (Expo) за нотификации, ако ги активираш</Bullet>
          <Bullet>Геолокация (само ако предоставиш достъп — за намиране на близки мачове)</Bullet>
          <Bullet>Информация за участието в мачове, голове, плащания и баланси</Bullet>
        </Section>

        <Section title="2. Цел на обработката">
          <Bullet>Автентикация и поддържане на сесия</Bullet>
          <Bullet>Изпращане на push нотификации (мачове, RSVP, чат)</Bullet>
          <Bullet>Статистика и класации в групи</Bullet>
          <Bullet>Обработка на PRO плащания (Stripe)</Bullet>
          <Bullet>Контакт с поддръжката</Bullet>
        </Section>

        <Section title="3. Трети страни">
          <P>Споделяме минимални данни с доверени партньори:</P>
          <Bullet><B>Twilio</B> — изпращане на SMS с OTP кодове</Bullet>
          <Bullet><B>Stripe</B> — обработка на плащания (PRO абонамент)</Bullet>
          <Bullet><B>Expo Push Service</B> — доставка на нотификации</Bullet>
          <Bullet><B>MongoDB Atlas</B> — съхранение на данните</Bullet>
        </Section>

        <Section title="4. Твоите права (GDPR)">
          <Bullet>Право на достъп — можеш да поискаш копие от данните си</Bullet>
          <Bullet>Право на корекция — редактирай профила си в настройките</Bullet>
          <Bullet>Право на изтриване — пиши на privacy@gameon.bg</Bullet>
          <Bullet>Право на преносимост — експорт на касовите ти данни</Bullet>
        </Section>

        <Section title="5. Деца">
          <P>GameOn не е предназначен за лица под 16 години. Не събираме съзнателно данни от деца.</P>
        </Section>

        <Section title="6. Сигурност">
          <P>Използваме индустриални практики за сигурност: TLS криптиране на трафика, JWT токени с кратък живот, hashing на чувствителна информация.</P>
        </Section>

        <Section title="7. Контакт">
          <P>За въпроси относно данните и поверителността пиши на:</P>
          <Text style={styles.email}>privacy@gameon.bg</Text>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <GlassCard style={{ marginTop: 12 }}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </GlassCard>
);

const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={styles.paragraph}>{children}</Text>
);

const Bullet: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.bulletRow}>
    <Text style={styles.bulletDot}>•</Text>
    <Text style={styles.bulletText}>{children}</Text>
  </View>
);

const B: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={{ fontWeight: '700', color: theme.colors.text.primary }}>{children}</Text>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  brand: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.background.card,
    alignItems: 'center', justifyContent: 'center',
  },
  updated: { color: theme.colors.text.muted, fontSize: 11, fontStyle: 'italic' },
  sectionTitle: { color: theme.colors.text.primary, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  paragraph: { color: theme.colors.text.secondary, fontSize: 13, lineHeight: 20, marginBottom: 6 },
  bulletRow: { flexDirection: 'row', gap: 8, marginVertical: 3 },
  bulletDot: { color: theme.colors.accent.primary, fontSize: 14, lineHeight: 18 },
  bulletText: { color: theme.colors.text.secondary, fontSize: 13, lineHeight: 20, flex: 1 },
  email: { color: theme.colors.accent.primary, fontSize: 14, fontWeight: '700', marginTop: 4 },
});
