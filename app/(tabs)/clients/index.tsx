import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';

import { ClientsFiltersBar } from '@/components/ui/ClientsFiltersBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { Text } from '@/components/Themed';
import { useTheme } from '@/src/contexts/ThemeContext';
import { listarClientesAzoup } from '@/src/services/repos/clientes-repo';
import {
  CLIENTES_FILTRO_INICIAL,
  filtrarClientes,
  temFiltroAtivo,
  type ClientesFiltroState,
} from '@/src/utils/clientes-filtro';
import { formatBRLFromCentavos, formatBRLFromReais, formatDateBR } from '@/src/utils/format';
import { resolveClienteWhatsAppUrl } from '@/src/utils/whatsapp';

const WHATSAPP_GREEN = '#25D366';

export default function ClientsListScreen() {
  const { theme } = useTheme();
  const [filtro, setFiltro] = useState<ClientesFiltroState>(CLIENTES_FILTRO_INICIAL);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['clientes_azoup_admin'],
    queryFn: listarClientesAzoup,
  });

  const clientes = data ?? [];
  const clientesFiltrados = useMemo(() => filtrarClientes(clientes, filtro), [clientes, filtro]);
  const filtroAtivo = temFiltroAtivo(filtro);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        refreshing={isRefetching}
        onRefresh={() => refetch()}
        data={clientesFiltrados}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 8 }}>
            <PageHeader
              title="Clientes"
              subtitle="Lista com dados de assinatura, plano e histórico financeiro."
            />
            <ClientsFiltersBar
              value={filtro}
              onChange={setFiltro}
              total={clientes.length}
              filtrados={clientesFiltrados.length}
            />
          </View>
        }
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 16 }}>
            {isLoading ? (
              <Text style={{ color: theme.textMuted }}>Carregando…</Text>
            ) : error ? (
              <Text style={{ color: theme.error }}>{(error as Error).message}</Text>
            ) : filtroAtivo ? (
              <Text style={{ color: theme.textMuted }}>Nenhum cliente encontrado com os filtros aplicados.</Text>
            ) : (
              <Text style={{ color: theme.textMuted }}>Nenhum cliente encontrado.</Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const nome =
            item.nome_fantasia ??
            item.nome ??
            item.razao_social ??
            item.email ??
            `Cliente ${item.id.slice(0, 8)}`;
          const whatsappUrl = resolveClienteWhatsAppUrl(item.celular, item.telefone);
          const inicioSistema = item.created_at ?? item.assinatura?.data_inicio ?? item.assinatura?.criado_em ?? null;

          return (
            <View style={{ marginHorizontal: 12, marginVertical: 6 }}>
              <ScreenCard style={styles.row}>
                <Link href={`/clients/${item.id}`} asChild>
                  <Pressable style={styles.rowMain}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[styles.rowTitle, { color: theme.headerText }]}>{nome}</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                        Matriz: {item.empresa_matriz_nome ?? '—'}
                        {item.empresa_matriz_cnpj ? ` · ${item.empresa_matriz_cnpj}` : ''}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                        {item.email ?? '—'} · {item.telefone ?? item.celular ?? '—'}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                        Cliente desde: {formatDateBR(inicioSistema)}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                        Plano: {item.plano?.nome ?? '—'} · Valor atual:{' '}
                        {item.assinatura?.valor_atual_centavos != null
                          ? formatBRLFromCentavos(item.assinatura.valor_atual_centavos)
                          : item.assinatura?.valor_mensal_atual != null
                            ? formatBRLFromReais(item.assinatura.valor_mensal_atual)
                            : formatBRLFromCentavos(item.plano?.valor_mensal_centavos)}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                        Assinatura: {item.assinatura?.status ?? '—'} · Falhas: {item.cobrancas_falhas ?? 0}
                      </Text>
                      {item.meses_em_aberto?.length ? (
                        <Text style={{ color: theme.warning, fontWeight: '700', fontSize: 13 }}>
                          Meses com pendência: {item.meses_em_aberto.join(', ')}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 24, color: theme.cadastroAction, opacity: 0.75 }}>›</Text>
                  </Pressable>
                </Link>

                <Pressable
                  accessibilityLabel={whatsappUrl ? 'Abrir WhatsApp do cliente' : 'Cliente sem telefone para WhatsApp'}
                  disabled={!whatsappUrl}
                  onPress={() => {
                    if (whatsappUrl) void Linking.openURL(whatsappUrl);
                  }}
                  style={({ pressed }) => [
                    styles.waBtn,
                    {
                      backgroundColor: theme.surfaceMuted,
                      borderColor: theme.border,
                      opacity: !whatsappUrl ? 0.35 : pressed ? 0.85 : 1,
                    },
                  ]}>
                  <FontAwesome name="whatsapp" size={22} color={WHATSAPP_GREEN} />
                </Pressable>
              </ScreenCard>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 17, fontWeight: '800' },
  waBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
