import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

export const BREAKPOINTS = {
  phone: 480,
  mobile: 768,
  desktop: 1024,
} as const;

export function useResponsiveLayout() {
  const { width } = useWindowDimensions();

  return useMemo(
    () => ({
      width,
      isPhone: width < BREAKPOINTS.phone,
      isMobile: width < BREAKPOINTS.mobile,
      isMobileNav: width < BREAKPOINTS.desktop,
      isDesktop: width >= BREAKPOINTS.desktop,
      /** Largura percentual de um card KPI na grid. */
      kpiCardWidth: width < BREAKPOINTS.phone ? '100%' : width < BREAKPOINTS.mobile ? '48%' : '23.5%',
      contentMaxWidth: width >= BREAKPOINTS.desktop ? 1200 : undefined,
      horizontalPadding: width < BREAKPOINTS.phone ? 12 : 16,
    }),
    [width],
  );
}
