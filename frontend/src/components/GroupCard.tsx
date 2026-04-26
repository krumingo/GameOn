import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GlassCard } from './GlassCard';
import { MatchCard } from './MatchCard';
import { theme } from '@/theme/darkTheme';

interface Group {
  id: string;
  name: string;
  plan: string;
  trial_days_left?: number;
  role: string;
  members_count: number;
  matches_count: number;
  matches_list?: any[];
  currency?: string;
}

interface Props {
  group: Group;
  currentUserId?: string;
  onRsvpToggle: (matchId: string, newStatus: string) => Promise<void>;
  defaultExpanded?: boolean;
}

const PLAN_BADGES: Record<string, { bg: string; color: string; label: string }> = {
  PRO: { bg: 'rgba(255,215,0,0.15)', color: theme.colors.accent.gold, label: 'PRO' },
  TRIAL: { bg: 'rgba(59,130,246,0.15)', color: theme.colors.accent.primary, label: 'TRIAL' },
  GRACE: { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B', label: 'GRACE' },
  FREE: { bg: 'rgba(255,255,255,0.06)', color: theme.colors.text.muted, label: 'FREE' },
};

export const GroupCard: React.FC<Props> = ({ group, currentUserId, onRsvpToggle, defaultExpanded = true }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const router = useRouter();
  const planConfig = PLAN_BADGES[group.plan] || PLAN_BADGES.FREE;
  const currency = group.currency || '€';
  const isOrganizer = group.role === 'OWNER' || group.role === 'ORGANIZER';
  const matches = (group.matches_list || []).slice(0, 5);

  return (
    <View style={{ marginBottom: 16 }} testID={`group-card-${group.id}`}>
      <GlassCard>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setExpanded(!expanded)}
          testID={`group-card-toggle-${group.id}`}
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>ГРУПА</Text>
              <Text style={styles.name} numberOfLines={1}>{group.name}</Text>
              <Text style={styles.meta}>
                {group.matches_count} мача · {group.members_count} участници
              </Text>
            </View>
            <View style={styles.headerRight}>
              <View style={[styles.planPill, { backgroundColor: planConfig.bg }]}>
                <Text style={[styles.planText, { color: planConfig.color }]}>
                  {planConfig.label}
                  {group.plan === 'TRIAL' && group.trial_days_left != null
                    ? ` ${group.trial_days_left}д`
                    : ''}
                </Text>
              </View>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.colors.text.muted}
                style={{ marginTop: 6 }}
              />
            </View>
          </View>
        </TouchableOpacity>

        {expanded && (
          <View style={{ marginTop: 12 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionsRow}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push(`/cash?groupId=${group.id}`)}
                testID={`group-action-cash-${group.id}`}
              >
                <Ionicons name="wallet-outline" size={16} color={theme.colors.accent.primary} />
                <Text style={styles.actionText}>Финанси</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push(`/room/${group.id}?tab=settings`)}
                testID={`group-action-settings-${group.id}`}
              >
                <Ionicons name="people-outline" size={16} color={theme.colors.accent.primary} />
                <Text style={styles.actionText}>Група</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={{ marginTop: 12 }}>
              {matches.length === 0 ? (
                <Text style={styles.empty}>Няма предстоящи мачове</Text>
              ) : (
                matches.map((m: any) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    currentUserId={currentUserId}
                    isOrganizer={isOrganizer}
                    currency={currency}
                    onPress={(matchId) => router.push(`/room/${matchId}`)}
                    onRsvpToggle={onRsvpToggle}
                  />
                ))
              )}
              {group.matches_count > 5 && (
                <TouchableOpacity
                  onPress={() => router.push(`/room/${group.id}?tab=matches`)}
                  testID={`group-view-all-${group.id}`}
                >
                  <Text style={styles.viewAll}>Виж всички →</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </GlassCard>
    </View>
  );
};

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  label: {
    color: theme.colors.text.muted, fontSize: 10,
    fontWeight: '700', letterSpacing: 1.5,
  },
  name: { color: theme.colors.text.primary, fontSize: 17, fontWeight: '700', marginTop: 2 },
  meta: { color: theme.colors.text.muted, fontSize: 12, marginTop: 4 },
  headerRight: { alignItems: 'flex-end' },
  planPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  planText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  actionsRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: theme.colors.background.input,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  actionText: { color: theme.colors.text.primary, fontWeight: '600', fontSize: 13 },
  empty: { color: theme.colors.text.muted, fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  viewAll: { color: theme.colors.accent.primary, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 8 },
});
