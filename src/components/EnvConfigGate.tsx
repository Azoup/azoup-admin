import React, { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { AzoupLogo } from '@/components/AzoupLogo';
import { getEnvSetupMessage, isEnvConfigured } from '@/src/lib/env';
import { lightTheme } from '@/src/theme/colors';

export function EnvConfigGate({ children }: { children: React.ReactNode }) {
  const styles = useMemo(() => getStyles(lightTheme), []);

  if (isEnvConfigured()) {
    return <>{children}</>;
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <AzoupLogo size={80} style={styles.logo} />
      <Text style={styles.title}>Configuração incompleta</Text>
      <Text style={styles.body}>{getEnvSetupMessage()}</Text>
      <Text style={styles.body}>
        No painel da Vercel: Project → Settings → Environment Variables. Use os mesmos nomes do arquivo `.env.example` na
        raiz do repositório.
      </Text>
      {Platform.OS === 'web' ? (
        <Text style={styles.hint}>
          Após salvar as variáveis, clique em <Text style={styles.bold}>Redeploy</Text> (as variáveis entram no bundle só no
          build).
        </Text>
      ) : null}
    </ScrollView>
  );
}

function getStyles(theme: typeof lightTheme) {
  return StyleSheet.create({
    wrap: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: 24,
      backgroundColor: theme.background,
      gap: 12,
    },
    logo: { marginBottom: 8 },
    title: { fontSize: 22, fontWeight: '800', color: theme.headerText },
    body: { fontSize: 15, lineHeight: 22, color: theme.text },
    hint: { fontSize: 14, lineHeight: 20, color: theme.textMuted, marginTop: 8 },
    bold: { fontWeight: '700', color: theme.headerText },
  });
}
