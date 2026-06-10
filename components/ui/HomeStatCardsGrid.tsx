import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useResponsiveLayout } from '@/src/utils/responsiveLayout';

type Props = {
  children: React.ReactNode;
};

export function HomeStatCardsGrid({ children }: Props) {
  const { kpiCardWidth } = useResponsiveLayout();

  return (
    <View style={styles.grid}>
      {React.Children.map(children, (child) =>
        child ? <View style={{ width: kpiCardWidth }}>{child}</View> : null,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});
