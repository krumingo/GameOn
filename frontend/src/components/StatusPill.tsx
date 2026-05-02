import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  status: string;
  size?: 'sm' | 'md';
  testID?: string;
}

interface PillSpec {
  bg: string;
  text: string;
  border: string;
  label: string;
}

// Status → display spec. Unknown → neutral gray with raw status text.
const SPECS: Record<string, PillSpec> = {
  going:     { bg: '#052e16', text: '#86efac', border: '#166534', label: 'Идва' },
  not_going: { bg: '#2c0a0a', text: '#fca5a5', border: '#7f1d1d', label: 'Не идва' },
  pending:   { bg: '#431407', text: '#fb923c', border: '#9a3412', label: 'Чака одобрение' },
  PAID:      { bg: '#1e3a5f', text: '#60a5fa', border: '#2563eb', label: 'Платено' },
  UNPAID:    { bg: '#1e1e1e', text: '#9ca3af', border: '#374151', label: 'Неплатено' },
};

const FALLBACK: Pick<PillSpec, 'bg' | 'text' | 'border'> = {
  bg: '#1e1e1e',
  text: '#9ca3af',
  border: '#374151',
};

export const StatusPill: React.FC<Props> = ({ status, size = 'md', testID }) => {
  const spec = SPECS[status];
  const display = spec
    ? { bg: spec.bg, text: spec.text, border: spec.border, label: spec.label }
    : { bg: FALLBACK.bg, text: FALLBACK.text, border: FALLBACK.border, label: status };
  const fontSize = size === 'sm' ? 11 : 12;

  return (
    <View
      style={[styles.pill, { backgroundColor: display.bg, borderColor: display.border }]}
      testID={testID || `status-pill-${status}`}
    >
      <Text style={[styles.label, { color: display.text, fontSize }]}>{display.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
