import { numeroTicket, type ConfecCard, type ConfecColuna } from '@/src/services/repos/confec-kanban-repo';
import { dataHojeBrasil, formatDataHoraBrasil, formatDateTimeBR } from '@/src/utils/format';

const PAGINA_LARGURA = 595.28;
const PAGINA_ALTURA = 841.89;
const MARGEM = 40;
const LARGURA = PAGINA_LARGURA - MARGEM * 2;
const TOPO = 748;
const BASE = 48;

type Rgb = [number, number, number];

const COR_TINTA: Rgb = [0.12, 0.16, 0.22];
const COR_SUAVE: Rgb = [0.35, 0.39, 0.45];
const COR_LINHA: Rgb = [0.82, 0.84, 0.88];
const COR_CABECALHO: Rgb = [0.1, 0.14, 0.2];
const COR_FAIXA: Rgb = [0.93, 0.95, 0.98];

const LARGURA_FONTE: Record<string, number> = {};
function definirLargura(chars: string, valor: number) {
  for (const char of chars) LARGURA_FONTE[char] = valor;
}
definirLargura(' ijltI.,:;\'|!', 250);
definirLargura('fr', 333);
definirLargura('s', 500);
definirLargura('abcdeghknopquvxyz', 556);
definirLargura('J', 500);
definirLargura('0123456789', 556);
definirLargura('ABCEFKLNPRSTUVXYZ', 667);
definirLargura('DGOHQ', 722);
definirLargura('Mw', 833);
definirLargura('W', 944);
definirLargura('m', 833);
definirLargura(' ', 278);
definirLargura('-–—/', 333);

function larguraTexto(texto: string, tamanho: number, negrito: boolean): number {
  let total = 0;
  for (const char of texto) {
    const base = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    total += LARGURA_FONTE[base] ?? LARGURA_FONTE[char] ?? 520;
  }
  return ((total * tamanho) / 1000) * (negrito ? 1.06 : 1);
}

function quebrar(texto: string, tamanho: number, negrito: boolean, maximo: number): string[] {
  const saida: string[] = [];
  const blocos = texto.replace(/\r/g, '').split('\n');
  for (const bloco of blocos) {
    const palavras = bloco.split(/\s+/).filter(Boolean);
    if (!palavras.length) {
      saida.push('');
      continue;
    }
    let linha = '';
    for (const palavra of palavras) {
      const tentativa = linha ? `${linha} ${palavra}` : palavra;
      if (larguraTexto(tentativa, tamanho, negrito) <= maximo) {
        linha = tentativa;
        continue;
      }
      if (linha) saida.push(linha);
      if (larguraTexto(palavra, tamanho, negrito) <= maximo) {
        linha = palavra;
        continue;
      }
      let pedaco = '';
      for (const char of palavra) {
        if (pedaco && larguraTexto(pedaco + char, tamanho, negrito) > maximo) {
          saida.push(pedaco);
          pedaco = char;
        } else pedaco += char;
      }
      linha = pedaco;
    }
    if (linha) saida.push(linha);
  }
  return saida.length ? saida : [''];
}

const WINANSI: Record<number, number> = {
  0x20ac: 0x80,
  0x2026: 0x85,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
};

function codigoWinAnsi(char: string): number {
  const ponto = char.codePointAt(0) ?? 63;
  if (ponto >= 32 && ponto <= 126) return ponto;
  if (ponto >= 160 && ponto <= 255) return ponto;
  return WINANSI[ponto] ?? 63;
}

function escaparPdf(texto: string): string {
  let saida = '';
  for (const char of texto) {
    const codigo = codigoWinAnsi(char);
    if (codigo === 40 || codigo === 41 || codigo === 92) saida += `\\${String.fromCharCode(codigo)}`;
    else if (codigo < 32 || codigo > 126) saida += `\\${codigo.toString(8).padStart(3, '0')}`;
    else saida += String.fromCharCode(codigo);
  }
  return saida;
}

function numero(valor: number): string {
  return (Math.round(valor * 100) / 100).toString();
}

function corPdf(cor: Rgb): string {
  return `${numero(cor[0])} ${numero(cor[1])} ${numero(cor[2])}`;
}

function utf16Hex(texto: string): string {
  let hex = 'FEFF';
  for (const char of texto) hex += (char.codePointAt(0) ?? 0).toString(16).padStart(4, '0');
  return `<${hex}>`;
}

class RelatorioPdf {
  private paginas: string[] = [];
  private comandos: string[] = [];
  private y = TOPO;

  private novaPagina() {
    if (this.comandos.length) this.paginas.push(this.comandos.join('\n'));
    this.comandos = [];
    this.y = TOPO;
  }

  private garantir(altura: number) {
    if (this.y - altura < BASE) this.novaPagina();
  }

  paragrafo(
    texto: string,
    opcoes?: { tamanho?: number; negrito?: boolean; cor?: Rgb; recuo?: number; espacoDepois?: number },
  ) {
    const tamanho = opcoes?.tamanho ?? 10;
    const negrito = opcoes?.negrito ?? false;
    const recuo = opcoes?.recuo ?? 0;
    const entrelinha = tamanho + 4;
    const linhas = quebrar(texto, tamanho, negrito, LARGURA - recuo);
    for (const item of linhas) {
      this.garantir(entrelinha);
      this.comandos.push(
        'BT',
        `${corPdf(opcoes?.cor ?? COR_TINTA)} rg`,
        `/${negrito ? 'F2' : 'F1'} ${numero(tamanho)} Tf`,
        `1 0 0 1 ${numero(MARGEM + recuo)} ${numero(this.y)} Tm`,
        `(${escaparPdf(item)}) Tj`,
        'ET',
      );
      this.y -= entrelinha;
    }
    this.y -= opcoes?.espacoDepois ?? 4;
  }

  faixaColuna(titulo: string, quantidade: number) {
    this.garantir(36);
    const y = this.y - 4;
    this.comandos.push(
      `${corPdf(COR_FAIXA)} rg`,
      `${numero(MARGEM)} ${numero(y - 14)} ${numero(LARGURA)} 22 re f`,
      `${corPdf(COR_LINHA)} RG`,
      '0.6 w',
      `${numero(MARGEM)} ${numero(y - 14)} ${numero(LARGURA)} 22 re S`,
    );
    this.y = y;
    this.paragrafo(`${titulo}  ·  ${quantidade} ${quantidade === 1 ? 'demanda' : 'demandas'}`, {
      tamanho: 12,
      negrito: true,
      espacoDepois: 8,
    });
  }

  linha() {
    this.garantir(10);
    const y = this.y + 2;
    this.comandos.push(
      `${corPdf(COR_LINHA)} RG`,
      '0.6 w',
      `${numero(MARGEM)} ${numero(y)} m ${numero(MARGEM + LARGURA)} ${numero(y)} l S`,
    );
    this.y -= 10;
  }

  espaco(pontos: number) {
    if (this.y - pontos < BASE) this.novaPagina();
    else this.y -= pontos;
  }

  finalizar(geradoEm: string): Uint8Array {
    if (this.comandos.length || this.paginas.length === 0) this.paginas.push(this.comandos.join('\n'));
    const total = this.paginas.length;
    const desenhos = this.paginas.map((conteudo, indice) => `${moldura(indice + 1, total, geradoEm)}\n${conteudo}`);
    return montarPdf(desenhos, 'Kanban Confec — quadro');
  }
}

function moldura(pagina: number, total: number, geradoEm: string): string {
  return [
    `${corPdf(COR_CABECALHO)} rg`,
    `0 800 ${numero(PAGINA_LARGURA)} 42 re f`,
    'BT',
    '1 1 1 rg',
    '/F2 12 Tf',
    `1 0 0 1 ${numero(MARGEM)} 816 Tm`,
    '(AZOUP) Tj',
    '/F1 9 Tf',
    `1 0 0 1 ${numero(MARGEM + 320)} 816 Tm`,
    `(${escaparPdf('Kanban Confec')}) Tj`,
    'ET',
    `${corPdf(COR_LINHA)} RG`,
    '0.4 w',
    `${numero(MARGEM)} 36 m ${numero(MARGEM + LARGURA)} 36 l S`,
    'BT',
    `${corPdf(COR_SUAVE)} rg`,
    '/F1 8 Tf',
    `1 0 0 1 ${numero(MARGEM)} 24 Tm`,
    `(${escaparPdf(geradoEm)}) Tj`,
    `1 0 0 1 ${numero(MARGEM + 430)} 24 Tm`,
    `(${escaparPdf(`Página ${pagina} de ${total}`)}) Tj`,
    'ET',
  ].join('\n');
}

function montarPdf(paginas: string[], titulo: string): Uint8Array {
  const objetos: string[] = [];
  const reservar = (corpo: string) => {
    objetos.push(corpo);
    return objetos.length;
  };
  const fonteRegular = reservar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fonteNegrito = reservar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const conteudos = paginas.map((pagina) => {
    const dados = `${pagina}\n`;
    return reservar(`<< /Length ${dados.length} >>\nstream\n${dados}endstream`);
  });
  const folhas = conteudos.map((conteudo) =>
    reservar(
      `<< /Type /Page /Parent PAGINAS 0 R /MediaBox [0 0 ${numero(PAGINA_LARGURA)} ${numero(PAGINA_ALTURA)}] /Contents ${conteudo} 0 R /Resources << /Font << /F1 ${fonteRegular} 0 R /F2 ${fonteNegrito} 0 R >> >> >>`,
    ),
  );
  const paginasId = reservar(`<< /Type /Pages /Kids [${folhas.map((id) => `${id} 0 R`).join(' ')}] /Count ${folhas.length} >>`);
  const catalogo = reservar(`<< /Type /Catalog /Pages ${paginasId} 0 R >>`);
  const info = reservar(`<< /Title ${utf16Hex(titulo)} /Author ${utf16Hex('Azoup')} /Producer (Painel Azoup) >>`);
  for (let i = 0; i < folhas.length; i++) {
    objetos[folhas[i] - 1] = objetos[folhas[i] - 1].replace('PAGINAS', `${paginasId}`);
  }
  void info;

  let corpo = '%PDF-1.4\n';
  const offsets = [0];
  objetos.forEach((objeto, indice) => {
    offsets.push(corpo.length);
    corpo += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
  });
  const xref = corpo.length;
  corpo += `xref\n0 ${objetos.length + 1}\n`;
  corpo += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) corpo += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
  corpo += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const bytes = new Uint8Array(corpo.length);
  for (let i = 0; i < corpo.length; i++) bytes[i] = corpo.charCodeAt(i) & 0xff;
  return bytes;
}

function textoLimpo(valor?: string | null): string {
  return `${valor ?? ''}`.replace(/\s+/g, ' ').trim();
}

function clienteLinha(card: ConfecCard): string {
  const empresa = textoLimpo(card.cliente_empresa) || textoLimpo(card.cliente_empresa_razao);
  const nome = textoLimpo(card.cliente_nome);
  if (empresa && nome) return `${empresa} · ${nome}`;
  return empresa || nome || 'Cliente não informado';
}

function secaoLinha(card: ConfecCard): string {
  const partes = [
    textoLimpo(card.secao),
    textoLimpo(card.tela) ? `${textoLimpo(card.tela)}${card.tela_nova ? ' (nova)' : ''}` : '',
  ].filter(Boolean);
  return partes.join(' · ');
}

export type QuadroPdfInput = {
  colunas: ConfecColuna[];
  porColuna: Map<string, ConfecCard[]>;
  filtrosResumo?: string[];
};

export function gerarPdfQuadroConfec(input: QuadroPdfInput): Uint8Array {
  const geradoEmMs = Date.now();
  const geradoEm = `Gerado em ${formatDataHoraBrasil(new Date(geradoEmMs).toISOString())}`;
  const pdf = new RelatorioPdf();
  const total = input.colunas.reduce((acc, coluna) => acc + (input.porColuna.get(coluna.slug)?.length ?? 0), 0);

  pdf.paragrafo('Status das demandas — Kanban Confec', { tamanho: 18, negrito: true, espacoDepois: 4 });
  pdf.paragrafo(
    'Relatório organizado pelas colunas do quadro, com as demandas visíveis nos filtros atuais.',
    { tamanho: 10, cor: COR_SUAVE, espacoDepois: 8 },
  );
  pdf.paragrafo(`Total de demandas: ${total}`, { tamanho: 11, negrito: true, espacoDepois: 2 });
  if (input.filtrosResumo?.length) {
    pdf.paragrafo(`Filtros: ${input.filtrosResumo.join(' · ')}`, {
      tamanho: 9,
      cor: COR_SUAVE,
      espacoDepois: 10,
    });
  } else {
    pdf.paragrafo('Filtros: nenhum (quadro completo)', { tamanho: 9, cor: COR_SUAVE, espacoDepois: 10 });
  }

  for (const coluna of input.colunas) {
    const cards = input.porColuna.get(coluna.slug) ?? [];
    pdf.faixaColuna(coluna.title, cards.length);
    if (!cards.length) {
      pdf.paragrafo('Nenhuma demanda nesta coluna com os filtros atuais.', {
        tamanho: 10,
        cor: COR_SUAVE,
        espacoDepois: 10,
      });
      continue;
    }

    cards.forEach((card, indice) => {
      pdf.linha();
      pdf.paragrafo(`${indice + 1}. #${numeroTicket(card.ticket_number)}  ${textoLimpo(card.title) || 'Sem título'}`, {
        tamanho: 11,
        negrito: true,
        espacoDepois: 2,
      });
      pdf.paragrafo(`Cliente: ${clienteLinha(card)}`, { tamanho: 10, espacoDepois: 1 });
      const secao = secaoLinha(card);
      if (secao) pdf.paragrafo(`Área: ${secao}`, { tamanho: 9, cor: COR_SUAVE, espacoDepois: 1 });
      const etiquetas = (card.etiquetas ?? []).map((e) => e.name).filter(Boolean);
      if (etiquetas.length) {
        pdf.paragrafo(`Etiquetas: ${etiquetas.join(', ')}`, { tamanho: 9, cor: COR_SUAVE, espacoDepois: 1 });
      }
      pdf.paragrafo(`Criado em: ${formatDateTimeBR(card.created_at)}`, { tamanho: 9, cor: COR_SUAVE, espacoDepois: 1 });
      if (card.completed_at) {
        pdf.paragrafo(`Concluído em: ${formatDateTimeBR(card.completed_at)}`, {
          tamanho: 9,
          cor: COR_SUAVE,
          espacoDepois: 1,
        });
      }
      const descricao = textoLimpo(card.description);
      pdf.paragrafo('Descrição', { tamanho: 9, negrito: true, espacoDepois: 1 });
      pdf.paragrafo(descricao || 'Sem descrição.', { tamanho: 10, espacoDepois: 8 });
    });
    pdf.espaco(6);
  }

  return pdf.finalizar(geradoEm);
}

export function abrirPdfQuadroConfec(input: QuadroPdfInput): void {
  if (typeof window === 'undefined') throw new Error('Abra o painel no navegador para gerar o PDF.');
  const bytes = gerarPdfQuadroConfec(input);
  const nome = `kanban-confec-quadro-${dataHojeBrasil()}.pdf`;
  const arquivo = new File([bytes], nome, { type: 'application/pdf' });
  const pdfUrl = URL.createObjectURL(arquivo);
  const pagina = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Kanban Confec</title><style>html,body{margin:0;height:100%;background:#f4f5f7;font-family:Arial,sans-serif}header{height:52px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 16px;background:#1a2433;color:#fff}a{color:#1a2433;background:#fff;text-decoration:none;font-weight:700;padding:8px 14px;border-radius:8px}iframe{display:block;width:100%;height:calc(100% - 52px);border:0;background:#fff}</style></head><body><header><strong>Kanban Confec — quadro</strong><a href="${pdfUrl}" download="${nome}">Baixar PDF</a></header><iframe src="${pdfUrl}" title="Kanban Confec"></iframe></body></html>`;
  const abaUrl = URL.createObjectURL(new Blob([pagina], { type: 'text/html;charset=utf-8' }));
  window.setTimeout(() => {
    URL.revokeObjectURL(pdfUrl);
    URL.revokeObjectURL(abaUrl);
  }, 15 * 60_000);
  const aba = window.open(abaUrl, '_blank');
  if (aba) {
    aba.opener = null;
    return;
  }
  const link = document.createElement('a');
  link.href = pdfUrl;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
