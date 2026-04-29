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
  /** Optional accent glow color (hex or rgb) — adds a subtle outer halo. */
  glow?: string;
  /** Show stronger active border (e.g. selected/going state). */
  active?: boolean;
  /** Activation accent color when `active` is true (default = primary). */
  activeColor?: string;
}

const GRADIENT_COLORS = ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)'] as const;

const webShadow = (extra?: string) =>
  ({
    boxShadow: [
      '0 4px 20px rgba(0,0,0,0.45)',
      'inset 0 1px 0 rgba(255,255,255,0.06)',
      extra,
    ].filter(Boolean).join(', '),
    backdropFilter: 'blur(16px) saturate(140%)',
    WebkitBackdropFilter: 'blur(16px) saturate(140%)',
  } as any);

export const GlassCard: React.FC<Props> = ({
  children, style, onPress, padding = 16, testID, glow, active, activeColor,
}) => {
  const flatStyle = StyleSheet.flatten(style) || {};
  const userBg = (flatStyle as any).backgroundColor;
  const accent = activeColor || theme.colors.accent.primary;

  const containerStyle: any[] = [
    styles.card,
    { padding },
    active && [styles.cardActive, { borderColor: `${accent}55` }],
    Platform.OS === 'web' && webShadow(
      glow
        ? `0 0 24px ${glow}33`
        : active
          ? `0 0 18px ${accent}22`
          : undefined,
    ),
    Platform.OS !== 'web' && glow && {
      shadowColor: glow,
      shadowOpacity: 0.35,
      shadowRadius: 18,
    },
    style,
  ];

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
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    // Native shadow (iOS / Android elevation)
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardActive: {
    borderWidth: 1,
  },
});
