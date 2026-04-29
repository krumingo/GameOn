import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';
import { events } from '@/utils/events';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  'http://localhost:8001';

const apiClient = axios.create({
  baseURL: API_URL + '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config) => {
  try {
    const isAdminPath = (config.url || '').startsWith('/admin/') || (config.url || '').startsWith('admin/');
    const tokenKey = isAdminPath ? 'admin_token' : 'token';
    const token = await AsyncStorage.getItem(tokenKey);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || '';
    const isAdminPath = url.startsWith('/admin/') || url.startsWith('admin/');
    if (status === 401 && !isAdminPath) {
      await AsyncStorage.multiRemove(['token', 'user']);
      try { router.replace('/'); } catch {}
    }
    if (status === 401 && isAdminPath && !url.includes('/admin/login')) {
      await AsyncStorage.removeItem('admin_token');
      try { router.replace('/admin/login'); } catch {}
    }
    // Global PRO paywall on 403
    if (status === 403) {
      const detail = error?.response?.data?.detail;
      const code = (detail && typeof detail === 'object' && detail.code) || (detail === 'Тази функция изисква PRO план' ? 'PLAN_PRO_REQUIRED' : null);
      if (code === 'PLAN_PRO_REQUIRED') {
        // Try to extract groupId from URL like /groups/{id}/...
        const m = url.match(/groups\/([a-f0-9]{24})/i);
        const groupId = m ? m[1] : '';
        events.emit('showPaywall', {
          groupId,
          feature: (detail && typeof detail === 'object' && detail.message) || 'Тази функция',
        });
      }
    }
    // Global server error toast
    if (status >= 500 && status < 600) {
      try {
        if (Platform.OS === 'web') {
          // Avoid blocking alert during automated tests when window is missing
          // eslint-disable-next-line no-console
          console.warn('[GameOn] Server error', status, url);
        } else {
          Alert.alert('Сървърна грешка', 'Нещо се обърка. Опитай отново.');
        }
      } catch {}
    }
    return Promise.reject(error);
  }
);

// ============= API Namespaces =============

export const authApi = {
  start: (phone: string) =>
    apiClient.post('/auth/start', { phone }).then(r => r.data),
  verify: (phone: string, otp: string) =>
    apiClient.post('/auth/verify', { phone, otp }).then(r => r.data),
  join: (name: string, phone: string, entry_code: string, otp?: string) =>
    apiClient.post('/auth/join', { name, phone, entry_code, otp }).then(r => r.data),
  superTestLogin: () =>
    apiClient.post('/auth/super-test-login').then(r => r.data),
  getMe: () => apiClient.get('/me').then(r => r.data),
  updateProfile: (data: any) => apiClient.patch('/me', data).then(r => r.data),
};

export const groupsApi = {
  getMyGroups: () => apiClient.get('/groups/my').then(r => r.data),
  getPublicGroups: (params?: any) =>
    apiClient.get('/groups/public', { params }).then(r => r.data),
  create: (data: any) => apiClient.post('/groups', data).then(r => r.data),
  join: (entry_code: string) =>
    apiClient.post('/groups/join', { entry_code }).then(r => r.data),
  getById: (id: string) => apiClient.get(`/groups/${id}`).then(r => r.data),
  update: (id: string, data: any) =>
    apiClient.patch(`/groups/${id}`, data).then(r => r.data),
  previewByCode: (code: string) =>
    apiClient.get(`/groups/preview-by-code`, { params: { code } }).then(r => r.data),
  addCategory: (groupId: string, category: string) =>
    apiClient.post(`/groups/${groupId}/categories`, { category }).then(r => r.data),
  follow: (groupId: string) =>
    apiClient.post(`/groups/${groupId}/follow`).then(r => r.data),
  unfollow: (groupId: string) =>
    apiClient.delete(`/groups/${groupId}/follow`).then(r => r.data),
};

export const matchesApi = {
  getUpcoming: (groupId: string) =>
    apiClient.get(`/groups/${groupId}/matches`).then(r => r.data),
  getHistory: (groupId: string, skip = 0, limit = 20) =>
    apiClient.get(`/groups/${groupId}/matches/history`, { params: { skip, limit } }).then(r => r.data),
  getById: (matchId: string) =>
    apiClient.get(`/matches/${matchId}`).then(r => r.data),
  create: (groupId: string, data: any) =>
    apiClient.post(`/groups/${groupId}/matches`, data).then(r => r.data),
  update: (matchId: string, data: any) =>
    apiClient.patch(`/matches/${matchId}`, data).then(r => r.data),
  cancel: (matchId: string, reason?: string) =>
    apiClient.post(`/matches/${matchId}/cancel`, { reason }).then(r => r.data),
  delete: (matchId: string) =>
    apiClient.delete(`/matches/${matchId}`).then(r => r.data),
  rsvp: (matchId: string, status: string) =>
    apiClient.post(`/matches/${matchId}/rsvp`, { status }).then(r => r.data),
  rsvpGuest: (matchId: string, guestId: string, status: string) =>
    apiClient.post(`/matches/${matchId}/rsvp-guest`, { guest_id: guestId, status }).then(r => r.data),
  getRsvps: (matchId: string) =>
    apiClient.get(`/matches/${matchId}/rsvps`).then(r => r.data),
  getWaitlist: (matchId: string) =>
    apiClient.get(`/matches/${matchId}/waitlist`).then(r => r.data),
  getPayments: (matchId: string) =>
    apiClient.get(`/matches/${matchId}/payments`).then(r => r.data),
  markPayment: (matchId: string, data: any) =>
    apiClient.post(`/matches/${matchId}/payments/mark`, data).then(r => r.data),
  recordToCash: (matchId: string) =>
    apiClient.post(`/matches/${matchId}/payments/record-to-cash`).then(r => r.data),
  getResults: (matchId: string) =>
    apiClient.get(`/matches/${matchId}/results`).then(r => r.data),
  setGoals: (matchId: string, userId: string, goals: number) =>
    apiClient.post(`/matches/${matchId}/results/set-goals`, { user_id: userId, goals }).then(r => r.data),
  getScore: (matchId: string) =>
    apiClient.get(`/matches/${matchId}/score`).then(r => r.data),
  setScore: (matchId: string, blueGoals: number, redGoals: number) =>
    apiClient.post(`/matches/${matchId}/score`, { blue_goals: blueGoals, red_goals: redGoals }).then(r => r.data),
  getTeams: (matchId: string) =>
    apiClient.get(`/matches/${matchId}/teams`).then(r => r.data),
  setCaptains: (matchId: string, blueId: string, redId: string) =>
    apiClient.post(`/matches/${matchId}/teams/set-captains`, { blue_captain_id: blueId, red_captain_id: redId }).then(r => r.data),
  pickPlayer: (matchId: string, userId: string) =>
    apiClient.post(`/matches/${matchId}/teams/pick`, { user_id: userId }).then(r => r.data),
  undoPick: (matchId: string) =>
    apiClient.post(`/matches/${matchId}/teams/undo-pick`).then(r => r.data),
  returnPlayer: (matchId: string, userId: string) =>
    apiClient.post(`/matches/${matchId}/teams/return-player`, { user_id: userId }).then(r => r.data),
  transferPlayer: (matchId: string, userId: string, fromTeam: string, toTeam: string) =>
    apiClient.post(`/matches/${matchId}/teams/transfer`, { user_id: userId, from_team: fromTeam, to_team: toTeam }).then(r => r.data),
  lockTeams: (matchId: string, locked: boolean) =>
    apiClient.post(`/matches/${matchId}/teams/lock`, { locked }).then(r => r.data),
  resetTeams: (matchId: string) =>
    apiClient.post(`/matches/${matchId}/teams/reset`).then(r => r.data),
  setDraftVisibility: (matchId: string, visible: boolean) =>
    apiClient.post(`/matches/${matchId}/teams/set-visibility`, { draft_visible: visible }).then(r => r.data),
  stopRecurrence: (matchId: string) =>
    apiClient.post(`/matches/${matchId}/stop-recurrence`).then(r => r.data),
};

export const billingApi = {
  getStatus: (groupId: string) =>
    apiClient.get(`/billing/group/${groupId}`).then(r => r.data),
  markPaid: (groupId: string) =>
    apiClient.post(`/billing/group/${groupId}/mark-paid`).then(r => r.data),
  createCheckout: (groupId: string, originUrl: string) =>
    apiClient.post('/billing/checkout-session', { group_id: groupId, origin_url: originUrl }).then(r => r.data),
  getCheckoutStatus: (sessionId: string) =>
    apiClient.get(`/billing/checkout-status/${sessionId}`).then(r => r.data),
  createPortal: (groupId: string, returnUrl: string) =>
    apiClient.post('/billing/portal', { group_id: groupId, return_url: returnUrl }).then(r => r.data),
  validateIapReceipt: (payload: { receipt_data: string; platform: 'ios' | 'android'; group_id: string }) =>
    apiClient.post('/billing/validate-iap-receipt', payload).then(r => r.data),
};

export const cashApi = {
  getSummary: (groupId: string) =>
    apiClient.get(`/groups/${groupId}/cash/summary`).then(r => r.data),
  getTransactions: (groupId: string, params?: any) =>
    apiClient.get(`/groups/${groupId}/cash/transactions`, { params }).then(r => r.data),
  createTransaction: (groupId: string, data: any) =>
    apiClient.post(`/groups/${groupId}/cash/transactions`, data).then(r => r.data),
  updateTransaction: (groupId: string, txId: string, data: any) =>
    apiClient.patch(`/groups/${groupId}/cash/transactions/${txId}`, data).then(r => r.data),
  deleteTransaction: (groupId: string, txId: string) =>
    apiClient.delete(`/groups/${groupId}/cash/transactions/${txId}`).then(r => r.data),
  getFinanceSummary: (groupId: string) =>
    apiClient.get(`/groups/${groupId}/finance-summary`).then(r => r.data),
  getExport: (groupId: string, format: 'csv' | 'json' = 'csv', periodStart?: string, periodEnd?: string) =>
    apiClient.get(`/groups/${groupId}/cash/export`, {
      params: { format, period_start: periodStart, period_end: periodEnd },
      responseType: format === 'csv' ? 'blob' : 'json',
    }).then(r => r.data),
};

export const statsApi = {
  getStats: (groupId: string, seasonId?: string, period?: string) =>
    apiClient.get(`/groups/${groupId}/stats`, { params: { season_id: seasonId, period } }).then(r => r.data),
  getLeaderboard: (groupId: string, metric: string, seasonId?: string) =>
    apiClient.get(`/groups/${groupId}/leaderboard`, { params: { metric, season_id: seasonId } }).then(r => r.data),
};

export const seasonsApi = {
  getAll: (groupId: string) =>
    apiClient.get(`/groups/${groupId}/seasons`).then(r => r.data),
  create: (groupId: string, data: any) =>
    apiClient.post(`/groups/${groupId}/seasons`, data).then(r => r.data),
  setActive: (groupId: string, seasonId: string) =>
    apiClient.post(`/groups/${groupId}/seasons/${seasonId}/set-active`).then(r => r.data),
  close: (groupId: string, seasonId: string) =>
    apiClient.post(`/groups/${groupId}/seasons/${seasonId}/close`).then(r => r.data),
  getHallOfFame: (groupId: string) =>
    apiClient.get(`/groups/${groupId}/seasons/hall-of-fame`).then(r => r.data),
};

export const chatApi = {
  getMessages: (groupId: string, before?: string, matchId?: string) =>
    apiClient.get(`/groups/${groupId}/chat`, { params: { before, match_id: matchId } }).then(r => r.data),
  send: (groupId: string, text: string, matchId?: string) =>
    apiClient.post(`/groups/${groupId}/chat`, { text, match_id: matchId }).then(r => r.data),
};

export const listingsApi = {
  getAll: (params?: any) =>
    apiClient.get('/listings', { params }).then(r => r.data),
  getById: (id: string) => apiClient.get(`/listings/${id}`).then(r => r.data),
  create: (data: any) => apiClient.post('/listings', data).then(r => r.data),
  respond: (id: string, message?: string) =>
    apiClient.post(`/listings/${id}/respond`, { message }).then(r => r.data),
  acceptResponse: (id: string, userId: string) =>
    apiClient.post(`/listings/${id}/respond/${userId}/accept`).then(r => r.data),
  rejectResponse: (id: string, userId: string) =>
    apiClient.post(`/listings/${id}/respond/${userId}/reject`).then(r => r.data),
  close: (id: string) => apiClient.patch(`/listings/${id}/close`).then(r => r.data),
};

export const playersApi = {
  search: (q: string, excludeGroup?: string) =>
    apiClient.get('/players/search', { params: { q, exclude_group: excludeGroup } }).then(r => r.data),
  invite: (groupId: string, userId: string, message?: string) =>
    apiClient.post(`/groups/${groupId}/invite`, { user_id: userId, message }).then(r => r.data),
  getInvitations: () => apiClient.get('/me/invitations').then(r => r.data),
  respondInvitation: (id: string, action: string) =>
    apiClient.post(`/invitations/${id}/respond`, { action }).then(r => r.data),
  getFollowing: () => apiClient.get('/me/following').then(r => r.data),
};

export const devApi = {
  seedData: () => apiClient.post('/dev/seed-demo-data').then(r => r.data),
  seedStatus: () => apiClient.get('/dev/seed-status').then(r => r.data),
  reset: () => apiClient.post('/dev/reset').then(r => r.data),
};

export const adminApi = {
  login: (email: string, password: string) =>
    apiClient.post('/admin/login', { email, password }).then(r => r.data),
  getStats: () => apiClient.get('/admin/stats').then(r => r.data),
  getGroups: (params?: any) =>
    apiClient.get('/admin/groups', { params }).then(r => r.data),
  getUsers: (params?: any) =>
    apiClient.get('/admin/users', { params }).then(r => r.data),
  getGroupDetail: (id: string) => apiClient.get(`/admin/groups/${id}`).then(r => r.data),
  getUserDetail: (id: string) => apiClient.get(`/admin/users/${id}`).then(r => r.data),
};

export const pushApi = {
  registerToken: (token: string) =>
    apiClient.post('/push/register-token', { token }).then(r => r.data),
  unregisterToken: () =>
    apiClient.delete('/push/register-token').then(r => r.data),
  getPrefs: () => apiClient.get('/push/prefs').then(r => r.data),
  updatePrefs: (prefs: any) => apiClient.put('/push/prefs', prefs).then(r => r.data),
  testPush: () => apiClient.post('/push/test').then(r => r.data),
};

export default apiClient;
