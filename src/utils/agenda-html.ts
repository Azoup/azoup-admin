export type TrechoAgenda = {
  text: string;
  bold: boolean;
  href?: string;
};

export type BlocoAgenda = {
  tipo: 'texto' | 'item';
  trechos: TrechoAgenda[];
};

function decodificar(texto: string): string {
  return texto
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\u00a0/g, ' ');
}

export function descricaoTemHtml(valor?: string | null): boolean {
  return /<\/?[a-z][^>]*>/i.test(`${valor ?? ''}`);
}

/** Converte o HTML simples da descrição do Google Agenda em blocos de texto. */
export function parseDescricaoAgenda(bruto?: string | null): BlocoAgenda[] {
  const html = `${bruto ?? ''}`.replace(/\r\n/g, '\n').trim();
  if (!html) return [];

  const blocos: BlocoAgenda[] = [];
  let trechos: TrechoAgenda[] = [];
  let tipo: BlocoAgenda['tipo'] = 'texto';
  let bold = 0;
  let href: string | undefined;

  const publicar = () => {
    const limpos = trechos
      .map((trecho) => ({ ...trecho, text: trecho.text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n') }))
      .filter((trecho) => trecho.text.length > 0);
    trechos = [];
    if (!limpos.length) return;
    limpos[0] = { ...limpos[0], text: limpos[0].text.replace(/^\s+/, '') };
    const ultimo = limpos.length - 1;
    limpos[ultimo] = { ...limpos[ultimo], text: limpos[ultimo].text.replace(/\s+$/, '') };
    const restantes = limpos.filter((trecho) => trecho.text.length > 0);
    if (restantes.some((trecho) => trecho.text.trim())) blocos.push({ tipo, trechos: restantes });
  };

  const acrescentar = (texto: string) => {
    const decodificado = decodificar(texto);
    if (!decodificado) return;
    const anterior = trechos[trechos.length - 1];
    const negrito = bold > 0;
    if (anterior && anterior.bold === negrito && anterior.href === href) {
      anterior.text += decodificado;
      return;
    }
    trechos.push({ text: decodificado, bold: negrito, href });
  };

  const re = /<\/?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    if (match[3] != null) {
      acrescentar(match[3].replace(/\n+/g, '\n'));
      continue;
    }
    const nome = match[1].toLowerCase();
    const fechando = match[0].startsWith('</');
    const attrs = match[2] ?? '';
    if (nome === 'br') {
      acrescentar('\n');
      continue;
    }
    if (nome === 'b' || nome === 'strong') {
      bold += fechando ? -1 : 1;
      if (bold < 0) bold = 0;
      continue;
    }
    if (nome === 'a') {
      if (fechando) {
        href = undefined;
      } else {
        const hrefMatch = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
        const url = hrefMatch?.[1] || hrefMatch?.[2] || '';
        href = /^https?:\/\//i.test(url) ? url : undefined;
      }
      continue;
    }
    if (nome === 'li') {
      if (!fechando) {
        publicar();
        tipo = 'item';
      } else {
        publicar();
        tipo = 'texto';
      }
      continue;
    }
    if (nome === 'p' || nome === 'div' || nome === 'ul' || nome === 'ol') {
      publicar();
      if (!fechando && nome !== 'ul' && nome !== 'ol') tipo = 'texto';
      continue;
    }
  }
  publicar();
  return blocos;
}
