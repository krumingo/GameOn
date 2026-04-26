import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { theme } from '@/theme/darkTheme';

const TYPE_LABEL: Record<string, { label: string; icon: any; color: string }> = {
  MATCH_AVAILABLE: { label: 'СВОБОДЕН МАЧ', icon: 'football-outline', color: theme.colors.accent.primary },
  LOOKING_FOR_PLAYERS: { label: 'ТЪРСЯТ ИГРАЧИ', icon: 'people-outline', color: theme.colors.accent.success },
  LOOKING_FOR_TEAM: { label: 'ТЪРСЯТ ОТБОР', icon: 'flag-outline', color: theme.colors.accent.secondary },
};

interface Props {
  listing: any;
  onPress?: () => void;
}

function fmtDate(s?: string) {
  if (!s) return null;
  try {
    const d = new Date(s);
    return d.toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' });
  } catch {
    return s;
  }
}

export const ListingCard: React.FC<Props> = ({ listing, onPress }) => {
  const meta = TYPE_LABEL[listing.type] || TYPE_LABEL.MATCH_AVAILABLE;
  const dateStr = fmtDate(listing.date);
  const score = listing.author_reliability_score ?? 100;
  const scoreColor = score >= 90 ? theme.colors.accent.success : score >= 70 ? '#F59E0B' : theme.colors.accent.danger;

  return (
    <GlassCard onPress={onPress} testID={`listing-${listing.id}`}>
      <View style={styles.headerRow}>
        <View style={[styles.typePill, { backgroundColor: `${meta.color}26`, borderColor: meta.color }]}>
          <Ionicons name={meta.icon} size={11} color={meta.color} />
          <Text style={[styles.typePillText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        {dateStr && <Text style={styles.dateText}>{dateStr}{listing.time ? ` · ${listing.time}` : ''}</Text>}
      </View>

      <Text style={styles.title} numberOfLines={2}>{listing.title}</Text>

      {listing.venue && (
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={12} color={theme.colors.text.muted} />
          <Text style={styles.metaText} numberOfLines={1}>{listing.venue}</Text>
        </View>
      )}

      <View style={styles.bottomRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <View style={[styles.scoreDot, { backgroundColor: scoreColor }]} />
          <Text style={styles.author} numberOfLines={1}>
            {listing.author_name || '—'}{listing.author_phone_masked ? ` · ${listing.author_phone_masked}` : ''}
          </Text>
        </View>
        {(listing.spots_needed != null) && (
          <View style={styles.spotsPill}>
            <Text style={styles.spotsText}>{listing.spots_needed} ↓</Text>
          </View>
        )}
        {listing.price_per_player != null && listing.price_per_player > 0 && (
          <Text style={styles.priceText}>{listing.price_per_player.toFixed(2)} €</Text>
        )}
      </View>

      {(listing.responses_count ?? 0) > 0 && (
        <Text style={styles.responsesText}>
          {listing.responses_count} отговор{listing.responses_count === 1 ? '' : 'а'}
        </Text>
      )}
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    borderWidth: 1,
  },
  typePillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  dateText: { color: theme.colors.text.muted, fontSize: 11, fontWeight: '600' },
  title: { color: theme.colors.text.primary, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  metaText: { color: theme.colors.text.muted, fontSize: 12, flex: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  scoreDot: { width: 8, height: 8, borderRadius: 4 },
  author: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: '600' },
  spotsPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: theme.colors.background.input,
  },
  spotsText: { color: theme.colors.text.primary, fontSize: 11, fontWeight: '700' },
  priceText: { color: theme.colors.accent.gold, fontSize: 13, fontWeight: '700' },
  responsesText: { color: theme.colors.accent.primary, fontSize: 11, fontWeight: '600', marginTop: 6 },
});
