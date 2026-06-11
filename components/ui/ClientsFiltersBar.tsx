import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { FormInput } from '@/components/ui/FormInput';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { useTheme } from '@/src/contexts/ThemeContext';
import {
    CLIENTES_FILTRO_INICIAL,
    type ClienteStatusFiltro,
    type ClientesFiltroState,
    temFiltroAtivo,
} from '@/src/utils/clientes-filtro';

type Props = {
  value: ClientesFiltroState;
  onChange: (next: ClientesFiltroState) => void;
  total: number;
  filtrados: number;
};

const STATUS_OPTIONS = ['todos', 'ativo', 'trial', 'inativo'] as const;

const STATUS_LABELS: Record<ClienteStatusFiltro, string> = {
  todos: 'Todos',
  ativo: 'Ativo',
  trial: 'Trial',
  inativo: 'Inativo',
};

export function ClientsFiltersBar({ value, onChange, total, filtrados }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const ativo = temFiltroAtivo(value);

  return (
    <ScreenCard style={styles.wrap} padded={false}>
      <View style={styles.searchRow}>
        <FontAwesome name="search" size={13} color={theme.textMuted} style={styles.searchIcon} />
        <FormInput
          style={styles.searchInput}
          placeholder="Nome, e-mail ou telefone…"
          value={value.busca}
          onChangeText={(busca) => onChange({ ...value, busca })}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {value.busca ? (
          <Pressable onPress={() => onChange({ ...value, busca: '' })} hitSlop={8} style={styles.clearIcon}>
            <FontAwesome name="times-circle" size={14} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.line}>
        <Text style={styles.tag}>Status</Text>
        <View style={styles.chips}>
          <ChipSelect
            compact
            options={STATUS_OPTIONS}
            value={value.status}
            labels={STATUS_LABELS}
            onChange={(status) => onChange({ ...value, status })}
          />
        </View>
      </View>

      <DateRangeFilter
        compact
        value={{
          preset: value.periodoPreset,
          dataInicio: value.dataInicio,
          dataFim: value.dataFim,
        }}
        onChange={({ preset, dataInicio, dataFim }) =>
          onChange({
            ...value,
            periodoPreset: preset,
            dataInicio,
            dataFim,
          })
        }
      />

      <View style={styles.footer}>
        <Text style={styles.count}>
          {ativo ? (
            <>
              <Text style={styles.countStrong}>{filtrados}</Text>/{total}
            </>
          ) : (
            total
          )}{' '}
          clientes
        </Text>
        {ativo ? (
          <Pressable onPress={() => onChange(CLIENTES_FILTRO_INICIAL)} hitSlop={8}>
            <Text style={styles.clear}>Limpar filtros</Text>
          </Pressable>
        ) : null}
      </View>
    </ScreenCard>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    wrap: { padding: 10, gap: 8, marginBottom: 2 },
    searchRow: { position: 'relative', justifyContent: 'center' },
    searchIcon: { position: 'absolute', left: 8, zIndex: 1 },
    searchInput: { height: 32, fontSize: 13, paddingLeft: 28, paddingRight: 28 },
    clearIcon: { position: 'absolute', right: 8, zIndex: 1 },
    line: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    tag: { fontSize: 11, fontWeight: '700', color: theme.textMuted, width: 52, paddingTop: 6 },
    chips: { flex: 1, minWidth: 0 },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 2,
    },
    count: { fontSize: 11, color: theme.textMuted },
    countStrong: { fontWeight: '800', color: theme.headerText },
    clear: { fontSize: 11, fontWeight: '700', color: theme.cadastroAction },
  });
}
