import AsyncStorage from '@react-native-async-storage/async-storage';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { usePathname, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AzoupLogo } from '@/components/AzoupLogo';
import { ThemeToggleButton } from '@/components/ui/ThemeToggleButton';
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  rotaAdminAtiva,
  type AdminNavItem,
} from '@/src/constants/admin-nav';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useResponsiveLayout } from '@/src/utils/responsiveLayout';

const SIDEBAR_WIDTH_EXPANDED = 288;
const SIDEBAR_WIDTH_COLLAPSED = 80;
const SIDEBAR_COLLAPSED_KEY = 'azoup-sidebar-collapsed';

const SIDEBAR_PALETTE = {
  text: '#E2E8F0',
  textMuted: '#94A3B8',
  section: '#64748B',
  border: 'rgba(255, 255, 255, 0.08)',
  itemIdle: 'rgba(255, 255, 255, 0.04)',
  itemHover: 'rgba(255, 255, 255, 0.08)',
  iconIdle: 'rgba(255, 255, 255, 0.1)',
  footerBg: 'rgba(0, 0, 0, 0.2)',
} as const;

type Props = {
  children: React.ReactNode;
};

function iniciaisEmail(email?: string | null): string {
  const e = `${email ?? ''}`.trim();
  if (!e) return '?';
  return e.charAt(0).toUpperCase();
}

function NavItemLink({
  item,
  active,
  accent,
  recolhido,
  onNavigate,
}: {
  item: AdminNavItem;
  active: boolean;
  accent: string;
  recolhido: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  const handlePress = useCallback(() => {
    if (!active) {
      router.push(item.href as never);
    }
    onNavigate?.();
  }, [active, item.href, onNavigate, router]);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
      title={Platform.OS === 'web' && recolhido ? item.label : undefined}
      onPress={handlePress}
      style={({ pressed, hovered }) => [
        styles.navItem,
        recolhido && styles.navItemCollapsed,
        active && styles.navItemActive,
        active && { backgroundColor: `${accent}20`, borderColor: `${accent}55` },
        !active && { backgroundColor: pressed || hovered ? SIDEBAR_PALETTE.itemHover : SIDEBAR_PALETTE.itemIdle },
        pressed && { transform: [{ scale: 0.99 }] },
      ]}>
        {active && !recolhido ? <View style={[styles.activeBar, { backgroundColor: accent }]} /> : null}
        {active && recolhido ? <View style={[styles.activeDot, { backgroundColor: accent }]} /> : null}

        {!recolhido ? (
          <Text
            style={[
              styles.navLabel,
              { color: active ? '#FFFFFF' : SIDEBAR_PALETTE.text },
              active && styles.navLabelActive,
            ]}
            numberOfLines={1}>
            {item.label}
          </Text>
        ) : null}

        <View
          style={[
            styles.iconWrap,
            recolhido && styles.iconWrapCollapsed,
            active ? { backgroundColor: accent } : { backgroundColor: SIDEBAR_PALETTE.iconIdle },
          ]}>
          <FontAwesome name={item.icon} size={16} color={active ? '#FFFFFF' : SIDEBAR_PALETTE.textMuted} />
        </View>

        {active && !recolhido ? (
          <FontAwesome name="chevron-right" size={11} color={`${accent}CC`} style={styles.navChevron} />
        ) : null}
    </Pressable>
  );
}

function NavLinks({ recolhido, onNavigate }: { recolhido: boolean; onNavigate?: () => void }) {
  const { theme } = useTheme();
  const pathname = usePathname();
  const { canAccessScreen } = useAdminAuth();

  const grupos = ADMIN_NAV_GROUPS.map((grupo) => ({
    ...grupo,
    items: ADMIN_NAV_ITEMS.filter((item) => item.group === grupo.id && canAccessScreen(item.key)),
  })).filter((g) => g.items.length > 0);

  return (
    <View style={styles.navSections}>
      {grupos.map((grupo, index) => (
        <View key={grupo.id} style={[styles.navSection, index > 0 && (recolhido ? styles.navSectionSpacedCollapsed : styles.navSectionSpaced)]}>
          {!recolhido ? <Text style={styles.sectionTitle}>{grupo.title}</Text> : index > 0 ? <View style={styles.sectionDivider} /> : null}
          <View style={styles.navList}>
            {grupo.items.map((item) => (
              <NavItemLink
                key={item.key}
                item={item}
                active={rotaAdminAtiva(pathname, item.href)}
                accent={theme.cadastroAction}
                recolhido={recolhido}
                onNavigate={onNavigate}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function CollapseToggle({
  recolhido,
  onPress,
  accent,
  compact,
}: {
  recolhido: boolean;
  onPress: () => void;
  accent: string;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={recolhido ? 'Expandir menu' : 'Recolher menu'}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.collapseBtn,
        compact && styles.collapseBtnCompact,
        {
          backgroundColor: pressed || hovered ? SIDEBAR_PALETTE.itemHover : SIDEBAR_PALETTE.itemIdle,
          borderColor: SIDEBAR_PALETTE.border,
        },
      ]}>
      <FontAwesome
        name={recolhido ? 'angle-double-right' : 'angle-double-left'}
        size={14}
        color={accent}
      />
      {!compact ? (
        <Text style={[styles.collapseLabel, { color: SIDEBAR_PALETTE.textMuted }]}>
          {recolhido ? 'Expandir' : 'Recolher menu'}
        </Text>
      ) : null}
    </Pressable>
  );
}

function SidebarPanel({
  onNavigate,
  mobile,
  recolhido,
  onToggleRecolher,
}: {
  onNavigate?: () => void;
  mobile?: boolean;
  recolhido: boolean;
  onToggleRecolher?: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { adminProfile, signOut, papel } = useAdminAuth();

  const email = adminProfile?.email ?? '';
  const perfil = papel ?? adminProfile?.role ?? adminProfile?.papel ?? '—';
  const compacto = !mobile && recolhido;

  return (
    <View
      style={[
        styles.sidebar,
        compacto && styles.sidebarCollapsed,
        {
          backgroundColor: theme.sidebarBg,
          paddingTop: Math.max(insets.top, mobile ? 12 : 20),
          paddingBottom: Math.max(insets.bottom, 16),
        },
      ]}>
      <View style={[styles.sidebarHeader, compacto && styles.sidebarHeaderCollapsed]}>
        {compacto ? (
          <View style={[styles.logoWrap, styles.logoWrapCollapsed]}>
            <AzoupLogo size={32} />
          </View>
        ) : (
          <View style={styles.brandRow}>
            <View style={styles.logoWrap}>
              <AzoupLogo size={40} style={{ alignItems: 'flex-start' }} />
            </View>
            <View style={styles.brandText}>
              <Text style={styles.brandTitle}>Azoup</Text>
              <Text style={styles.brandSubtitle}>Painel administrativo</Text>
            </View>
          </View>
        )}

        {mobile ? (
          <Pressable
            accessibilityLabel="Fechar menu"
            onPress={onNavigate}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.75 }]}>
            <FontAwesome name="times" size={18} color={SIDEBAR_PALETTE.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {!mobile && onToggleRecolher && !compacto ? (
        <CollapseToggle recolhido={recolhido} onPress={onToggleRecolher} accent={theme.cadastroAction} />
      ) : null}

      <ScrollView
        style={styles.navScroll}
        contentContainerStyle={styles.navScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <NavLinks recolhido={compacto} onNavigate={onNavigate} />
      </ScrollView>

      {!mobile && onToggleRecolher && compacto ? (
        <CollapseToggle
          recolhido={recolhido}
          onPress={onToggleRecolher}
          accent={theme.cadastroAction}
          compact
        />
      ) : null}

      <View
        style={[
          styles.footer,
          compacto && styles.footerCollapsed,
          { borderTopColor: SIDEBAR_PALETTE.border },
        ]}>
        <View style={[styles.avatar, { backgroundColor: `${theme.cadastroAction}33` }]}>
          <Text style={[styles.avatarText, { color: theme.cadastroAction }]}>{iniciaisEmail(email)}</Text>
        </View>

        {!compacto ? (
          <View style={styles.footerInfo}>
            <Text style={styles.footerEmail} numberOfLines={1}>
              {email || 'Administrador'}
            </Text>
            <Text style={styles.footerRole}>{`${perfil}`.toUpperCase()}</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityLabel="Sair"
          onPress={(e) => {
            e?.stopPropagation?.();
            void signOut();
          }}
          style={({ pressed }) => [
            styles.logoutBtn,
            compacto && styles.logoutBtnCollapsed,
            pressed && { opacity: 0.75 },
          ]}>
          <FontAwesome name="sign-out" size={16} color={SIDEBAR_PALETTE.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

export function AdminShell({ children }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsiveLayout();
  const [menuAberto, setMenuAberto] = useState(false);
  const [recolhido, setRecolhido] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(SIDEBAR_COLLAPSED_KEY).then((value) => {
      if (value === '1') setRecolhido(true);
    });
  }, []);

  const toggleRecolher = useCallback(() => {
    setRecolhido((prev) => {
      const next = !prev;
      void AsyncStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const fecharMenu = () => setMenuAberto(false);

  const sidebarWidth = recolhido ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  const topBar = useMemo(
    () => (
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
            paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 12 : 8),
            ...(Platform.OS === 'web'
              ? {
                  shadowColor: theme.cardShadow,
                  shadowOpacity: 0.06,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 4 },
                }
              : {}),
          },
        ]}>
        {!isDesktop ? (
          <Pressable
            accessibilityLabel="Abrir menu"
            onPress={() => setMenuAberto(true)}
            style={({ pressed }) => [
              styles.topIconBtn,
              {
                backgroundColor: theme.surfaceMuted,
                borderColor: theme.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <FontAwesome name="bars" size={20} color={theme.headerText} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel={recolhido ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            onPress={toggleRecolher}
            style={({ pressed }) => [
              styles.topIconBtn,
              {
                backgroundColor: theme.surfaceMuted,
                borderColor: theme.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <FontAwesome
              name={recolhido ? 'angle-double-right' : 'angle-double-left'}
              size={18}
              color={theme.cadastroAction}
            />
          </Pressable>
        )}

        <View style={styles.topBarCenter}>
          {!isDesktop ? <AzoupLogo size={32} /> : null}
          {isDesktop ? (
            <Text style={[styles.topBarTitle, { color: theme.headerText }]}>Painel Azoup</Text>
          ) : null}
        </View>

        <ThemeToggleButton />
      </View>
    ),
    [theme, insets.top, isDesktop, recolhido, toggleRecolher],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {isDesktop ? (
        <View style={[styles.sidebarSlot, { width: sidebarWidth }]}>
          <SidebarPanel recolhido={recolhido} onToggleRecolher={toggleRecolher} />
        </View>
      ) : null}

      <View style={styles.main}>
        {topBar}
        <View style={styles.content}>{children}</View>
      </View>

      {!isDesktop ? (
        <Modal visible={menuAberto} animationType="slide" transparent onRequestClose={fecharMenu}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.backdrop} onPress={fecharMenu} accessibilityLabel="Fechar menu" />
            <View
              style={[
                styles.drawer,
                {
                  width: Math.min(SIDEBAR_WIDTH_EXPANDED, 320),
                  shadowColor: '#000',
                  shadowOpacity: 0.25,
                  shadowRadius: 24,
                  shadowOffset: { width: 4, height: 0 },
                },
              ]}>
              <SidebarPanel onNavigate={fecharMenu} mobile recolhido={false} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  sidebarSlot: { height: '100%' },
  main: { flex: 1, minWidth: 0 },
  content: { flex: 1 },
  topBar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  topIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  sidebar: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sidebarCollapsed: {
    paddingHorizontal: 10,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SIDEBAR_PALETTE.border,
  },
  sidebarHeaderCollapsed: {
    justifyContent: 'center',
    marginBottom: 12,
    paddingBottom: 12,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  logoWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: SIDEBAR_PALETTE.itemIdle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapCollapsed: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignSelf: 'center',
  },
  brandText: { flex: 1, gap: 2 },
  brandTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  brandSubtitle: { color: SIDEBAR_PALETTE.textMuted, fontSize: 12, fontWeight: '500' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: SIDEBAR_PALETTE.itemIdle,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  collapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  collapseBtnCompact: {
    marginBottom: 12,
    minHeight: 36,
    paddingHorizontal: 0,
  },
  collapseLabel: { fontSize: 12, fontWeight: '700' },
  navScroll: { flex: 1, minHeight: 0 },
  navScrollContent: { paddingBottom: 16, flexGrow: 1 },
  navSections: { gap: 0 },
  navSection: { gap: 10 },
  navSectionSpaced: { marginTop: 24 },
  navSectionSpacedCollapsed: { marginTop: 12 },
  sectionTitle: {
    color: SIDEBAR_PALETTE.section,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: SIDEBAR_PALETTE.border,
    marginBottom: 8,
    marginHorizontal: 4,
  },
  navList: { gap: 6 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
    position: 'relative',
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 8,
    gap: 0,
  },
  navItemActive: {},
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 999,
  },
  activeDot: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    flexShrink: 0,
  },
  iconWrapCollapsed: {
    width: 38,
    height: 38,
  },
  navLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
    zIndex: 2,
  },
  navLabelActive: { fontWeight: '800' },
  navChevron: { marginLeft: 4, zIndex: 2 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  footerCollapsed: {
    flexDirection: 'column',
    gap: 8,
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800' },
  footerInfo: { flex: 1, gap: 2, minWidth: 0 },
  footerEmail: { color: SIDEBAR_PALETTE.text, fontSize: 13, fontWeight: '700' },
  footerRole: { color: SIDEBAR_PALETTE.section, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: SIDEBAR_PALETTE.footerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtnCollapsed: {
    width: 38,
    height: 38,
  },
  modalRoot: { flex: 1, flexDirection: 'row' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)' },
  drawer: { height: '100%', elevation: 16 },
});
