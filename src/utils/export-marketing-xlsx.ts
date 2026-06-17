import { Platform } from 'react-native';
import * as XLSX from 'xlsx';

import type { ClienteMarketingUtmRow } from '@/src/types/azoup';
import { formatDateTimeBR } from '@/src/utils/format';

function linhaExportacao(row: ClienteMarketingUtmRow) {
  const cliente = row.clientes_azoup;
  return {
    Cliente: cliente?.nome ?? '',
    'E-mail': cliente?.email ?? '',
    'UTM Source': row.utm_source ?? '',
    'UTM Medium': row.utm_medium ?? '',
    'UTM Campaign': row.utm_campaign ?? '',
    'UTM Content': row.utm_content ?? '',
    'UTM Term': row.utm_term ?? '',
    'Capturado em': formatDateTimeBR(row.capturado_em) ?? '',
    'Atualizado em': formatDateTimeBR(row.atualizado_em) ?? '',
    'Cliente ID': row.cliente_id,
    'Registro ID': row.id,
  };
}

function nomeArquivoMarketingUtm(): string {
  const agora = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${agora.getFullYear()}${pad(agora.getMonth() + 1)}${pad(agora.getDate())}_${pad(agora.getHours())}${pad(agora.getMinutes())}`;
  return `marketing-utm_${stamp}.xlsx`;
}

export function exportarMarketingUtmExcel(rows: ClienteMarketingUtmRow[]): void {
  if (!rows.length) {
    throw new Error('Não há registros para exportar.');
  }

  const sheet = XLSX.utils.json_to_sheet(rows.map(linhaExportacao));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Marketing UTM');

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    XLSX.writeFile(workbook, nomeArquivoMarketingUtm());
    return;
  }

  throw new Error('Exportação Excel disponível na versão web do painel.');
}
