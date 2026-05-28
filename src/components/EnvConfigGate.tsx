import React from 'react';
import { Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { AzoupLogo } from '@/components/AzoupLogo';
import { getEnvSetupMessage, isEnvConfigured } from '@/src/lib/env';
import { ui } from '@/src/theme/ui';

export function EnvConfigGate({ children }: { children: React.ReactNode }) {
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

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: ui.bg,
    gap: 12,
  },
  logo: { marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: ui.navy },
  body: { fontSize: 15, lineHeight: 22, color: ui.text },
  hint: { fontSize: 14, lineHeight: 20, color: ui.muted, marginTop: 8 },
  bold: { fontWeight: '700', color: ui.navy },
});
