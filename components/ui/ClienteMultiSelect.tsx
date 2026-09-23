import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FormInput } from '@/components/ui/FormInput';
import { Text } from '@/components/Themed';
import { useTheme } from '@/src/contexts/ThemeContext';
import type { ClienteAzoupRow } from '@/src/types/azoup';
import { rotuloCliente } from '@/src/utils/cliente-label';

type Props = {
  clientes: ClienteAzoupRow[];
  selecionados: ClienteAzoupRow[];
  onChange: (clientes: ClienteAzoupRow[]) => void;
  loading?: boolean;
};

export function ClienteMultiSelect({ clientes, selecionados, onChange, loading }: Props) {
  const { theme } = useTheme();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ids = useMemo(() => new Set(selecionados.map((c) => c.id)), [selecionados]);

  const exibidos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = termo
      ? clientes.filter((c) =>
          [rotuloCliente(c), c.email, c.nome, c.telefone].filter(Boolean).join(' ').toLowerCase().includes(termo),
        )
      : clientes;
    return base.slice(0, 80);
  }, [busca, clientes]);

  const rotulo =
    selecionados.length === 0
      ? 'Todos os clientes'
      : selecionados.length === 1
        ? rotuloCliente(selecionados[0])
        : `${selecionados.length} clientes selecionados`;

  function alternar(cliente: ClienteAzoupRow) {
    if (ids.has(cliente.id)) onChange(selecionados.filter((c) => c.id !== cliente.id));
    else onChange([...selecionados, cliente]);
  }

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        onPress={() => setAberto((v) => !v)}
        style={[styles.caixa, { borderColor: theme.border, backgroundColor: theme.surface }]}
      >
        <Text style={{ color: selecionados.length ? theme.headerText : theme.textMuted, fontWeight: '700', flex: 1 }} numberOfLines={1}>
          {rotulo}
        </Text>
        <FontAwesome name={aberto ? 'chevron-up' : 'chevron-down'} size={12} color={theme.textMuted} />
      </Pressable>

      {selecionados.length > 0 ? (
        <View style={styles.chips}>
          {selecionados.map((cliente) => (
            <Pressable
              key={cliente.id}
              onPress={() => alternar(cliente)}
              style={[styles.chip, { borderColor: theme.cadastroAction, backgroundColor: `${theme.cadastroAction}18` }]}
            >
              <Text style={{ color: theme.headerText, fontWeight: '700', fontSize: 12 }} numberOfLines={1}>
                {rotuloCliente(cliente)}
              </Text>
              <FontAwesome name="times" size={11} color={theme.textMuted} />
            </Pressable>
          ))}
          <Pressable onPress={() => onChange([])} hitSlop={6}>
            <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>Limpar</Text>
          </Pressable>
        </View>
      ) : null}

      {aberto ? (
        <View style={[styles.painel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <FormInput
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar cliente…"
            autoCapitalize="none"
          />
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }}>
            {loading ? (
              <Text style={{ color: theme.textMuted, padding: 10 }}>Carregando clientes…</Text>
            ) : exibidos.length === 0 ? (
              <Text style={{ color: theme.textMuted, padding: 10 }}>Nenhum cliente encontrado.</Text>
            ) : (
              exibidos.map((cliente) => {
                const marcado = ids.has(cliente.id);
                return (
                  <Pressable
                    key={cliente.id}
                    onPress={() => alternar(cliente)}
                    style={[styles.opcao, { borderBottomColor: theme.border, backgroundColor: marcado ? `${theme.cadastroAction}18` : 'transparent' }]}
                  >
                    <FontAwesome
                      name={marcado ? 'check-square' : 'square-o'}
                      size={18}
                      color={marcado ? theme.cadastroAction : theme.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.headerText, fontWeight: marcado ? '800' : '600' }}>{rotuloCliente(cliente)}</Text>
                      {cliente.email ? <Text style={{ color: theme.textMuted, fontSize: 12 }}>{cliente.email}</Text> : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 220,
  },
  painel: { borderWidth: 1, borderRadius: 10, padding: 8, gap: 8 },
  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
