import React from 'react';
import { useTranslation } from 'react-i18next';
import { Placeholder } from '@/components/Placeholder';
export default function MyScreen() {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.profile')} subtitle={t('placeholder.comingSoon')} testID="screen-my" />;
}
