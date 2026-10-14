import { formatDateTimeBR } from '@/src/utils/format';
import { numeroTicket, type ConfecCard } from '@/src/services/repos/confec-kanban-repo';

const LARGURA_PAGINA = 595.28;
const ALTURA_PAGINA = 841.89;
const MARGEM = 40;
function escapar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[()\\]/g, (char) => `\\${char}`)
    .replace(/[^\x20-\x7E]/g, '?');
}

function montar(paginas: string[]): Uint8Array {
  const objetos: string[] = [];
  const reservar = (corpo: string) => {
    objetos.push(corpo);
    return objetos.length;
  };
  const f1 = reservar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = reservar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const conteudos = paginas.map((pagina) => {
    const dados = `${pagina}\n`;
    return reservar(`<< /Length ${dados.length} >>\nstream\n${dados}endstream`);
  });
  const folhas = conteudos.map((conteudo) =>
    reservar(
      `<< /Type /Page /Parent PAGINAS 0 R /MediaBox [0 0 ${LARGURA_PAGINA} ${ALTURA_PAGINA}] /Contents ${conteudo} 0 R /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> >>`,
    ),
  );
  const paginasId = reservar(`<< /Type /Pages /Kids [${folhas.map((id) => `${id} 0 R`).join(' ')}] /Count ${folhas.length} >>`);
  const catalogo = reservar(`<< /Type /Catalog /Pages ${paginasId} 0 R >>`);
  for (const folha of folhas) objetos[folha - 1] = objetos[folha - 1].replace('PAGINAS', `${paginasId}`);

  let corpo = '%PDF-1.4\n';
  const offsets = [0];
  objetos.forEach((objeto, indice) => {
    offsets.push(corpo.length);
    corpo += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
  });
  const xref = corpo.length;
  corpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) corpo += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
  corpo += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(corpo.length);
  for (let i = 0; i < corpo.length; i++) bytes[i] = corpo.charCodeAt(i) & 0xff;
  return bytes;
}

function linhas(texto: string, max = 90): string[] {
  const palavras = texto.replace(/\s+/g, ' ').trim().split(' ');
  const saida: string[] = [];
  let atual = '';
  for (const palavra of palavras) {
    const proxima = atual ? `${atual} ${palavra}` : palavra;
    if (proxima.length > max) {
      if (atual) saida.push(atual);
      atual = palavra.slice(0, max);
    } else atual = proxima;
  }
  if (atual) saida.push(atual);
  return saida.length ? saida : [''];
}

export function abrirPdfConcluidosConfec(cards: ConfecCard[], de: string, ate: string): void {
  if (typeof window === 'undefined') throw new Error('Abra o painel no navegador para gerar o PDF.');
  const paginas: string[] = [];
  let comandos: string[] = [];
  let y = 800;
  const fecharPagina = () => {
    if (!comandos.length) return;
    paginas.push(comandos.join('\n'));
    comandos = [];
    y = 800;
  };
  const escrever = (texto: string, tamanho: number, negrito: boolean) => {
    if (y < 48) fecharPagina();
    comandos.push(
      'BT',
      `/${negrito ? 'F2' : 'F1'} ${tamanho} Tf`,
      `1 0 0 1 ${MARGEM} ${y} Tm`,
      `(${escapar(texto)}) Tj`,
      'ET',
    );
    y -= tamanho + 4;
  };
  escrever('Kanban Confec — concluidos', 16, true);
  escrever(`Conclusao de ${de.split('-').reverse().join('/')} ate ${ate.split('-').reverse().join('/')}`, 10, false);
  y -= 8;
  if (!cards.length) escrever('Nenhuma demanda neste periodo.', 11, false);
  for (const card of cards) {
    if (y < 120) fecharPagina();
    escrever(`#${numeroTicket(card.ticket_number)}  ${card.title}`, 12, true);
    escrever(`Analista: ${card.analista_email || '—'}    Desenvolvedor: ${card.desenvolvedor_email || '—'}`, 9, false);
    escrever(`Concluido em: ${formatDateTimeBR(card.completed_at)}`, 9, false);
    for (const linha of linhas(card.dev_notes || 'Sem observacoes DEV.')) escrever(linha, 10, false);
    y -= 8;
  }
  fecharPagina();
  const bytes = montar(paginas.length ? paginas : ['']);
  const nome = 'kanban-confec-concluidos.pdf';
  const arquivo = new File([bytes.buffer as ArrayBuffer], nome, { type: 'application/pdf' });
  const pdfUrl = URL.createObjectURL(arquivo);
  const pagina = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Kanban Confec</title><style>html,body{margin:0;height:100%;background:#f4f5f7;font-family:Arial,sans-serif}header{height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;background:#1a2433;color:#fff}a{color:#1a2433;background:#fff;text-decoration:none;font-weight:700;padding:8px 14px;border-radius:8px}iframe{width:100%;height:calc(100% - 52px);border:0}</style></head><body><header><strong>Kanban Confec</strong><a href="${pdfUrl}" download="${nome}">Baixar PDF</a></header><iframe src="${pdfUrl}" title="Kanban Confec"></iframe></body></html>`;
  const abaUrl = URL.createObjectURL(new Blob([pagina], { type: 'text/html;charset=utf-8' }));
  window.setTimeout(() => {
    URL.revokeObjectURL(pdfUrl);
    URL.revokeObjectURL(abaUrl);
  }, 15 * 60_000);
  const aba = window.open(abaUrl, '_blank');
  if (!aba) {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = nome;
    link.click();
  } else aba.opener = null;
}
