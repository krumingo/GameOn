import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { theme } from '@/theme/darkTheme';

interface Props {
  weekOffset: number;
  onShift: (delta: number) => void;
  totalThisWeek: number;
  joinedThisWeek: number;
  dailyMatches: number[]; // length 7 Mon..Sun
  dailyJoined: number[];
  todayIndex: number; // 0..6 Mon..Sun, only when offset === 0
}

const DAY_NAMES_BG = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

export const WeeklyStats: React.FC<Props> = ({
  weekOffset, onShift, totalThisWeek, joinedThisWeek, dailyMatches, dailyJoined, todayIndex,
}) => {
  const max = Math.max(1, ...dailyMatches);
  const label =
    weekOffset === 0 ? 'Тази седмица' :
    weekOffset === -1 ? 'Миналата седмица' :
    weekOffset === 1 ? 'Следващата седмица' :
    `${weekOffset > 0 ? '+' : ''}${weekOffset} седмици`;

  return (
    <GlassCard style={{ marginBottom: 16 }} testID="weekly-stats-card">
      <View style={styles.headerRow}>
        <Text style={styles.title}>{label}</Text>
        <View style={styles.arrowRow}>
          <TouchableOpacity onPress={() => onShift(-1)} style={styles.arrowBtn} testID="weekly-prev">
            <Ionicons name="chevron-back" color={theme.colors.text.secondary} size={18} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onShift(1)} style={styles.arrowBtn} testID="weekly-next">
            <Ionicons name="chevron-forward" color={theme.colors.text.secondary} size={18} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.numbersRow}>
        <View style={styles.numCol}>
          <View style={styles.numIconRow}>
            <Ionicons name="football-outline" size={14} color={theme.colors.accent.primary} />
            <Text style={[styles.bigNum, { color: theme.colors.accent.primary }]}>{totalThisWeek}</Text>
          </View>
          <Text style={styles.numLabel}>{totalThisWeek === 1 ? 'мач' : 'мача'}</Text>
        </View>
        <View style={styles.numCol}>
          <View style={styles.numIconRow}>
            <Ionicons name="checkmark-circle-outline" size={14} color={theme.colors.accent.success} />
            <Text style={[styles.bigNum, { color: theme.colors.accent.success }]}>{joinedThisWeek}</Text>
          </View>
          <Text style={styles.numLabel}>записан за</Text>
        </View>
      </View>

      <View style={styles.barsRow}>
        {DAY_NAMES_BG.map((d, i) => {
          const matches = dailyMatches[i] || 0;
          const joined = dailyJoined[i] || 0;
          const heightPct = matches > 0 ? Math.max(0.15, matches / max) : 0;
          const joinedPct = joined > 0 ? Math.max(0.15, joined / max) : 0;
          const isToday = weekOffset === 0 && i === todayIndex;
          return (
            <View key={i} style={styles.barCol}>
              <View style={styles.barTrack}>
                {matches > 0 && (
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: `${heightPct * 100}%`,
                        backgroundColor: 'rgba(59,130,246,0.4)',
                      },
                    ]}
                  />
                )}
                {joined > 0 && (
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: `${joinedPct * 100}%`,
                        backgroundColor: theme.colors.accent.success,
                      },
                    ]}
                  />
                )}
              </View>
              <Text style={[styles.dayLabel, isToday && { color: theme.colors.text.primary, fontWeight: '700' }]}>
                {d}
              </Text>
            </View>
          );
        })}
      </View>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700' },
  arrowRow: { flexDirection: 'row', gap: 6 },
  arrowBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: theme.colors.background.input,
    alignItems: 'center', justifyContent: 'center',
  },
  numbersRow: { flexDirection: 'row', gap: 32, marginTop: 12 },
  numCol: {},
  numIconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bigNum: { fontSize: 28, fontWeight: '800' },
  numLabel: { color: theme.colors.text.muted, fontSize: 12 },
  barsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, height: 70 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barTrack: {
    width: 16, height: 50, borderRadius: 4,
    backgroundColor: theme.colors.background.input,
    justifyContent: 'flex-end', overflow: 'hidden',
  },
  barFill: { width: '100%', borderRadius: 4 },
  dayLabel: { color: theme.colors.text.muted, fontSize: 10, marginTop: 4, fontWeight: '600' },
});
