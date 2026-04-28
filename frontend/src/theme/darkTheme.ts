export const theme = {
  colors: {
    background: {
      primary: '#0A0E14',
      secondary: '#0D1117',
      card: 'rgba(255,255,255,0.04)',
      cardHover: 'rgba(255,255,255,0.08)',
      input: 'rgba(255,255,255,0.06)',
    },
    accent: {
      primary: '#3B82F6',
      secondary: '#F97316',
      success: '#22C55E',
      danger: '#EF4444',
      gold: '#FFD700',
      blue_team: '#3B82F6',
      red_team: '#EF4444',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(255,255,255,0.7)',
      muted: 'rgba(255,255,255,0.4)',
      inverse: '#0A0E14',
    },
    border: {
      primary: 'rgba(255,255,255,0.08)',
      accent: 'rgba(59,130,246,0.3)',
    },
    status: {
      going: '#22C55E',
      notGoing: '#EF4444',
      pending: '#F59E0B',
      waitlist: '#8B5CF6',
      paid: '#22C55E',
      unpaid: '#6B7280',
      overpaid: '#3B82F6',
      guest: '#F97316',
      cancelled: '#EF4444',
    },
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  borderRadius: { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 },
  fontSize: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22, xxl: 28 },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },
  currency: '€',
};

export type Theme = typeof theme;
