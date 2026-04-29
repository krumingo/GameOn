import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

interface Props {
  name?: string;
  size?: number;
  imageUrl?: string;
  /** override generated background color */
  color?: string;
  /** show small status dot bottom-right (e.g. green for online) */
  statusColor?: string;
  testID?: string;
}

const PALETTE = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444',
  '#F97316', '#22C55E', '#14B8A6', '#06B6D4',
];

function colorFromName(name: string): string {
  if (!name) return PALETTE[0];
  const code = name.charCodeAt(0) || 0;
  return PALETTE[code % PALETTE.length];
}

function initialsOf(name: string): string {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export const Avatar: React.FC<Props> = ({
  name = '?', size = 36, imageUrl, color, statusColor, testID,
}) => {
  const bg = color || colorFromName(name);
  const fontSize = Math.round(size * 0.4);
  const borderRadius = size / 2;

  if (imageUrl) {
    return (
      <View style={{ width: size, height: size }} testID={testID}>
        <Image
          source={{ uri: imageUrl }}
          style={[styles.image, { width: size, height: size, borderRadius }]}
        />
        {statusColor ? <View style={[styles.dot, { backgroundColor: statusColor, borderRadius: 6, width: 10, height: 10 }]} /> : null}
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { width: size, height: size, borderRadius, backgroundColor: bg }]}
      testID={testID}
    >
      <Text style={[styles.initials, { fontSize, lineHeight: fontSize * 1.1 }]} numberOfLines={1}>
        {initialsOf(name)}
      </Text>
      {statusColor ? <View style={[styles.dot, { backgroundColor: statusColor }]} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  image: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  initials: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
    includeFontPadding: false as any,
  },
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#0A0E14',
  },
});

/**
 * Stack of small overlapping avatars; show first N + "+M" badge.
 */
export const AvatarStack: React.FC<{
  names: string[];
  size?: number;
  max?: number;
  testID?: string;
}> = ({ names, size = 22, max = 5, testID }) => {
  const shown = names.slice(0, max);
  const overflow = Math.max(0, names.length - max);
  return (
    <View style={{ flexDirection: 'row' }} testID={testID}>
      {shown.map((n, i) => (
        <View key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.32 }}>
          <Avatar name={n} size={size} />
        </View>
      ))}
      {overflow > 0 && (
        <View
          style={{
            marginLeft: -size * 0.32,
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: 'rgba(255,255,255,0.12)',
            borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: Math.round(size * 0.38) }}>
            +{overflow}
          </Text>
        </View>
      )}
    </View>
  );
};
