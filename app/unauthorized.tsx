import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';

export default function UnauthorizedScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { signOut, adminError } = useAdminAuth();

  return (
    <Screen style={{ justifyContent: 'center' }}>
      <PageHeader
        title="Sem permissão administrativa"
        subtitle="Seu login foi autenticado, mas seu e-mail não está ativo em admin_users ou não possui permissão para esta área."
      />

      <ScreenCard>
        <Text style={styles.debug}>Diagnóstico técnico: {adminError ?? 'Sem detalhes adicionais.'}</Text>
      </ScreenCard>

      <PrimaryButton
        label="Sair e entrar com outra conta"
        onPress={async () => {
          await signOut();
          router.replace('/login');
        }}
        style={{ alignSelf: 'flex-start' }}
      />
    </Screen>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>['theme'], isDark: boolean) {
  return StyleSheet.create({
    debug: {
      color: theme.error,
      backgroundColor: isDark ? '#3A1515' : '#FFF2F2',
      borderColor: isDark ? '#5C2020' : '#FFD7D7',
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      lineHeight: 20,
    },
  });
}
