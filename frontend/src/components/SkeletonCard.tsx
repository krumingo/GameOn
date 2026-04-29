import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { webAnim } from '@/utils/webAnimations';
import { theme } from '@/theme/darkTheme';

interface Props {
  count?: number;
  style?: ViewStyle;
}

const SkeletonRow: React.FC<{ index: number }> = ({ index }) => {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[styles.card, animatedStyle, { marginTop: index === 0 ? 0 : 12 }]}
      {...webAnim('pulse')}
      testID={`skeleton-${index}`}
    >
      <View style={[styles.line, { width: '70%', height: 14 }]} />
      <View style={[styles.line, { width: '40%', height: 11, marginTop: 8 }]} />
      <View style={[styles.line, { width: '85%', height: 10, marginTop: 14 }]} />
      <View style={[styles.line, { width: '55%', height: 10, marginTop: 6 }]} />
    </Animated.View>
  );
};

export const SkeletonCard: React.FC<Props> = ({ count = 3, style }) => (
  <View style={style} testID="skeleton-loader">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonRow key={i} index={i} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  line: {
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
