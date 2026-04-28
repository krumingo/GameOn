import React from 'react';
import { View, TouchableOpacity, StyleSheet, ViewStyle, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/theme/darkTheme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
  padding?: number;
  testID?: string;
  /** Optional accent glow color (e.g. accent.primary, accent.success). When set adds a subtle shadow halo. */
  glow?: string;
}

const GRADIENT_COLORS = ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.015)'] as const;

export const GlassCard: React.FC<Props> = ({ children, style, onPress, padding = 16, testID, glow }) => {
  const flatStyle = StyleSheet.flatten(style) || {};
  const userBg = (flatStyle as any).backgroundColor;

  const containerStyle: any[] = [
    styles.card,
    { padding },
    style,
    glow && Platform.OS === 'web' ? { boxShadow: `0 0 22px ${glow}26, 0 4px 18px rgba(0,0,0,0.28)` } : null,
  ];
  if (Platform.OS === 'web') {
    (containerStyle.push as any)({ backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' });
  }

  const inner = (
    <>
      {!userBg && (
        <LinearGradient
          colors={GRADIENT_COLORS as unknown as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      {children}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={containerStyle} testID={testID}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={containerStyle} testID={testID}>{inner}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
