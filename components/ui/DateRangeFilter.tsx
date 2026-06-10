import React, { createElement, useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { ChipSelect } from '@/components/ui/ChipSelect';
import { FormInput } from '@/components/ui/FormInput';
import { useTheme } from '@/src/contexts/ThemeContext';
import type { PeriodoFiltroPreset } from '@/src/utils/clientes-filtro';

export type DateRangeFilterValue = {
  preset: PeriodoFiltroPreset;
  dataInicio: string | null;
  dataFim: string | null;
};

type Props = {
  value: DateRangeFilterValue;
  onChange: (next: DateRangeFilterValue) => void;
  compact?: boolean;
};

const PRESET_OPTIONS = [
  'todos',
  'hoje',
  '7d',
  '30d',
  'mes_atual',
  'mes_passado',
  'personalizado',
] as const;

const PRESET_LABELS: Record<(typeof PRESET_OPTIONS)[number], string> = {
  todos: 'Todos',
  hoje: 'Hoje',
  '7d': '7d',
  '30d': '30d',
  mes_atual: 'Mês',
  mes_passado: 'Ant.',
  personalizado: 'Datas',
};

const COMPACT_DATE_HEIGHT = 30;

function WebDateInput({
  value,
  onChange,
  theme,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  return createElement('input', {
    type: 'date',
    value: value ?? '',
    onChange: (e: { target: { value: string } }) => onChange(e.target.value || null),
    style: {
      height: COMPACT_DATE_HEIGHT,
      borderRadius: 6,
      border: `1px solid ${theme.borderInput}`,
      padding: '0 8px',
      backgroundColor: theme.inputBg,
      color: theme.text,
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      fontFamily: 'inherit',
      boxSizing: 'border-box',
    },
  });
}

function CompactDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={fieldStyles.row}>
      <Text style={[fieldStyles.tag, { color: theme.textMuted }]}>{label}</Text>
      {Platform.OS === 'web' ? (
        <WebDateInput value={value} onChange={onChange} theme={theme} />
      ) : (
        <FormInput
          style={fieldStyles.input}
          placeholder="AAAA-MM-DD"
          value={value ?? ''}
          onChangeText={(t) => onChange(t || null)}
        />
      )}
    </View>
  );
}

export function DateRangeFilter({ value, onChange, compact = false }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);

  return (
    <View style={styles.wrap}>
      <View style={styles.line}>
        <Text style={styles.tag}>Cadastro</Text>
        <View style={styles.chips}>
          <ChipSelect
            compact
            options={PRESET_OPTIONS}
            value={value.preset}
            labels={PRESET_LABELS}
            onChange={(preset) =>
              onChange({
                preset,
                dataInicio: preset === 'personalizado' ? value.dataInicio : null,
                dataFim: preset === 'personalizado' ? value.dataFim : null,
              })
            }
          />
        </View>
      </View>

      {value.preset === 'personalizado' ? (
        <View style={styles.datesRow}>
          <CompactDateField
            label="De"
            value={value.dataInicio}
            onChange={(dataInicio) => onChange({ ...value, dataInicio })}
          />
          <CompactDateField label="Até" value={value.dataFim} onChange={(dataFim) => onChange({ ...value, dataFim })} />
        </View>
      ) : null}
    </View>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    wrap: { gap: 6 },
    line: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    tag: { fontSize: 11, fontWeight: '700', color: theme.textMuted, width: 52, paddingTop: 6 },
    chips: { flex: 1, minWidth: 0 },
    datesRow: { flexDirection: 'row', gap: 8, paddingLeft: 58 },
  });
}

const fieldStyles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 120 },
  tag: { fontSize: 11, fontWeight: '700', width: 24 },
  input: { flex: 1, height: COMPACT_DATE_HEIGHT, fontSize: 12 },
});
