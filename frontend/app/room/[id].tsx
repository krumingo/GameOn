import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Placeholder } from '@/components/Placeholder';
export default function MatchRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Placeholder title={`Match Room ${id || ''}`} subtitle="Идва в следващия промпт" testID="screen-match-room" />;
}
