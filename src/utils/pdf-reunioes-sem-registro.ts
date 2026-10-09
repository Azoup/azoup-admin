import { parseDescricaoAgenda } from '@/src/utils/agenda-html';
import type { ReuniaoSemRegistro } from '@/src/services/repos/google-agendamentos-repo';
import { dataCalendarioBrasil, dataHojeBrasil, formatDataHoraBrasil, formatYmdBR } from '@/src/utils/format';

const PAGINA_LARGURA = 595.28;
const PAGINA_ALTURA = 841.89;
const MARGEM = 40;
const LARGURA = PAGINA_LARGURA - MARGEM * 2;
const TOPO = 748;
const BASE = 48;

const COR_TINTA: Rgb = [0.12, 0.16, 0.22];
const COR_SUAVE: Rgb = [0.35, 0.39, 0.45];
const COR_LINHA: Rgb = [0.82, 0.84, 0.88];
const COR_CABECALHO: Rgb = [0.1, 0.14, 0.2];

type Rgb = [number, number, number];

type Linha = {
  texto: string;
  tamanho: number;
  negrito: boolean;
  cor: Rgb;
  x: number;
  recuo: number;
};

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
LARGURA_FONTE['"'] = 355;
LARGURA_FONTE['('] = 333;
LARGURA_FONTE[')'] = 333;

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
    const publicar = (valor: string) => {
      if (valor) saida.push(valor);
    };
    for (const palavra of palavras) {
      const tentativa = linha ? `${linha} ${palavra}` : palavra;
      if (larguraTexto(tentativa, tamanho, negrito) <= maximo) {
        linha = tentativa;
        continue;
      }
      publicar(linha);
      if (larguraTexto(palavra, tamanho, negrito) <= maximo) {
        linha = palavra;
        continue;
      }
      let pedaco = '';
      for (const char of palavra) {
        if (pedaco && larguraTexto(pedaco + char, tamanho, negrito) > maximo) {
          saida.push(pedaco);
          pedaco = char;
        } else {
          pedaco += char;
        }
      }
      linha = pedaco;
    }
    publicar(linha);
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

  private texto(linha: Linha) {
    const y = this.y;
    this.comandos.push(
      'BT',
      `${corPdf(linha.cor)} rg`,
      `/${linha.negrito ? 'F2' : 'F1'} ${numero(linha.tamanho)} Tf`,
      `1 0 0 1 ${numero(linha.x + linha.recuo)} ${numero(y)} Tm`,
      `(${escaparPdf(linha.texto)}) Tj`,
      'ET',
    );
  }

  private escrever(linhas: Linha[], entrelinha: number) {
    for (const linha of linhas) {
      this.garantir(entrelinha);
      this.texto(linha);
      this.y -= entrelinha;
    }
  }

  paragrafo(texto: string, opcoes?: { tamanho?: number; negrito?: boolean; cor?: Rgb; recuo?: number; espacoDepois?: number }) {
    const tamanho = opcoes?.tamanho ?? 10;
    const negrito = opcoes?.negrito ?? false;
    const recuo = opcoes?.recuo ?? 0;
    const entrelinha = tamanho + 4;
    const linhas = quebrar(texto, tamanho, negrito, LARGURA - recuo).map((item) => ({
      texto: item,
      tamanho,
      negrito,
      cor: opcoes?.cor ?? COR_TINTA,
      x: MARGEM,
      recuo,
    }));
    this.escrever(linhas, entrelinha);
    this.y -= opcoes?.espacoDepois ?? 4;
  }

  faixa(texto: string) {
    this.paragrafo(texto, { tamanho: 12, negrito: true, espacoDepois: 2 });
    this.linha();
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
    return montarPdf(desenhos, 'Reuniões sem registro');
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
    `1 0 0 1 ${numero(MARGEM + 360)} 816 Tm`,
    `(${escaparPdf('Reuniões sem registro')}) Tj`,
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

  objetos[paginasId - 1] = objetos[paginasId - 1];
  for (let i = 0; i < folhas.length; i++) {
    objetos[folhas[i] - 1] = objetos[folhas[i] - 1].replace('PAGINAS', `${paginasId}`);
  }

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

function textoDescricao(html?: string | null): string {
  const blocos = parseDescricaoAgenda(html);
  if (!blocos.length) return '';
  const texto = blocos
    .map((bloco) => {
      const linha = bloco.trechos
        .map((trecho) => {
          const limpo = trecho.text.replace(/[ \t]+\n/g, '\n').trim();
          if (!limpo) return '';
          if (trecho.href && !limpo.includes(trecho.href)) return `${limpo} (${trecho.href})`;
          return limpo;
        })
        .filter(Boolean)
        .join('');
      return bloco.tipo === 'item' ? `• ${linha}` : linha;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (texto.length <= 4000) return texto;
  return `${texto.slice(0, 4000).trim()}…`;
}

function rotuloVinculo(vinculo: ReuniaoSemRegistro['vinculo']): string {
  if (vinculo === 'email_auto') return 'Vinculado automaticamente pelo e-mail';
  if (vinculo === 'manual') return 'Vinculado manualmente';
  return 'Vinculo sem classificacao';
}

function duracao(item: ReuniaoSemRegistro): string {
  if (item.diaInteiro) return 'Dia inteiro';
  const inicio = new Date(item.inicio).getTime();
  const fim = new Date(item.fim).getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) return 'Nao informada';
  const minutos = Math.round((fim - inicio) / 60000);
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas && resto) return `${horas} h ${resto} min`;
  if (horas) return horas === 1 ? '1 h' : `${horas} h`;
  return `${resto} min`;
}

function diasDesde(inicio: string): string {
  const dia = dataCalendarioBrasil(inicio);
  const hoje = dataHojeBrasil();
  if (!dia) return '';
  const passado = Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${dia}T12:00:00Z`)) / 86_400_000);
  if (passado <= 0) return 'Hoje';
  if (passado === 1) return 'Ha 1 dia';
  return `Ha ${passado} dias`;
}

function quando(item: ReuniaoSemRegistro): string {
  if (item.diaInteiro) {
    const dia = dataCalendarioBrasil(item.inicio);
    return dia ? formatYmdBR(dia) : formatDataHoraBrasil(item.inicio);
  }
  const fim = item.fim ? formatDataHoraBrasil(item.fim) : '';
  const inicio = formatDataHoraBrasil(item.inicio);
  return fim && fim !== inicio ? `${inicio} ate ${fim}` : inicio;
}

function ordenar(itens: ReuniaoSemRegistro[]): ReuniaoSemRegistro[][] {
  const grupos = new Map<string, ReuniaoSemRegistro[]>();
  for (const item of itens) {
    const lista = grupos.get(item.clienteId) ?? [];
    lista.push(item);
    grupos.set(item.clienteId, lista);
  }
  return [...grupos.values()]
    .map((lista) => [...lista].sort((a, b) => (a.inicio < b.inicio ? 1 : -1)))
    .sort((a, b) => a[0].clienteNome.localeCompare(b[0].clienteNome, 'pt-BR'));
}

export function gerarPdfReunioesSemRegistro(itens: ReuniaoSemRegistro[]): Uint8Array {
  const grupos = ordenar(itens);
  const lista = grupos.flat();
  const geradoEm = `Gerado em ${formatDataHoraBrasil(new Date().toISOString())}`;
  const pdf = new RelatorioPdf();
  const maisAntiga = [...lista].sort((a, b) => (a.inicio < b.inicio ? -1 : 1))[0];
  const maisRecente = lista[0] ? [...lista].sort((a, b) => (a.inicio < b.inicio ? 1 : -1))[0] : undefined;

  pdf.paragrafo('Reuniões sem registro', { tamanho: 18, negrito: true, espacoDepois: 6 });
  pdf.paragrafo(
    'Reuniões dos últimos 90 dias que já aconteceram e ainda não têm registro no dia do cliente.',
    { tamanho: 10, cor: COR_SUAVE, espacoDepois: 10 },
  );
  pdf.faixa('Resumo');
  pdf.paragrafo(`Reuniões sem registro: ${lista.length}`);
  pdf.paragrafo(`Clientes: ${grupos.length}`);
  if (maisAntiga) pdf.paragrafo(`Mais antiga: ${quando(maisAntiga)}`);
  if (maisRecente) pdf.paragrafo(`Mais recente: ${quando(maisRecente)}`, { espacoDepois: 10 });

  pdf.faixa('Indice');
  lista.forEach((item, indice) => {
    const dia = item.diaInteiro
      ? formatYmdBR(dataCalendarioBrasil(item.inicio) ?? '')
      : formatDataHoraBrasil(item.inicio);
    pdf.paragrafo(`${indice + 1}. ${dia}  ${item.clienteNome}  —  ${item.titulo}`, { tamanho: 9, espacoDepois: 2 });
  });
  pdf.espaco(8);

  pdf.faixa('Detalhamento');
  let numeroItem = 0;
  for (const grupo of grupos) {
    const cliente = grupo[0];
    pdf.paragrafo(cliente.clienteNome, { tamanho: 13, negrito: true, espacoDepois: 2 });
    pdf.paragrafo(`E-mail: ${cliente.clienteEmail || 'Não informado'}`, { tamanho: 9, cor: COR_SUAVE, espacoDepois: 1 });
    pdf.paragrafo(`Telefone: ${cliente.clienteTelefone || 'Não informado'}`, { tamanho: 9, cor: COR_SUAVE, espacoDepois: 1 });
    pdf.paragrafo(
      grupo.length === 1 ? '1 reunião sem registro' : `${grupo.length} reuniões sem registro`,
      { tamanho: 9, cor: COR_SUAVE, espacoDepois: 6 },
    );
    for (const item of grupo) {
      numeroItem += 1;
      pdf.linha();
      pdf.paragrafo(`${numeroItem}. ${item.titulo}`, { tamanho: 11, negrito: true, espacoDepois: 3 });
      pdf.paragrafo(`Quando: ${quando(item)} (${diasDesde(item.inicio)})`, { tamanho: 10, espacoDepois: 1 });
      pdf.paragrafo(`Duração: ${duracao(item)}`, { tamanho: 10, espacoDepois: 1 });
      pdf.paragrafo(`Vínculo com o cliente: ${rotuloVinculo(item.vinculo)}`, { tamanho: 10, espacoDepois: 1 });
      pdf.paragrafo(
        `Participantes: ${item.participantes.length ? item.participantes.join(', ') : 'Não informados na agenda'}`,
        { tamanho: 10, espacoDepois: 1 },
      );
      if (item.linkAgenda) pdf.paragrafo(`Link da agenda: ${item.linkAgenda}`, { tamanho: 9, cor: COR_SUAVE, espacoDepois: 2 });
      const descricao = textoDescricao(item.descricao);
      pdf.paragrafo('Descrição da agenda', { tamanho: 10, negrito: true, espacoDepois: 2 });
      pdf.paragrafo(descricao || 'Sem descrição na agenda.', { tamanho: 10, espacoDepois: 8 });
    }
    pdf.espaco(6);
  }

  return pdf.finalizar(geradoEm);
}

export function abrirPdfReunioesSemRegistro(itens: ReuniaoSemRegistro[]): void {
  if (typeof window === 'undefined') throw new Error('Abra o painel no navegador para gerar o PDF.');
  const bytes = gerarPdfReunioesSemRegistro(itens);
  const nome = `reunioes-sem-registro-${dataHojeBrasil()}.pdf`;
  const arquivo = new File([bytes], nome, { type: 'application/pdf' });
  const pdfUrl = URL.createObjectURL(arquivo);
  const pagina = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Reuniões sem registro</title><style>html,body{margin:0;height:100%;background:#f4f5f7;font-family:Arial,sans-serif}header{height:52px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 16px;background:#1a2433;color:#fff}a{color:#1a2433;background:#fff;text-decoration:none;font-weight:700;padding:8px 14px;border-radius:8px}iframe{display:block;width:100%;height:calc(100% - 52px);border:0;background:#fff}</style></head><body><header><strong>Reuniões sem registro</strong><a href="${pdfUrl}" download="${nome}">Baixar PDF</a></header><iframe src="${pdfUrl}" title="Reuniões sem registro"></iframe></body></html>`;
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
