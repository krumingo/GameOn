import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar';
import { GlassCard } from './GlassCard';
import { LoadingButton } from './LoadingButton';
import { AvatarStack } from './Avatar';
import { theme } from '@/theme/darkTheme';

const DAY_NAMES_BG = ['Пон', 'Вт', 'Ср', 'Чет', 'Пет', 'Съб', 'Нед'];
const MONTHS_BG = ['ян', 'фев', 'март', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'];

interface MatchData {
  id: string;
  name: string;
  venue?: string;
  start_datetime: string;
  player_limit?: number;
  going_count: number;
  free_spots: number;
  waitlist_count?: number;
  price_per_player?: number;
  user_rsvp_status?: string | null;
  recurrence?: string;
  status?: string;
  pricing_mode?: string;
}

interface Props {
  match: MatchData;
  rsvpList?: Array<{ name: string; user_id?: string; is_guest?: boolean }>;
  currentUserId?: string;
  isOrganizer: boolean;
  currency: string;
  onPress: (matchId: string) => void;
  onRsvpToggle: (matchId: string, newStatus: string) => Promise<void>;
}

function formatDay(iso: string): { day: string; time: string; date: string } {
  try {
    const d = new Date(iso);
    return {
      day: DAY_NAMES_BG[(d.getDay() + 6) % 7],
      time: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
      date: `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`,
    };
  } catch {
    return { day: '', time: '', date: '' };
  }
}

const MatchCardImpl: React.FC<Props> = ({
  match, rsvpList = [], currentUserId, isOrganizer, currency,
  onPress, onRsvpToggle,
}) => {
  const [busy, setBusy] = useState(false);
  const status = match.user_rsvp_status;
  const isGoing = status === 'going';
  const isCancelled = match.status === 'CANCELLED';
  const isFull = match.free_spots === 0 && !isGoing && !isCancelled;
  const isWaitlist = status === 'waitlist';
  const isPending = status === 'pending';

  const { day, time, date } = formatDay(match.start_datetime);

  const handleRsvpPress = async () => {
    if (isCancelled || busy) return;
    const newStatus = isGoing ? 'not_going' : 'going';
    setBusy(true);
    try {
      await onRsvpToggle(match.id, newStatus);
      if (newStatus === 'going' && Platform.OS !== 'web') {
        try {
          const { status: perm } = await Calendar.requestCalendarPermissionsAsync();
          if (perm === 'granted') {
            Alert.alert('Добави в календар?', match.name, [
              { text: 'Не', style: 'cancel' },
              {
                text: 'Да',
                onPress: async () => {
                  try {
                    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
                    const cal = cals.find((c) => c.allowsModifications) || cals[0];
                    if (!cal) return;
                    const start = new Date(match.start_datetime);
                    const end = new Date(start.getTime() + 2 * 3600 * 1000);
                    await Calendar.createEventAsync(cal.id, {
                      title: match.name,
                      startDate: start,
                      endDate: end,
                      location: match.venue,
                      notes: 'GameOn мач',
                      alarms: [{ relativeOffset: -60 }],
                    });
                  } catch {}
                },
              },
            ]);
          }
        } catch {}
      }
    } finally {
      setBusy(false);
    }
  };

  const goingNames = rsvpList.slice(0, 5).map((r) => r.name);
  const meName = rsvpList.find((r) => r.user_id && r.user_id === currentUserId)?.name;
  const capLimit = match.player_limit ?? 14;
  const capPct = Math.min(1, Math.max(0, match.going_count / capLimit));
  const capBarColor =
    capPct >= 1 ? theme.colors.accent.danger
    : capPct >= 0.9 ? '#F59E0B'
    : capPct >= 0.7 ? '#F59E0B'
    : theme.colors.accent.primary;

  return (
    <GlassCard
      active={isGoing}
      activeColor={theme.colors.accent.success}
      glow={isGoing ? theme.colors.accent.success : undefined}
      style={styles.card}
      testID={`match-card-${match.id}`}
    >
      <TouchableOpacity activeOpacity={0.85} onPress={() => onPress(match.id)} testID={`match-card-tap-${match.id}`}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="football-outline" size={16} color={theme.colors.accent.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{match.name}</Text>
          </View>
          <View style={styles.dateChip}>
            <Text style={styles.dateChipDay}>{day}</Text>
            <Text style={styles.dateChipDate}>{date}</Text>
          </View>
        </View>

        {/* Venue + time */}
        <View style={styles.metaInline}>
          {match.venue ? (
            <View style={styles.metaCell}>
              <Ionicons name="location-outline" size={13} color={theme.colors.text.muted} />
              <Text style={styles.metaCellText} numberOfLines={1}>{match.venue}</Text>
            </View>
          ) : null}
          <View style={styles.metaCell}>
            <Ionicons name="time-outline" size={13} color={theme.colors.text.muted} />
            <Text style={styles.metaCellText}>{time}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Capacity row */}
        <View style={styles.capRow}>
          <Ionicons name="people-outline" size={13} color={theme.colors.text.muted} />
          <Text style={styles.capCount}>{match.going_count}/{capLimit}</Text>
          <View style={styles.capBarTrack} testID={`cap-bar-${match.id}`}>
            <View style={[styles.capBarFill, { width: `${capPct * 100}%`, backgroundColor: capBarColor }]} />
          </View>
          <Text style={styles.capRight}>
            {isCancelled ? 'отменен'
              : isFull ? 'пълен'
              : `${match.free_spots} своб.`}
          </Text>
        </View>

        {/* Price + recurrence */}
        <View style={styles.priceRow}>
          <Ionicons name="cash-outline" size={13} color={theme.colors.accent.gold} />
          <Text style={styles.priceText}>
            {(match.price_per_player ?? 0) > 0
              ? `${(match.price_per_player ?? 0).toFixed(2)} ${currency}/играч`
              : 'Безплатно'}
            {match.pricing_mode ? <Text style={styles.muted}>  ·  {match.pricing_mode}</Text> : null}
          </Text>
          {match.recurrence === 'WEEKLY' && (
            <View style={styles.weeklyPill}>
              <Ionicons name="repeat-outline" size={11} color={theme.colors.text.secondary} />
              <Text style={styles.weeklyText}>Всяка седмица</Text>
            </View>
          )}
        </View>

        {/* Inline avatars */}
        {goingNames.length > 0 && (
          <View style={styles.avatarsRow}>
            <AvatarStack names={goingNames} size={22} max={5} testID={`avatars-${match.id}`} />
            <Text style={styles.players} numberOfLines={1}>
              {goingNames[0]}{meName === goingNames[0] ? ' (ти)' : ''}
              {goingNames.length > 1 ? <Text style={styles.muted}>, {goingNames[1]}{meName === goingNames[1] ? ' (ти)' : ''}</Text> : null}
              {match.going_count > 2 && <Text style={styles.muted}> +{match.going_count - 2}</Text>}
            </Text>
          </View>
        )}

        {isCancelled && match.status === 'CANCELLED' && (
          <View style={[styles.cancelledPill]}>
            <Ionicons name="close-circle" size={13} color={theme.colors.accent.danger} />
            <Text style={styles.cancelledText}>Отменен</Text>
          </View>
        )}
      </TouchableOpacity>

      {!isCancelled && (
        <View style={styles.rsvpRow}>
          {isGoing ? (
            <>
              <View style={styles.goingBtn}>
                <Ionicons name="checkmark-circle" size={14} color={theme.colors.accent.success} />
                <Text style={styles.goingText}>Записан</Text>
              </View>
              <LoadingButton
                title="Откажи"
                variant="danger"
                onPress={handleRsvpPress}
                loading={busy}
                style={{ paddingVertical: 8, paddingHorizontal: 12, minHeight: 36 }}
                testID={`match-rsvp-cancel-${match.id}`}
              />
            </>
          ) : isPending ? (
            <LoadingButton
              title="Чакаш одобрение"
              variant="outline"
              onPress={() => {}}
              disabled
              style={{ flex: 1 }}
              testID={`match-rsvp-pending-${match.id}`}
            />
          ) : isWaitlist ? (
            <LoadingButton
              title={`На чакащите (#${(match.waitlist_count ?? 0)})`}
              variant="outline"
              onPress={handleRsvpPress}
              loading={busy}
              style={{ flex: 1 }}
              testID={`match-rsvp-waitlist-${match.id}`}
            />
          ) : (
            <LoadingButton
              title={isFull ? 'На чакащите' : 'Запиши се'}
              variant="primary"
              onPress={handleRsvpPress}
              loading={busy}
              style={{ flex: 1 }}
              testID={`match-rsvp-signup-${match.id}`}
            />
          )}
        </View>
      )}
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(59,130,246,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  dateChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: theme.colors.background.input,
    alignItems: 'center',
  },
  dateChipDay: { color: theme.colors.text.muted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  dateChipDate: { color: theme.colors.text.primary, fontSize: 11, fontWeight: '800', marginTop: 1 },

  metaInline: { flexDirection: 'row', gap: 14, marginTop: 8, flexWrap: 'wrap' },
  metaCell: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaCellText: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: '500' },

  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 12 },

  capRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  capCount: { color: theme.colors.text.primary, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  capBarTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  capBarFill: { height: '100%', borderRadius: 2 },
  capRight: { color: theme.colors.text.muted, fontSize: 11, fontWeight: '700' },

  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  priceText: { color: theme.colors.accent.gold, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  muted: { color: theme.colors.text.muted, fontWeight: '500' },
  weeklyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: theme.colors.background.input,
    borderWidth: 1, borderColor: theme.colors.border.primary,
    marginLeft: 'auto',
  },
  weeklyText: { fontSize: 10, fontWeight: '700', color: theme.colors.text.secondary },

  avatarsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  players: { color: theme.colors.text.secondary, fontSize: 12, flex: 1 },

  cancelledPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: 'rgba(239,68,68,0.14)',
    alignSelf: 'flex-start', marginTop: 10,
  },
  cancelledText: { color: theme.colors.accent.danger, fontSize: 11, fontWeight: '800' },

  rsvpRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  goingBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: theme.colors.accent.success,
    backgroundColor: 'rgba(34,197,94,0.12)',
    flex: 1,
  },
  goingText: { color: theme.colors.accent.success, fontWeight: '700' },
});

export const MatchCard = React.memo(MatchCardImpl);
