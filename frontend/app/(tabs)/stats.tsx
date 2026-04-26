import React from 'react';
import { useTranslation } from 'react-i18next';
import { Placeholder } from '@/components/Placeholder';
export default function StatsScreen() {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.stats')} subtitle={t('placeholder.comingSoon')} testID="screen-stats" />;
}
