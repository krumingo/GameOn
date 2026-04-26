import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/theme/darkTheme';

export const Placeholder: React.FC<{ title: string; subtitle?: string; testID?: string }> = ({
  title, subtitle, testID,
}) => (
  <View style={styles.container} data-testid={testID || 'placeholder-screen'}>
    <Text style={styles.title}>{title}</Text>
    {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: theme.colors.background.primary,
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  title: {
    color: theme.colors.text.primary, fontSize: 22,
    fontWeight: '700', marginBottom: 6,
  },
  subtitle: { color: theme.colors.text.muted, fontSize: 14, textAlign: 'center' },
});
