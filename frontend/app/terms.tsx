import React from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { theme } from '@/theme/darkTheme';

export default function TermsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Условия за ползване</Text>
      <Text style={styles.text}>
        С използването на GameOn се съгласяваш да спазваш правилата за честна игра, да третираш с уважение
        останалите потребители и да не злоупотребяваш с функциите на платформата.
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
