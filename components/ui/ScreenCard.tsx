import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type ViewProps } from 'react-native';

import { useTheme } from '@/src/contexts/ThemeContext';

type BaseProps = {
  children: React.ReactNode;
  padded?: boolean;
};

type StaticCardProps = BaseProps & ViewProps & { onPress?: undefined };
type PressableCardProps = BaseProps & PressableProps;

export function ScreenCard(props: StaticCardProps | PressableCardProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { children, padded = true, style, ...rest } = props;

  const cardStyle = [styles.card, padded && styles.padded, style];

  if ('onPress' in props && props.onPress) {
    const { onPress, ...pressRest } = rest as PressableProps;
    return (
      <Pressable style={({ pressed }) => [cardStyle, pressed && styles.pressed]} onPress={onPress} {...pressRest}>
        {children}
      </Pressable>
    );
  }

  return (
    <View style={cardStyle} {...(rest as ViewProps)}>
      {children}
    </View>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      ...(typeof theme.cardShadow === 'string'
        ? {
            shadowColor: theme.cardShadow,
            shadowOpacity: 1,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 2,
          }
        : null),
    },
    padded: { padding: 14 },
    pressed: { opacity: 0.92 },
  });
}
