import React from 'react';
import {
  TouchableOpacity, Text, ActivityIndicator, StyleSheet,
  ViewStyle, Platform, GestureResponderEvent, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { theme } from '@/theme/darkTheme';

type Variant = 'primary' | 'outline' | 'danger' | 'success';

interface Props {
  title: string;
  onPress: (e?: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
  style?: ViewStyle;
  testID?: string;
}

const GRADIENTS: Record<Variant, readonly [string, string]> = {
  primary: ['#3B82F6', '#2563EB'],
  success: ['#22C55E', '#16A34A'],
  danger: ['#EF4444', '#DC2626'],
  outline: ['transparent', 'transparent'],
};

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

  const isOutline = variant === 'outline';
  const textStyle = [
    styles.text,
    isOutline && { color: theme.colors.accent.primary },
  ];

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      disabled={isDisabled}
      testID={testID}
      style={[styles.touch, isDisabled && { opacity: 0.5 }, style]}
    >
      <View style={[styles.base, isOutline && styles.outline]}>
        {!isOutline && (
          <LinearGradient
            colors={GRADIENTS[variant]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {loading ? (
          <ActivityIndicator color={isOutline ? theme.colors.accent.primary : '#fff'} />
        ) : (
          <Text style={textStyle}>{title}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touch: { borderRadius: theme.borderRadius.md, overflow: 'hidden' },
  base: {
    paddingVertical: 14, paddingHorizontal: 20,
    alignItems: 'center', justifyContent: 'center',
    minHeight: 48, borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: theme.colors.accent.primary,
  },
  text: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
});
