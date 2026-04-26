import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '@/components/GlassCard';
import { theme } from '@/theme/darkTheme';

export default function TermsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-terms">
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="terms-back">
          <Ionicons name="chevron-back" size={22} color={theme.colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.brand}>Условия за ползване</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={styles.updated}>Последна актуализация: 26.04.2026</Text>

        <Section title="1. Описание на услугата">
          <P>GameOn е платформа за организиране на любителски футболни мачове. Позволява ти да създаваш групи, мачове, да записваш играчи, да делиш отбори, да управляваш плащания и статистика.</P>
        </Section>

        <Section title="2. Планове">
          <Bullet><B>FREE</B> — създаване на 1 група, до 14 играчи на мач, базова статистика, безплатно участие в маркетплейс.</Bullet>
          <Bullet><B>PRO</B> (5.00 €/месец) — неограничен брой групи, до 30 играчи на мач, плащания, отбори с драфт, голове и резултати, каса, класации, сезони, маркетплейс с обяви, покани, експорт.</Bullet>
          <Bullet><B>TRIAL</B> — нови групи получават 14 дни безплатен PRO достъп.</Bullet>
        </Section>

        <Section title="3. Плащания и абонамент">
          <Bullet>PRO се таксува месечно през Stripe.</Bullet>
          <Bullet>Auto-renew по подразбиране — можеш да отмениш по всяко време.</Bullet>
          <Bullet>След отказ запазваш достъпа до края на периода.</Bullet>
          <Bullet>На iOS/Android може да важат правилата на App Store / Google Play за IAP.</Bullet>
          <Bullet>Без възстановяване на суми за частично използван период.</Bullet>
        </Section>

        <Section title="4. Поведение">
          <P>Забранено е:</P>
          <Bullet>Създаване на множество профили или фалшиви идентичности</Bullet>
          <Bullet>Спам, тормоз, дискриминация в чат и обяви</Bullet>
          <Bullet>Опит за байпасване на платените функции</Bullet>
          <Bullet>Използване на автоматизирани ботове</Bullet>
        </Section>

        <Section title="5. Отговорност">
          <P>GameOn е инструмент за организация. Не носим отговорност за:</P>
          <Bullet>Лични спорове между играчи или групи</Bullet>
          <Bullet>Кражба или повреда на терени, екипи и оборудване</Bullet>
          <Bullet>Травми по време на мачове</Bullet>
          <Bullet>Пропуснати ползи поради техническа неизправност</Bullet>
        </Section>

        <Section title="6. Прекратяване">
          <P>Можем да прекратим или замразим акаунти, които нарушават тези Условия, без предизвестие.</P>
        </Section>

        <Section title="7. Промени в Условията">
          <P>Запазваме си правото да актуализираме Условията. При съществени промени ще те уведомим в приложението.</P>
        </Section>

        <Section title="8. Контакт">
          <P>За въпроси относно Условията:</P>
          <Text style={styles.email}>support@gameon.bg</Text>
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
