import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FormInput } from '@/components/ui/FormInput';
import { Text } from '@/components/Themed';
import { useTheme } from '@/src/contexts/ThemeContext';
import type { ClienteAzoupRow } from '@/src/types/azoup';
import { rotuloCliente } from '@/src/utils/cliente-label';

type Props = {
  /** Lista completa para busca ao digitar. */
  todosClientes: ClienteAzoupRow[];
  /** Exibidos quando a busca está vazia (ex.: clientes que já têm conversas). */
  clientesPadrao?: ClienteAzoupRow[];
  value: ClienteAzoupRow | null;
  onChange: (cliente: ClienteAzoupRow | null) => void;
  loading?: boolean;
  placeholderBusca?: string;
  mensagemListaVazia?: string;
};

function filtrarPorTexto(clientes: ClienteAzoupRow[], q: string): ClienteAzoupRow[] {
  const termo = q.trim().toLowerCase();
  if (!termo) return clientes;
  return clientes.filter((c) => {
    const blob = [rotuloCliente(c), c.email, c.nome, c.telefone]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return blob.includes(termo);
  });
}

export function ClienteSearchPicker({
  todosClientes,
  clientesPadrao,
  value,
  onChange,
  loading,
  placeholderBusca = 'Buscar por nome, e-mail ou telefone…',
  mensagemListaVazia = 'Nenhum cliente encontrado.',
}: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const [busca, setBusca] = useState('');

  const buscando = busca.trim().length > 0;
  const padrao = clientesPadrao ?? [];

  const exibidos = useMemo(() => {
    const base = buscando ? todosClientes : padrao.length > 0 ? padrao : todosClientes;
    return filtrarPorTexto(base, busca).slice(0, 80);
  }, [busca, buscando, padrao, todosClientes]);

  return (
    <View style={styles.wrap}>
      {value ? (
        <View style={[styles.selecionado, { borderColor: theme.cadastroAction, backgroundColor: theme.surface }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700' }}>SELECIONADO</Text>
            <Text style={{ color: theme.headerText, fontWeight: '800', marginTop: 2 }}>{rotuloCliente(value)}</Text>
            {value.email ? <Text style={{ color: theme.textMuted, fontSize: 12 }}>{value.email}</Text> : null}
          </View>
          <Pressable onPress={() => onChange(null)} hitSlop={8}>
            <Text style={{ color: theme.error, fontWeight: '700', fontSize: 13 }}>Trocar</Text>
          </Pressable>
        </View>
      ) : null}

      <FormInput
        value={busca}
        onChangeText={setBusca}
        placeholder={placeholderBusca}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />

      {!buscando && padrao.length > 0 ? (
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
          Clientes com conversas registradas ({padrao.length})
        </Text>
      ) : !buscando && padrao.length === 0 && todosClientes.length > 0 ? (
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
          Ainda não há conversas. Digite acima para buscar qualquer cliente.
        </Text>
      ) : buscando ? (
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
          Buscando em todos os clientes ({exibidos.length} encontrado{exibidos.length === 1 ? '' : 's'})
        </Text>
      ) : null}

      <View style={[styles.lista, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        {loading ? (
          <Text style={{ color: theme.textMuted, padding: 10, fontSize: 13 }}>Carregando clientes…</Text>
        ) : exibidos.length === 0 ? (
          <Text style={{ color: theme.textMuted, padding: 10, fontSize: 13 }}>{mensagemListaVazia}</Text>
        ) : (
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}>
            {exibidos.map((item) => {
              const ativo = value?.id === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    onChange(item);
                    setBusca('');
                  }}
                  style={[styles.option, ativo && { backgroundColor: theme.cadastroAction + '22' }]}>
                  <Text style={{ color: theme.headerText, fontWeight: ativo ? '800' : '600' }}>{rotuloCliente(item)}</Text>
                  {item.email ? (
                    <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{item.email}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    selecionado: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
    },
    lista: {
      borderWidth: 1,
      borderRadius: 10,
      overflow: 'hidden',
    },
    scroll: {
      maxHeight: 280,
      ...(Platform.OS === 'web' ? ({ overflow: 'auto' } as object) : null),
    },
    scrollContent: {
      flexGrow: 1,
    },
    option: {
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
  });
}
