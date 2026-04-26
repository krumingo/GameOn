import React from 'react';
import { View, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '@/theme/darkTheme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
  padding?: number;
  testID?: string;
}

export const GlassCard: React.FC<Props> = ({ children, style, onPress, padding = 16, testID }) => {
  const baseStyle = [styles.card, { padding }, style];
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={baseStyle} testID={testID}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={baseStyle} testID={testID}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.background.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
  },
});
