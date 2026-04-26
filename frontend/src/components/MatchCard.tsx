import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar';
import { GlassCard } from './GlassCard';
import { LoadingButton } from './LoadingButton';
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
      date: `${d.getDate()} ${MONTHS_BG[d.getMonth()]}`,
    };
  } catch {
    return { day: '', time: '', date: '' };
  }
}

export const MatchCard: React.FC<Props> = ({
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
        // Suggest calendar add (mobile only)
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

  const goingNames = rsvpList.filter((r) => true).slice(0, 5);

  return (
    <GlassCard
      style={[styles.card, isGoing && { borderLeftColor: theme.colors.accent.success, borderLeftWidth: 4 }]}
      testID={`match-card-${match.id}`}
    >
      <TouchableOpacity activeOpacity={0.85} onPress={() => onPress(match.id)} testID={`match-card-tap-${match.id}`}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {day} {time}
              {match.venue ? <Text style={styles.muted}>  •  {match.venue}</Text> : null}
            </Text>
            <Text style={styles.subTitle}>{match.name} · {date}</Text>
          </View>
          {isOrganizer && !isCancelled && (
            <TouchableOpacity
              onPress={() => onPress(match.id)}
              style={styles.editBtn}
              testID={`match-edit-${match.id}`}
            >
              <Ionicons name="pencil" size={14} color={theme.colors.text.muted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.capBadge}>
            <Text style={styles.capText}>
              {match.going_count}/{match.player_limit ?? 14}
            </Text>
          </View>
          {isCancelled ? (
            <View style={[styles.pill, { backgroundColor: 'rgba(239,68,68,0.18)' }]}>
              <Text style={[styles.pillText, { color: theme.colors.accent.danger }]}>Отменен</Text>
            </View>
          ) : isFull ? (
            <Text style={[styles.metaText, { color: theme.colors.accent.danger }]}>Пълен</Text>
          ) : (match.waitlist_count ?? 0) > 0 ? (
            <Text style={[styles.metaText, { color: theme.colors.status.waitlist }]}>
              Чакащи: {match.waitlist_count}
            </Text>
          ) : (
            <Text style={styles.metaText}>{match.free_spots} свободни</Text>
          )}
          {match.recurrence === 'WEEKLY' && (
            <View style={styles.weeklyPill}>
              <Text style={styles.pillText}>Всяка седмица</Text>
            </View>
          )}
        </View>

        <Text style={styles.price}>
          ≈ {(match.price_per_player ?? 0).toFixed(2)} {currency}/играч
        </Text>

        {goingNames.length > 0 && (
          <Text style={styles.players} numberOfLines={1}>
            {goingNames.map((r, i) => {
              const isCurrent = r.user_id && r.user_id === currentUserId;
              return (
                <Text key={i}>
                  <Text style={[styles.playerName, isCurrent && { color: theme.colors.accent.secondary }]}>
                    {r.name}{isCurrent ? ' (ти)' : ''}
                  </Text>
                  {i < goingNames.length - 1 ? <Text style={styles.muted}>, </Text> : null}
                </Text>
              );
            })}
            {match.going_count > goingNames.length && (
              <Text style={styles.muted}> +{match.going_count - goingNames.length}</Text>
            )}
          </Text>
        )}
      </TouchableOpacity>

      {!isCancelled && (
        <View style={styles.rsvpRow}>
          {isGoing ? (
            <>
              <View style={[styles.goingBtn]}>
                <Text style={[styles.goingText]}>✓ Записан</Text>
              </View>
              <LoadingButton
                title="✗ Откажи"
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
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700' },
  subTitle: { color: theme.colors.text.secondary, fontSize: 13, marginTop: 2 },
  muted: { color: theme.colors.text.muted, fontWeight: '400' },
  editBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: theme.colors.background.card,
    alignItems: 'center', justifyContent: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  capBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: theme.colors.background.input,
  },
  capText: { color: theme.colors.text.primary, fontWeight: '700', fontSize: 13 },
  metaText: { color: theme.colors.text.secondary, fontSize: 13, fontWeight: '600' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  weeklyPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: theme.colors.background.card,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  pillText: { fontSize: 11, fontWeight: '700', color: theme.colors.text.secondary },
  price: { color: theme.colors.text.muted, fontSize: 12, marginTop: 8 },
  players: { color: theme.colors.text.secondary, fontSize: 12, marginTop: 6 },
  playerName: { color: theme.colors.text.secondary },
  rsvpRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  goingBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: theme.colors.accent.success,
    backgroundColor: 'rgba(34,197,94,0.1)',
    flex: 1, alignItems: 'center',
  },
  goingText: { color: theme.colors.accent.success, fontWeight: '700' },
});
