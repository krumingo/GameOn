import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listingsApi, groupsApi, billingApi } from '@/api/client';
import { GlassCard } from '@/components/GlassCard';
import { ListingCard } from '@/components/ListingCard';
import { ListingDetailModal } from '@/components/ListingDetailModal';
import { CreateListingModal } from '@/components/CreateListingModal';
import { LoadingButton } from '@/components/LoadingButton';
import { theme } from '@/theme/darkTheme';
import { useTranslation } from 'react-i18next';

const TYPE_FILTERS = [
  { k: 'ALL', label: 'discover.filterAll' },
  { k: 'MATCH_AVAILABLE', label: 'discover.filterMatch' },
  { k: 'LOOKING_FOR_PLAYERS', label: 'discover.filterPlayers' },
  { k: 'LOOKING_FOR_TEAM', label: 'discover.filterTeam' },
];

export default function DiscoverScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [filter, setFilter] = useState<string>('ALL');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [adminProGroups, setAdminProGroups] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const params: any = {};
      if (filter !== 'ALL') params.type = filter;
      const data = await listingsApi.getAll(params);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  const loadAdminGroups = useCallback(async () => {
    try {
      const groups = await groupsApi.getMyGroups();
      // Find admin (OWNER/ORGANIZER) groups with PRO/TRIAL/GRACE plan
      const candidates = (groups || []).filter((g: any) =>
        g.role === 'OWNER' || g.role === 'ORGANIZER'
      );
      const proGroups: any[] = [];
      for (const g of candidates) {
        try {
          const bill = await billingApi.getStatus(g.id);
          if (['PRO', 'TRIAL', 'GRACE'].includes(bill?.plan)) {
            proGroups.push({ ...g, plan: bill.plan });
          }
        } catch {}
      }
      setAdminProGroups(proGroups);
    } catch {
      setAdminProGroups([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); loadAdminGroups(); }, [load, loadAdminGroups]));

  useEffect(() => { load(); }, [filter, load]);

  const canCreate = adminProGroups.length > 0;

  return (
    <View style={styles.container} testID="screen-discover">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersBar}
        testID="discover-filters"
      >
        {TYPE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.k}
            onPress={() => setFilter(f.k)}
            style={[styles.filterPill, filter === f.k && styles.filterPillActive]}
            testID={`filter-${f.k}`}
          >
            <Text style={[styles.filterText, filter === f.k && styles.filterTextActive]}>
              {t(f.label)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor="#fff"
          />
        }
        testID="discover-list"
      >
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.colors.accent.primary} />
          </View>
        ) : items.length === 0 ? (
          <GlassCard style={{ alignItems: 'center', padding: 32 }}>
            <Ionicons name="megaphone-outline" size={40} color={theme.colors.text.muted} />
            <Text style={styles.emptyText}>{t('discover.empty')}</Text>
          </GlassCard>
        ) : (
          items.map((l) => (
            <ListingCard key={l.id} listing={l} onPress={() => setSelectedId(l.id)} />
          ))
        )}
      </ScrollView>

      {canCreate && (
        <TouchableOpacity
          style={styles.createFab}
          onPress={() => setCreateOpen(true)}
          testID="discover-create"
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.createFabText}>{t('discover.createListing')}</Text>
        </TouchableOpacity>
      )}

      <ListingDetailModal
        listingId={selectedId}
        visible={!!selectedId}
        onClose={() => setSelectedId(null)}
        onChanged={load}
      />
      <CreateListingModal
        visible={createOpen}
        adminProGroups={adminProGroups}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); load(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.primary },
  filtersBar: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: theme.colors.background.card,
    borderWidth: 1, borderColor: theme.colors.border.primary,
  },
  filterPillActive: {
    backgroundColor: 'rgba(59,130,246,0.18)',
    borderColor: theme.colors.accent.primary,
  },
  filterText: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: theme.colors.accent.primary },
  list: { padding: 16, gap: 12, paddingBottom: 100 },
  loading: { padding: 48, alignItems: 'center' },
  emptyText: { color: theme.colors.text.muted, fontSize: 14, marginTop: 12 },
  createFab: {
    position: 'absolute',
    bottom: 90, right: 20,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 999,
    backgroundColor: theme.colors.accent.primary,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  createFabText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
