import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, usePathname } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AzoupLogo } from '@/components/AzoupLogo';
import { ThemeToggleButton } from '@/components/ui/ThemeToggleButton';
import { ADMIN_NAV_ITEMS, rotaAdminAtiva } from '@/src/constants/admin-nav';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useResponsiveLayout } from '@/src/utils/responsiveLayout';

const SIDEBAR_WIDTH = 268;

type Props = {
  children: React.ReactNode;
};

function NavLinks({
  onNavigate,
  style,
}: {
  onNavigate?: () => void;
  style?: ViewStyle;
}) {
  const { theme } = useTheme();
  const pathname = usePathname();
  const { canAccessScreen } = useAdminAuth();

  const items = ADMIN_NAV_ITEMS.filter((item) => canAccessScreen(item.key));

  return (
    <View style={style}>
      {items.map((item) => {
        const active = rotaAdminAtiva(pathname, item.href);
        return (
          <Link key={item.key} href={item.href as never} asChild onPress={onNavigate}>
            <Pressable
              style={({ pressed }) => [
                styles.navItem,
                active && { backgroundColor: `${theme.cadastroAction}22` },
                pressed && { opacity: 0.88 },
              ]}>
              <FontAwesome
                name={item.icon}
                size={18}
                color={active ? theme.cadastroAction : '#94A3B8'}
                style={{ width: 22 }}
              />
              <Text
                style={{
                  flex: 1,
                  color: active ? '#FFFFFF' : '#CBD5E1',
                  fontWeight: active ? '800' : '600',
                  fontSize: 14,
                }}
                numberOfLines={2}>
                {item.label}
              </Text>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}

function SidebarPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.sidebar,
        {
          backgroundColor: theme.sidebarBg,
          borderRightColor: theme.border,
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}>
      <View style={styles.sidebarBrand}>
        <AzoupLogo size={36} />
        <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: '600', marginTop: 6 }}>
          Painel administrativo
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingVertical: 8, gap: 2 }} showsVerticalScrollIndicator={false}>
        <NavLinks onNavigate={onNavigate} />
      </ScrollView>
    </View>
  );
}

export function AdminShell({ children }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsiveLayout();
  const [menuAberto, setMenuAberto] = useState(false);

  const fecharMenu = () => setMenuAberto(false);

  const topBar = useMemo(
    () => (
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
            paddingTop: Math.max(insets.top, 8),
          },
        ]}>
        {!isDesktop ? (
          <Pressable
            accessibilityLabel="Abrir menu"
            onPress={() => setMenuAberto(true)}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.75 }]}>
            <FontAwesome name="bars" size={22} color={theme.headerText} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}

        <View style={{ flex: 1, alignItems: isDesktop ? 'flex-start' : 'center' }}>
          {!isDesktop ? <AzoupLogo size={30} /> : null}
        </View>

        <ThemeToggleButton />
      </View>
    ),
    [theme, insets.top, isDesktop],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {isDesktop ? (
        <View style={{ width: SIDEBAR_WIDTH }}>
          <SidebarPanel />
        </View>
      ) : null}

      <View style={styles.main}>
        {topBar}
        <View style={styles.content}>{children}</View>
      </View>

      {!isDesktop ? (
        <Modal visible={menuAberto} animationType="fade" transparent onRequestClose={fecharMenu}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.backdrop} onPress={fecharMenu} accessibilityLabel="Fechar menu" />
            <View style={[styles.drawer, { width: Math.min(SIDEBAR_WIDTH, 300) }]}>
              <SidebarPanel onNavigate={fecharMenu} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  main: { flex: 1, minWidth: 0 },
  content: { flex: 1 },
  topBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebar: {
    flex: 1,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  sidebarBrand: {
    paddingHorizontal: 8,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 8,
  },
  modalRoot: { flex: 1, flexDirection: 'row' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  drawer: { height: '100%' },
});
