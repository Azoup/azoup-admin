import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps, type ViewProps } from 'react-native';

import { useTheme } from '@/src/contexts/ThemeContext';
import { useResponsiveLayout } from '@/src/utils/responsiveLayout';

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
} & Pick<ScrollViewProps, 'refreshControl' | 'contentContainerStyle'> &
  Pick<ViewProps, 'style'>;

export function Screen({ children, scroll = false, padded = true, refreshControl, contentContainerStyle, style }: Props) {
  const { theme } = useTheme();
  const { horizontalPadding, contentMaxWidth } = useResponsiveLayout();
  const styles = useMemo(() => getStyles(theme, horizontalPadding, contentMaxWidth), [theme, horizontalPadding, contentMaxWidth]);

  if (scroll) {
    return (
      <ScrollView
        style={[styles.root, style]}
        contentContainerStyle={[styles.content, padded && styles.padded, contentContainerStyle]}
        refreshControl={refreshControl}>
        {children}
      </ScrollView>
    );
  }

  return <View style={[styles.root, styles.content, padded && styles.padded, style]}>{children}</View>;
}

function getStyles(theme: ReturnType<typeof useTheme>['theme'], horizontalPadding: number, contentMaxWidth?: number) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background },
    content: {
      flexGrow: 1,
      width: '100%',
      maxWidth: contentMaxWidth,
      alignSelf: 'center',
    },
    padded: {
      paddingHorizontal: horizontalPadding,
      paddingTop: 14,
      paddingBottom: 40,
      gap: 12,
    },
  });
}
