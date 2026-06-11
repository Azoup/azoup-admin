import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { useTheme } from '@/src/contexts/ThemeContext';
import type { ClienteConversaComCliente } from '@/src/services/repos/conversas-repo';
import { rotuloClienteConversa } from '@/src/services/repos/conversas-repo';
import { formatDateBR } from '@/src/utils/format';

type Props = {
  conversa: ClienteConversaComCliente;
  /** Na ficha do cliente o nome já está no cabeçalho — só data e texto. */
  modo?: 'lista' | 'cliente';
};

export function ConversaClienteCard({ conversa, modo = 'lista' }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(), []);

  return (
    <ScreenCard style={styles.card}>
      <View style={styles.header}>
        {modo === 'lista' ? (
          <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 16, flex: 1 }}>
            {rotuloClienteConversa(conversa)}
          </Text>
        ) : (
          <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 15, flex: 1 }}>Conversa</Text>
        )}
        <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 13 }}>
          {formatDateBR(conversa.data_conversa)}
        </Text>
      </View>
      <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21 }}>{conversa.descricao}</Text>
      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
        Registrado por {conversa.admin_email ?? 'administrador'}
        {conversa.created_at ? ` · ${formatDateBR(conversa.created_at)}` : ''}
      </Text>
    </ScreenCard>
  );
}

function getStyles() {
  return StyleSheet.create({
    card: { marginBottom: 10, gap: 8 },
    header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  });
}
