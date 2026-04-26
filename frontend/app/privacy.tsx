import React from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { theme } from '@/theme/darkTheme';

export default function PrivacyScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Политика за поверителност</Text>
      <Text style={styles.text}>
        GameOn събира минимални данни нужни за функционирането на приложението: име, телефон, локация (по избор).
        Данните не се споделят с трети страни. Можеш да поискаш изтриване по всяко време от настройките.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  content: { padding: 24, paddingTop: 60 },
  title: { color: theme.colors.text.primary, fontSize: 22, fontWeight: '700', marginBottom: 12 },
  text: { color: theme.colors.text.secondary, fontSize: 14, lineHeight: 22 },
});
