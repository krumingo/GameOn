import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/theme/darkTheme';

export const SeasonBadge: React.FC<{ seasonName?: string; testID?: string }> = ({
  seasonName, testID,
}) => (
  <View style={styles.badge} testID={testID}>
    <Text style={styles.text}>
      {seasonName ? `Сезон: ${seasonName}` : 'All-time'}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.background.card,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  text: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: '600' },
});
