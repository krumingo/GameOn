import React from 'react';
import { useTranslation } from 'react-i18next';
import { Placeholder } from '@/components/Placeholder';
export default function DiscoverScreen() {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.discover')} subtitle={t('placeholder.comingSoon')} testID="screen-discover" />;
}
