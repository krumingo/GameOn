import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useTranslation } from 'react-i18next';

export const OfflineBanner: React.FC = () => {
  const [offline, setOffline] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOffline(!state.isConnected);
    });
    return () => unsub();
  }, []);

  if (!offline) return null;
  return (
    <View style={styles.banner} testID="offline-banner">
      <Text style={styles.text}>{t('notifications.offline')}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#F59E0B',
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
    paddingBottom: 8, paddingHorizontal: 16, alignItems: 'center', zIndex: 100,
  },
  text: { color: '#fff', fontWeight: '600' },
});
