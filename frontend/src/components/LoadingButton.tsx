import React from 'react';
import {
  TouchableOpacity, Text, ActivityIndicator, StyleSheet,
  ViewStyle, Platform, GestureResponderEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '@/theme/darkTheme';

type Variant = 'primary' | 'outline' | 'danger';

interface Props {
  title: string;
  onPress: (e?: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
  style?: ViewStyle;
  testID?: string;
}

export const LoadingButton: React.FC<Props> = ({
  title, onPress, loading, disabled, variant = 'primary', style, testID,
}) => {
  const isDisabled = !!loading || !!disabled;

  const handlePress = (e: GestureResponderEvent) => {
    if (isDisabled) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress(e);
  };

  const buttonStyle = [
    styles.base,
    variant === 'primary' && styles.primary,
    variant === 'outline' && styles.outline,
    variant === 'danger' && styles.danger,
    isDisabled && { opacity: 0.5 },
    style,
  ];
  const textStyle = [
    styles.text,
    variant === 'outline' && { color: theme.colors.accent.primary },
  ];

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={buttonStyle}
      onPress={handlePress}
      disabled={isDisabled}
      testID={testID}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? theme.colors.accent.primary : '#fff'} />
      ) : (
        <Text style={textStyle}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center', justifyContent: 'center',
    minHeight: 48,
  },
  primary: { backgroundColor: theme.colors.accent.primary },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: theme.colors.accent.primary,
  },
  danger: { backgroundColor: theme.colors.accent.danger },
  text: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
