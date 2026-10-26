import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOME_CONEXAO = 'azoup confec';
const MAX_PAGINAS = 4;
const POR_PAGINA = 50;

type AdminRow = { id: string; email: string; role: string; active?: boolean | null };

type Chamado = {
  id: string;
  protocolo: string | null;
  assunto: string | null;
  aberto: boolean;
  inicio: string | null;
  fim: string | null;
  contactId: string;
  departmentId: string;
  comentario: string | null;
};

type Mensagem = {
  id: string;
  texto: string;
  deEquipe: boolean;
  em: string | null;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function env(name: string): string {
  const v = Deno.env.get(name)?.trim() ?? '';
  if (!v) throw new Error(`Secret ${name} ausente`);
  return v;
}

function envAny(names: string[]): string {
  for (const name of names) {
    const v = Deno.env.get(name)?.trim() ?? '';
    if (v) return v;
  }
  throw new Error(`Secret ${names[0]} ausente`);
}

function falha(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function digisacBase(): string {
  return envAny(['DIGISAC_BASE_URL', 'DIGISAC_API_URL']).replace(/\/$/, '').replace(/\/api\/v1$/i, '');
}

function digisacToken(): string {
  return envAny(['DIGISAC_TOKEN', 'DIGISAC_API_TOKEN']);
}

function semAcento(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

function digitsOnlyPhone(value: string): string {
  return value.replace(/\D/g, '');
}

function telefoneDigisac(celular?: string | null, telefone?: string | null): string | null {
  const bruto = `${celular ?? ''}`.trim() || `${telefone ?? ''}`.trim();
  if (!bruto) return null;
  let digits = digitsOnlyPhone(bruto);
  if (!digits) return null;
  while (digits.startsWith('0')) digits = digits.slice(1);
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  if (digits.length < 12 || digits.length > 15) return null;
  return digits;
}

function asRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

function pickId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as { id?: unknown; data?: { id?: unknown } };
  const id = row.id ?? row.data?.id;
  return id ? `${id}` : null;
}

function mensagemErro(data: unknown, text: string): string {
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message?: unknown }).message;
    return typeof message === 'string' ? message : JSON.stringify(message);
  }
  return text.slice(0, 500);
}

function ultimaPagina(data: unknown): number {
  if (!data || typeof data !== 'object') return NaN;
  const last = Number((data as { lastPage?: unknown }).lastPage);
  return Number.isFinite(last) ? last : NaN;
}

async function digisac(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${digisacBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${digisacToken()}`,
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`Digisac ${res.status}: ${mensagemErro(data, text)}`);
  }
  return data;
}

async function listarPaginas(path: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let page = 1; page <= 10; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const data = await digisac(`${path}${sep}perPage=50&page=${page}`);
    const rows = asRows(data);
    out.push(...rows);
    const last = ultimaPagina(data);
    if (rows.length < 50 || (Number.isFinite(last) && page >= last)) break;
  }
  return out;
}

function acharPorNome(rows: Record<string, unknown>[], nome: string): Record<string, unknown> | null {
  const alvo = semAcento(nome);
  const iguais = rows.filter((row) => semAcento(`${row.name ?? ''}`) === alvo);
  return iguais.find((row) => !row.archivedAt) ?? iguais[0] ?? null;
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) falha('Não autenticado', 401);

  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = env('SUPABASE_ANON_KEY');
  const userJwt = auth.slice(7);

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData.user?.email) falha('Sessão inválida', 401);

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const email = userData.user.email.trim().toLowerCase();
  const { data: admin, error: adminErr } = await supabaseAdmin
    .from('admin_users')
    .select('id,email,role,active')
    .ilike('email', email)
    .maybeSingle();

  if (adminErr) throw adminErr;
  if (!admin || (admin as AdminRow).active === false) falha('Admin inativo ou não encontrado', 403);
  return { supabaseAdmin };
}

function assuntoDoChamado(row: Record<string, unknown>): string | null {
  const raw = row.ticketTopics ?? row.ticket_topics ?? row.topics;
  if (!Array.isArray(raw)) return null;
  const nomes = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const topic = item as Record<string, unknown>;
      return `${topic.name ?? topic.title ?? topic.nome ?? ''}`.trim();
    })
    .filter(Boolean);
  return nomes.length ? nomes.join(', ') : null;
}

function textoLivre(value: unknown): string | null {
  if (typeof value === 'string') {
    const texto = value.trim();
    return texto || null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  if (Array.isArray(value)) {
    const partes = value.map(textoLivre).filter((item): item is string => Boolean(item));
    return partes.length ? partes.join('\n') : null;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return textoLivre(obj.comments ?? obj.comment ?? obj.text ?? obj.body ?? obj.message ?? obj.observation ?? obj.notes);
  }
  return null;
}

function jsonObjeto(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return null;
  const bruto = value.trim();
  if (!bruto.startsWith('{') && !bruto.startsWith('[')) return null;
  try {
    const lido = JSON.parse(bruto) as unknown;
    return lido && typeof lido === 'object' && !Array.isArray(lido) ? (lido as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function comentarioDoTicket(row: Record<string, unknown>): string | null {
  return (
    textoLivre(row.comments) ||
    textoLivre(row.comment) ||
    textoLivre(row.observations) ||
    textoLivre(row.notes) ||
    textoLivre(row.closingComment) ||
    textoLivre(row.lastComment)
  );
}

function comentarioDeMensagem(row: Record<string, unknown>): { fechar: string | null; interno: string | null } {
  const tipo = `${row.type ?? ''}`.trim().toLowerCase();
  const texto = `${row.text ?? row.body ?? ''}`.trim();
  const data = jsonObjeto(row.data);
  const evento = `${data?.type ?? data?.event ?? data?.action ?? data?.name ?? ''}`.toLowerCase();
  const doEvento = textoLivre(data?.comments ?? data?.comment ?? data?.text ?? data?.message);
  const fechou = tipo === 'ticket' || evento.includes('close') || evento.includes('end');
  return {
    fechar: fechou ? doEvento : null,
    interno: tipo === 'comment' || tipo === 'annotation' ? textoLivre(texto) || doEvento : null,
  };
}

async function buscarComentarioFinalizacao(ticketId: string): Promise<string | null> {
  const query = {
    where: { ticketId },
    order: [['createdAt', 'DESC']],
    page: 1,
    perPage: 40,
  };
  const data = await digisac(`/api/v1/messages?query=${encodeURIComponent(JSON.stringify(query))}`);
  let interno: string | null = null;
  for (const row of asRows(data)) {
    const achado = comentarioDeMensagem(row);
    if (achado.fechar) return achado.fechar;
    if (achado.interno && !interno) interno = achado.interno;
  }
  return interno;
}

function linhaChamado(clienteId: string, chamado: Chamado, departmentId?: string | null, agora = new Date().toISOString()) {
  return {
    cliente_id: clienteId,
    ticket_id: chamado.id,
    contact_id: chamado.contactId || null,
    protocolo: chamado.protocolo,
    assunto: chamado.assunto,
    aberto: chamado.aberto,
    inicio: chamado.inicio,
    fim: chamado.fim,
    department_id: chamado.departmentId || departmentId || null,
    comentario_finalizacao: chamado.comentario,
    updated_at: agora,
  };
}

async function upsertChamados(
  supabaseAdmin: ReturnType<typeof createClient>,
  linhas: ReturnType<typeof linhaChamado>[],
): Promise<void> {
  if (!linhas.length) return;
  const tentar = (payload: unknown[]) =>
    supabaseAdmin.from('admin_digisac_chamados').upsert(payload, { onConflict: 'cliente_id,ticket_id' });
  let { error } = await tentar(linhas);
  if (error && /comentario_finalizacao/i.test(error.message)) {
    ({ error } = await tentar(linhas.map(({ comentario_finalizacao: _c, ...resto }) => resto)));
  }
  if (error) {
    if (/admin_digisac_chamados|schema cache/i.test(error.message)) {
      console.error('[digisac-historico] tabela de chamados ausente');
      return;
    }
    throw new Error(error.message);
  }
}

async function preencherComentariosChamados(
  supabaseAdmin: ReturnType<typeof createClient>,
  chamados: Array<{ clienteId: string; chamado: Chamado }>,
  limite: number,
): Promise<void> {
  const porCliente = new Map<string, Chamado>();
  for (const item of chamados) {
    if (item.chamado.aberto) continue;
    const atual = porCliente.get(item.clienteId);
    const inicio = item.chamado.inicio ?? '';
    if (!atual || inicio > (atual.inicio ?? '')) porCliente.set(item.clienteId, item.chamado);
  }
  let n = 0;
  for (const [clienteId, chamado] of porCliente) {
    if (n >= limite) break;
    if (chamado.comentario) continue;
    n += 1;
    try {
      const comentario = await buscarComentarioFinalizacao(chamado.id);
      if (!comentario) continue;
      chamado.comentario = comentario;
      const { error } = await supabaseAdmin
        .from('admin_digisac_chamados')
        .update({ comentario_finalizacao: comentario, updated_at: new Date().toISOString() })
        .eq('cliente_id', clienteId)
        .eq('ticket_id', chamado.id);
      if (error && !/comentario_finalizacao|schema cache/i.test(error.message)) {
        console.error('[digisac-historico] comentario', error.message);
      }
    } catch (erro) {
      console.error('[digisac-historico] comentario', erro instanceof Error ? erro.message : erro);
    }
  }
}

function mapChamado(row: Record<string, unknown>): Chamado | null {
  const id = `${row.id ?? ''}`.trim();
  if (!id) return null;
  const protocolo = `${row.protocol ?? ''}`.trim();
  const inicio = `${row.startedAt ?? row.createdAt ?? ''}`.trim();
  const fim = `${row.endedAt ?? ''}`.trim();
  const contactId = idCampo(row.contactId);
  const departmentId = idCampo(row.departmentId) || idCampo(row.department);
  return {
    id,
    protocolo: protocolo || null,
    assunto: assuntoDoChamado(row),
    aberto: row.isOpen === true,
    inicio: inicio || null,
    fim: fim || null,
    contactId,
    departmentId,
    comentario: comentarioDoTicket(row),
  };
}

async function consultarTickets(contactId: string, comTopicos: boolean, page: number): Promise<unknown> {
  const query: Record<string, unknown> = {
    where: { contactId },
    order: [['startedAt', 'DESC']],
    page,
    perPage: POR_PAGINA,
  };
  const include: unknown[] = [];
  if (comTopicos) include.push('ticketTopics');
  if (include.length) query.include = include;
  return digisac(`/api/v1/tickets?query=${encodeURIComponent(JSON.stringify(query))}`);
}

async function listarTickets(contactId: string, departmentId: string, maxPaginas = MAX_PAGINAS): Promise<Chamado[]> {
  const vistos = new Set<string>();
  const out: Chamado[] = [];
  let comTopicos = true;
  for (let page = 1; page <= maxPaginas; page++) {
    let data: unknown;
    try {
      data = await consultarTickets(contactId, comTopicos, page);
    } catch (erro) {
      if (!comTopicos || page !== 1) throw erro;
      comTopicos = false;
      page = 0;
      continue;
    }
    const rows = asRows(data);
    for (const row of rows) {
      const chamado = mapChamado(row);
      if (!chamado || vistos.has(chamado.id)) continue;
      if (!chamadoNoDepartamento(row, departmentId)) continue;
      vistos.add(chamado.id);
      out.push(chamado);
    }
    const last = ultimaPagina(data);
    if (rows.length < POR_PAGINA || (Number.isFinite(last) && page >= last)) break;
  }
  return out;
}

function chamadoNoDepartamento(row: Record<string, unknown>, departmentId: string): boolean {
  const id = idCampo(row.departmentId) || idCampo(row.department);
  if (id && id === departmentId) return true;
  if (!row.department || typeof row.department !== 'object') return false;
  return semAcento(`${(row.department as { name?: unknown }).name ?? ''}`) === semAcento(NOME_CONEXAO);
}

function idCampo(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return `${value}`.trim();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return `${(value as { id?: unknown }).id ?? ''}`.trim();
  }
  return '';
}

function nacional(numero: string): string {
  const digits = numero.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) return digits.slice(2);
  return digits;
}

function comNonoDigito(numero: string): string {
  if (numero.length === 10) return `${numero.slice(0, 2)}9${numero.slice(2)}`;
  return numero;
}

function telefonesIguais(contato: string | null, cliente: string | null): boolean {
  if (!contato || !cliente) return false;
  const a = nacional(contato);
  const b = nacional(cliente);
  if (a.length < 8 || b.length < 8) return false;
  if (a === b) return true;
  if (a.length >= 10 && b.length >= 10 && comNonoDigito(a) === comNonoDigito(b)) return true;
  return a.slice(0, 2) === b.slice(0, 2) && a.slice(-8) === b.slice(-8);
}

function telefonesIguaisForte(contato: string | null, cliente: string | null): boolean {
  if (!contato || !cliente) return false;
  const a = nacional(contato);
  const b = nacional(cliente);
  if (a.length < 10 || b.length < 10) return false;
  if (a === b) return true;
  return comNonoDigito(a) === comNonoDigito(b);
}

function numeroDeTexto(value: unknown): string | null {
  if (typeof value === 'number') return telefoneDigisac(null, `${value}`);
  if (typeof value !== 'string') return null;
  const bruto = value.trim();
  if (!bruto) return null;
  const dominio = (bruto.split('@')[1] ?? '').toLowerCase();
  const semServico = (bruto.split('@')[0] ?? bruto).split(':')[0] ?? bruto;
  const digits = digitsOnlyPhone(semServico);
  if (dominio.startsWith('lid')) {
    const trecho = digits.match(/55\d{10,11}/)?.[0];
    return trecho ? telefoneDigisac(null, trecho) : null;
  }
  const direto = telefoneDigisac(null, semServico);
  if (direto) return direto;
  const trecho = digits.match(/55\d{10,11}/)?.[0] ?? digits.match(/\d{10,11}/)?.[0];
  return trecho ? telefoneDigisac(null, trecho) : null;
}

const CAMPOS_TELEFONE = [
  'number',
  'phone',
  'phoneNumber',
  'phonenumber',
  'formattedNumber',
  'msisdn',
  'e164',
  'wid',
  'jid',
  'waId',
  'wa_id',
  'pn',
  'lidPn',
  'idFromService',
];

function numeroEmObjeto(obj: Record<string, unknown> | null | undefined): string | null {
  if (!obj) return null;
  for (const chave of CAMPOS_TELEFONE) {
    const atual = numeroDeTexto(obj[chave]);
    if (atual) return atual;
  }
  return null;
}

function objetoAninhado(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return null;
  const bruto = value.trim();
  if (!bruto.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(bruto) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function numeroDoContatoDigisac(row: Record<string, unknown>): string | null {
  const direto = numeroEmObjeto(row);
  if (direto) return direto;
  const data = objetoAninhado(row.data);
  const daData = numeroEmObjeto(data);
  if (daData) return daData;
  const interno = objetoAninhado(data?.contact) ?? objetoAninhado(row.contact);
  return numeroEmObjeto(interno);
}

function semParticulas(value: string): string {
  return semAcento(value).replace(/\b(de|da|do|das|dos|e)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function limparNomes(value: string): string[] {
  const bruto = value.trim();
  if (bruto.length < 3) return [];
  const semAspas = bruto.replace(/"[^"]*"/g, ' ').replace(/\s+/g, ' ').trim();
  const saida = new Set<string>();
  saida.add(bruto);
  if (semAspas.length >= 3) saida.add(semAspas);
  const tokens = semAspas.split(/\s+/).filter(Boolean);
  if (tokens.length >= 3) {
    const tres = tokens.slice(0, 3).join(' ');
    if (tres.length >= 8) saida.add(tres);
  }
  const palavras = semAspas.split(' ').filter((parte) => parte.length >= 3);
  if (palavras[0] && palavras[0].length >= 8) saida.add(palavras[0]);
  if (palavras.length >= 2) {
    const dois = `${palavras[0]} ${palavras[1]}`;
    if (dois.length >= 8) saida.add(dois);
  }
  const sem = semParticulas(semAspas);
  if (sem.length >= 8 && sem !== semAcento(semAspas)) saida.add(sem);
  return [...saida];
}

/** O nome da Digisac é o da pessoa, o da empresa, ou os dois separados por traço. */
function nomeCompativel(nomeDigisac: string, alvos: string[]): boolean {
  const nome = semAcento(nomeDigisac);
  if (!nome) return false;
  const partesBrutas = [nome, ...nome.split(/\s*-\s*/).map((parte) => parte.trim())].filter((parte) => parte.length >= 3);
  const partes = [...partesBrutas, ...partesBrutas.map(semParticulas).filter((parte) => parte.length >= 3)];
  for (const alvo of alvos) {
    const comparado = semAcento(alvo);
    const comparadoLimpo = semParticulas(alvo);
    if (comparado.length < 3) continue;
    if (partes.some((parte) => parte === comparado || parte === comparadoLimpo)) return true;
    if (comparado.length < 8 && comparadoLimpo.length < 8) continue;
    if (partes.some((parte) => {
      const base = comparado.length >= 8 ? comparado : comparadoLimpo;
      if (base.length < 8) return false;
      return parte.startsWith(`${base} `) || (parte.length >= 8 && base.startsWith(`${parte} `));
    })) {
      return true;
    }
  }
  return false;
}

function contatoDoClienteCombina(row: Record<string, unknown>, numeros: string[], nomes: string[]): boolean {
  const numeroContato = numeroDoContatoDigisac(row);
  if (numeroContato && numeros.some((numero) => telefonesIguais(numeroContato, numero))) return true;
  const name = `${row.name ?? ''}`.trim();
  const internal = `${row.internalName ?? ''}`.trim();
  if (name && nomeCompativel(name, nomes)) return true;
  const alternativa = `${row.alternativeName ?? ''}`.trim();
  if (alternativa && nomeCompativel(alternativa, nomes)) return true;
  if (internal && internal !== name && nomeCompativel(internal, nomes)) return true;
  return false;
}

function contatoUnico(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (row.id) return row;
  if (row.data && typeof row.data === 'object' && !Array.isArray(row.data)) {
    return row.data as Record<string, unknown>;
  }
  return null;
}

async function serviceAzoupConfec(): Promise<string> {
  const services = await listarPaginas('/api/v1/services');
  const service = acharPorNome(services, NOME_CONEXAO);
  const serviceId = service ? `${service.id ?? ''}`.trim() : '';
  if (!serviceId) throw new Error('Conexão Azoup Confec não encontrada na Digisac.');
  return serviceId;
}

async function departamentoAzoupConfec(): Promise<string> {
  const departments = await listarPaginas('/api/v1/departments');
  const department = acharPorNome(departments, NOME_CONEXAO);
  const departmentId = department ? `${department.id ?? ''}`.trim() : '';
  if (!departmentId) throw new Error('Departamento Azoup Confec não encontrado na Digisac.');
  return departmentId;
}

function termosDeTelefone(numero: string): string[] {
  const local = nacional(numero);
  const termos = new Set<string>();
  if (numero) termos.add(numero);
  if (local) termos.add(local);
  if (local.length >= 8) termos.add(local.slice(-8));
  if (local.length === 10 || local.length === 11) {
    const ddd = local.slice(0, 2);
    const resto = local.slice(2);
    const hifen = resto.length === 9 ? `${resto.slice(0, 5)}-${resto.slice(5)}` : `${resto.slice(0, 4)}-${resto.slice(4)}`;
    termos.add(hifen);
    termos.add(`${ddd} ${hifen}`);
    termos.add(`(${ddd}) ${hifen}`);
    termos.add(`(${ddd})${hifen}`);
    termos.add(`(${ddd}) ${resto}`);
    termos.add(`+55 ${ddd} ${hifen}`);
    termos.add(`+55${local}`);
    termos.add(`+${numero}`);
  }
  if (local.length === 10) {
    termos.add(comNonoDigito(local));
    termos.add(`55${comNonoDigito(local)}`);
  }
  if (local.length === 11 && local[2] === '9') {
    const semNove = `${local.slice(0, 2)}${local.slice(3)}`;
    termos.add(semNove);
    termos.add(`55${semNove}`);
  }
  return [...termos].filter((termo) => termo.length >= 8);
}

async function hidratarContato(id: string): Promise<Record<string, unknown> | null> {
  try {
    return contatoUnico(await digisac(`/api/v1/contacts/${encodeURIComponent(id)}`));
  } catch (erro) {
    console.error('[digisac-historico] hidratar contato', erro instanceof Error ? erro.message : erro);
    return null;
  }
}

function contatoNaConexao(row: Record<string, unknown>, serviceId: string): boolean {
  const atual = idCampo(row.serviceId) || idCampo(row.service);
  if (atual === serviceId) return true;
  const servico = row.service && typeof row.service === 'object' && !Array.isArray(row.service)
    ? (row.service as { name?: unknown; id?: unknown })
    : null;
  if (servico && semAcento(`${servico.name ?? ''}`) === semAcento(NOME_CONEXAO)) return true;
  return !atual;
}

function contatoConfereTelefone(row: Record<string, unknown>, numero: string): boolean {
  const atual = numeroDoContatoDigisac(row);
  return Boolean(atual && telefonesIguais(atual, numero));
}

function contatoConfereTelefoneForte(row: Record<string, unknown>, numero: string): boolean {
  const atual = numeroDoContatoDigisac(row);
  return Boolean(atual && telefonesIguaisForte(atual, numero));
}

const MARCA_NUMERO_OK = '__digisacNumeroOk';

async function buscarContatosPorTelefone(
  serviceId: string,
  numero: string,
  soEnvio = false,
): Promise<Record<string, unknown>[]> {
  const termos = termosDeTelefone(numero);
  if (!termos.length) return [];
  const cheios = termos.filter((termo) => termo.length >= 10);
  const curtos = termos.filter((termo) => termo.length === 8);
  const vistos = new Set<string>();
  const out: Record<string, unknown>[] = [];
  const puxar = async (rows: Record<string, unknown>[], confiarBusca = false) => {
    for (const row of rows) {
      const id = pickId(row);
      if (!id || vistos.has(id)) continue;
      const cheio = (await hidratarContato(id)) ?? row;
      if (soEnvio && !contatoNaConexao(cheio, serviceId)) continue;
      const forte = contatoConfereTelefoneForte(cheio, numero);
      const confere = forte || contatoConfereTelefone(cheio, numero);
      if (soEnvio) {
        if (!forte && !confiarBusca) continue;
      } else if (!confere && !confiarBusca) {
        continue;
      }
      vistos.add(id);
      cheio[MARCA_NUMERO_OK] = true;
      out.push(cheio);
    }
  };
  const consultar = async (or: Record<string, unknown>[], comServico: boolean) => {
    if (!or.length) return;
    try {
      await puxar(asRows(await digisac(
        `/api/v1/contacts?query=${encodeURIComponent(JSON.stringify({
          where: comServico ? { serviceId, $or: or } : { $or: or },
          perPage: 20,
          page: 1,
        }))}`,
      )));
    } catch (erro) {
      console.error('[digisac-historico] busca telefone', erro instanceof Error ? erro.message : erro);
    }
  };
  const consultarNumero = async (comServico: boolean) => {
    const exatos = (soEnvio ? [numero, nacional(numero)].filter((termo, i, all) => termo.length >= 10 && all.indexOf(termo) === i) : cheios)
      .filter((termo) => /^\+?\d{10,15}$/.test(termo))
      .slice(0, 4);
    for (const termo of exatos) {
      const qs = comServico
        ? `number=${encodeURIComponent(termo)}&serviceId=${encodeURIComponent(serviceId)}&perPage=10`
        : `number=${encodeURIComponent(termo)}&perPage=10`;
      try {
        await puxar(asRows(await digisac(`/api/v1/contacts?${qs}`)), true);
      } catch (erro) {
        console.error('[digisac-historico] busca telefone', erro instanceof Error ? erro.message : erro);
      }
      if (out.length) break;
    }
  };

  const orNumber = (lista: string[]) => lista.map((termo) => ({ number: { $iLike: `%${termo}%` } }));
  const orId = (lista: string[]) => lista.map((termo) => ({ idFromService: { $iLike: `%${termo}%` } }));
  const termosEnvio = cheios.filter((termo) => digitsOnlyPhone(termo).length >= 10);
  await consultar([...orNumber(soEnvio ? termosEnvio : cheios), ...orId(soEnvio ? termosEnvio : cheios)], true);
  if (!out.length) await consultar(orNumber(soEnvio ? termosEnvio : cheios), true);
  if (!out.length) await consultarNumero(true);
  if (!soEnvio) {
    if (!out.length) await consultar([...orNumber(cheios), ...orId(cheios)], false);
    if (!out.length) await consultarNumero(false);
    if (!out.length) await consultar([...orNumber(curtos), ...orId(curtos)], true);
    if (!out.length) await consultar([...orNumber(curtos), ...orId(curtos)], false);
  }
  return out;
}

async function buscarContatosPorNome(serviceId: string, termo: string): Promise<Record<string, unknown>[]> {
  const limpo = termo.replace(/[%_\\]/g, '').trim();
  if (limpo.length < 3) return [];
  const like = `%${limpo}%`;
  const vistos = new Set<string>();
  const out: Record<string, unknown>[] = [];
  try {
    const rows = asRows(await digisac(
      `/api/v1/contacts?query=${encodeURIComponent(JSON.stringify({
        where: {
          serviceId,
          $or: [
            { name: { $iLike: like } },
            { internalName: { $iLike: like } },
            { alternativeName: { $iLike: like } },
          ],
        },
        perPage: 20,
        page: 1,
      }))}`,
    ));
    for (const row of rows) {
      const id = pickId(row);
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      const cheio = (await hidratarContato(id)) ?? row;
      if (!contatoNaConexao(cheio, serviceId)) continue;
      out.push(cheio);
    }
  } catch (erro) {
    console.error('[digisac-historico] busca nome', erro instanceof Error ? erro.message : erro);
  }
  return out;
}

async function buscarContatosNosChamados(
  departmentId: string,
  numeros: string[],
): Promise<Record<string, unknown>[]> {
  if (!numeros.length) return [];
  const vistos = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (let page = 1; page <= 6; page++) {
    let data: unknown;
    const base = { order: [['updatedAt', 'DESC']] as [string, string][], page, perPage: 50, where: { departmentId } };
    try {
      data = await digisac(`/api/v1/tickets?query=${encodeURIComponent(JSON.stringify({ ...base, include: ['contact'] }))}`);
    } catch {
      data = await digisac(`/api/v1/tickets?query=${encodeURIComponent(JSON.stringify(base))}`);
    }
    const rows = asRows(data);
    for (const row of rows) {
      const embutido = row.contact && typeof row.contact === 'object' && !Array.isArray(row.contact)
        ? (row.contact as Record<string, unknown>)
        : null;
      const contactId = pickId(embutido) || idCampo(row.contactId);
      if (!contactId || vistos.has(contactId)) continue;
      let contato = embutido;
      let numero = contato ? numeroDoContatoDigisac(contato) : null;
      if (numero && !numeros.some((item) => telefonesIguais(numero, item))) continue;
      contato = (await hidratarContato(contactId)) ?? contato;
      if (!contato) continue;
      numero = numeroDoContatoDigisac(contato);
      if (!numero || !numeros.some((item) => telefonesIguais(numero, item))) continue;
      contato[MARCA_NUMERO_OK] = true;
      vistos.add(contactId);
      out.push(contato);
    }
    const last = ultimaPagina(data);
    if (rows.length < 50 || (Number.isFinite(last) && page >= last)) break;
  }
  return out;
}

type ExtraContato = { id: string; telefone: string; contactIds: string[]; envioContactId: string | null };

async function gravarContactIdExtra(
  supabaseAdmin: ReturnType<typeof createClient>,
  extraId: string,
  contactId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('admin_digisac_telefones')
    .update({ contact_id: contactId })
    .eq('id', extraId);
  if (error && !/contact_id|schema cache|admin_digisac_telefones/i.test(error.message)) {
    console.error('[digisac-historico] extra contact_id', error.message);
  }
}

function extrasPublicos(extras: ExtraContato[], chamados: Chamado[]) {
  return extras.map((extra) => ({
    telefone: extra.telefone,
    contactId: extra.contactIds[0] ?? null,
    chamados: chamados.filter((chamado) => extra.contactIds.includes(chamado.contactId)).length,
  }));
}

async function listarExtrasDoCliente(
  supabaseAdmin: ReturnType<typeof createClient>,
  clienteId: string,
): Promise<ExtraContato[]> {
  const tentar = (colunas: string) =>
    supabaseAdmin.from('admin_digisac_telefones').select(colunas).eq('cliente_id', clienteId);
  let { data, error } = await tentar('id,telefone,contact_id');
  if (error && /contact_id/i.test(error.message)) {
    ({ data, error } = await tentar('id,telefone'));
  }
  if (error) {
    if (!/admin_digisac_telefones|schema cache/i.test(error.message)) throw new Error(error.message);
    return [];
  }
  const out: ExtraContato[] = [];
  for (const row of data ?? []) {
    const id = `${(row as { id?: string }).id ?? ''}`.trim();
    const telefone = telefoneDigisac(null, (row as { telefone?: string | null }).telefone)
      ?? `${(row as { telefone?: string | null }).telefone ?? ''}`.trim();
    const salvo = `${(row as { contact_id?: string | null }).contact_id ?? ''}`.trim();
    if (!id || !telefone) continue;
    out.push({ id, telefone, contactIds: salvo ? [salvo] : [], envioContactId: null });
  }
  return out;
}

async function numeroCadastroCliente(
  supabaseAdmin: ReturnType<typeof createClient>,
  clienteId: string,
): Promise<string | null> {
  let clienteQuery = await supabaseAdmin
    .from('clientes_azoup')
    .select('telefone, celular')
    .eq('id', clienteId)
    .maybeSingle();
  if (clienteQuery.error && /celular/i.test(clienteQuery.error.message)) {
    clienteQuery = await supabaseAdmin
      .from('clientes_azoup')
      .select('telefone')
      .eq('id', clienteId)
      .maybeSingle();
  }
  if (clienteQuery.error) throw new Error(clienteQuery.error.message);
  const row = clienteQuery.data as { telefone?: string | null; celular?: string | null } | null;
  if (!row) falha('Cliente não encontrado', 404);
  return telefoneDigisac(row.celular, row.telefone);
}

async function contactIdParaMensagem(
  supabaseAdmin: ReturnType<typeof createClient>,
  clienteId: string,
  extraId: string,
): Promise<string> {
  let numero: string | null = null;
  if (extraId) {
    const extras = await listarExtrasDoCliente(supabaseAdmin, clienteId);
    const extra = extras.find((item) => item.id === extraId);
    if (!extra) falha('Contato extra não encontrado', 404);
    numero = telefoneDigisac(null, extra.telefone);
  } else {
    numero = await numeroCadastroCliente(supabaseAdmin, clienteId);
  }
  if (!numero) falha('Telefone inválido para envio', 400);

  const serviceId = await serviceAzoupConfec();
  const rows = await buscarContatosPorTelefone(serviceId, numero, true);
  const ids: string[] = [];
  for (const row of rows) {
    if (!contatoNaConexao(row, serviceId)) continue;
    const atual = numeroDoContatoDigisac(row);
    if (atual && !telefonesIguaisForte(atual, numero)) continue;
    if (!atual && row[MARCA_NUMERO_OK] !== true) continue;
    const id = pickId(row);
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (ids.length === 1) return ids[0];
  if (ids.length > 1) falha('Há mais de um contato com este telefone na Azoup Confec', 409);
  falha('Nenhum contato deste telefone na conexão Azoup Confec', 404);
}

type ContatosCliente = {
  situacao: 'sem_telefone' | 'sem_contato' | null;
  contactIds: string[];
  extras: ExtraContato[];
  envioContactId: string | null;
};

async function contatosDoCliente(
  supabaseAdmin: ReturnType<typeof createClient>,
  clienteId: string,
): Promise<ContatosCliente> {
  const vazio = (situacao: ContatosCliente['situacao'], extras: ExtraContato[]): ContatosCliente => ({
    situacao,
    contactIds: [],
    extras,
    envioContactId: null,
  });
  let clienteQuery = await supabaseAdmin
    .from('clientes_azoup')
    .select('id, nome, telefone, celular')
    .eq('id', clienteId)
    .maybeSingle();
  if (clienteQuery.error && /celular/i.test(clienteQuery.error.message)) {
    clienteQuery = await supabaseAdmin
      .from('clientes_azoup')
      .select('id, nome, telefone')
      .eq('id', clienteId)
      .maybeSingle();
  }
  if (clienteQuery.error) throw new Error(clienteQuery.error.message);
  const cliente = clienteQuery.data;
  if (!cliente) falha('Cliente não encontrado', 404);

  const { data: empresas, error: empErr } = await supabaseAdmin
    .from('empresas')
    .select('nome_fantasia, razao_social, empresa_matriz')
    .eq('cliente_id', clienteId)
    .limit(20);
  if (empErr) throw new Error(empErr.message);

  const nomes = new Set<string>();
  const pessoa = `${(cliente as { nome?: string | null }).nome ?? ''}`.trim();
  for (const nome of limparNomes(pessoa)) nomes.add(nome);
  const empresasOrd = [...(empresas ?? [])].sort((a, b) => {
    const am = (a as { empresa_matriz?: boolean | null }).empresa_matriz ? 0 : 1;
    const bm = (b as { empresa_matriz?: boolean | null }).empresa_matriz ? 0 : 1;
    return am - bm;
  });
  for (const empresa of empresasOrd) {
    const row = empresa as { nome_fantasia?: string | null; razao_social?: string | null };
    const fantasia = `${row.nome_fantasia ?? ''}`.trim();
    const razao = `${row.razao_social ?? ''}`.trim();
    if (fantasia) for (const nome of limparNomes(fantasia)) nomes.add(nome);
    if (razao) for (const nome of limparNomes(razao)) nomes.add(nome);
  }
  const alvos = [...nomes];
  const extras = await listarExtrasDoCliente(supabaseAdmin, clienteId);
  const numeros = new Set<string>();
  const telCadastro = (cliente as { telefone?: string | null }).telefone;
  const celCadastro = (cliente as { celular?: string | null }).celular;
  const principal = telefoneDigisac(celCadastro, telCadastro);
  const outroCadastro = telefoneDigisac(null, telCadastro);
  if (principal) numeros.add(principal);
  if (outroCadastro) numeros.add(outroCadastro);
  for (const extra of extras) numeros.add(extra.telefone);
  const listaNumeros = [...numeros];
  const numerosCadastro = [...new Set([principal, outroCadastro].filter((item): item is string => Boolean(item)))];
  if (!listaNumeros.length && !alvos.length) return vazio('sem_telefone', extras);

  const serviceId = await serviceAzoupConfec();
  const vistos = new Set<string>();
  const porId = new Map<string, Record<string, unknown>>();
  const aceitar = (
    row: Record<string, unknown> | null,
    numero?: string | null,
    soEnvio = false,
  ): string | null => {
    if (!row) return null;
    const id = pickId(row);
    if (!id) return null;
    if (soEnvio && !contatoNaConexao(row, serviceId)) return null;
    if (!soEnvio && vistos.has(id)) return id;
    if (numero) {
      if (!contatoConfereTelefone(row, numero) && row[MARCA_NUMERO_OK] !== true) return null;
    } else if (!contatoDoClienteCombina(row, listaNumeros, alvos)) {
      return null;
    }
    porId.set(id, row);
    if (!soEnvio) vistos.add(id);
    return id;
  };

  const envio = await supabaseAdmin
    .from('admin_digisac_envio')
    .select('contact_id')
    .eq('cliente_id', clienteId)
    .maybeSingle();
  const salvo = !envio.error
    ? `${(envio.data as { contact_id?: string | null } | null)?.contact_id ?? ''}`.trim()
    : '';
  let envioContactId = salvo ? aceitar(await hidratarContato(salvo), principal, true) : null;

  const principalIds: string[] = [];
  for (const numero of numerosCadastro) {
    for (const row of await buscarContatosPorTelefone(serviceId, numero)) {
      const id = aceitar(row, numero);
      if (id) principalIds.push(id);
    }
  }

  for (const extra of extras) {
    const confirmados: string[] = [];
    for (const contactId of extra.contactIds) {
      const id = aceitar(await hidratarContato(contactId), extra.telefone);
      if (id) confirmados.push(id);
    }
    if (!confirmados.length) {
      for (const row of await buscarContatosPorTelefone(serviceId, extra.telefone)) {
        const id = aceitar(row, extra.telefone);
        if (id) confirmados.push(id);
      }
    }
    extra.contactIds = [...new Set(confirmados)];
    if (extra.contactIds[0]) await gravarContactIdExtra(supabaseAdmin, extra.id, extra.contactIds[0]);
  }

  const nomeIds: string[] = [];
  if (vistos.size < 15) {
    const nomesBusca = [...alvos].sort((a, b) => b.length - a.length).slice(0, 8);
    const nomesAchados = await Promise.all(nomesBusca.map((nome) => buscarContatosPorNome(serviceId, nome)));
    for (const lista of nomesAchados) {
      for (const row of lista) {
        const id = aceitar(row);
        if (id) nomeIds.push(id);
        if (vistos.size >= 15) break;
      }
      if (vistos.size >= 15) break;
    }
  }

  const idsPorTelefone = new Set([...principalIds, ...extras.flatMap((extra) => extra.contactIds)]);
  if (!idsPorTelefone.size && listaNumeros.length) {
    const departmentId = await departamentoAzoupConfec();
    for (const row of await buscarContatosNosChamados(departmentId, listaNumeros)) {
      const numero = numeroDoContatoDigisac(row);
      const alvo = numero ? listaNumeros.find((item) => telefonesIguais(numero, item)) : null;
      const id = aceitar(row, alvo);
      if (id && alvo && numerosCadastro.includes(alvo)) principalIds.push(id);
    }
  }

  const extraIds = extras.flatMap((extra) => extra.contactIds);
  const naConexao = (id: string | null | undefined) => {
    if (!id) return false;
    const row = porId.get(id);
    return Boolean(row && contatoNaConexao(row, serviceId));
  };
  for (const extra of extras) {
    extra.envioContactId = extra.contactIds.find((id) => naConexao(id)) ?? null;
  }
  if (!envioContactId) {
    envioContactId = principalIds.find((id) => naConexao(id)) ?? null;
  }

  const contactIds = [...new Set([
    ...(envioContactId ? [envioContactId] : []),
    ...principalIds,
    ...extraIds,
    ...nomeIds,
    ...vistos,
  ])];
  if (!contactIds.length) return vazio('sem_contato', extras);
  return { situacao: null, contactIds, extras, envioContactId };
}

const ROTULO_ARQUIVO: Record<string, string> = {
  image: 'Imagem',
  audio: 'Áudio',
  ptt: 'Áudio',
  voice: 'Áudio',
  video: 'Vídeo',
  document: 'Arquivo',
  sticker: 'Figurinha',
  location: 'Localização',
  vcard: 'Contato',
  contact: 'Contato',
};

function mapMensagem(row: Record<string, unknown>, ticketId: string): Mensagem | null {
  const id = `${row.id ?? ''}`.trim();
  if (!id) return null;
  const doTicket = `${row.ticketId ?? row.ticket_id ?? ''}`.trim();
  if (doTicket && doTicket !== ticketId) return null;
  const tipo = `${row.type ?? 'chat'}`.trim().toLowerCase();
  const textoBruto = `${row.text ?? row.body ?? ''}`.trim();
  const rotulo = ROTULO_ARQUIVO[tipo];
  let texto = textoBruto || 'Mensagem';
  if (rotulo) texto = textoBruto ? `${rotulo}: ${textoBruto}` : rotulo;
  else if (tipo === 'comment' || tipo === 'annotation') texto = textoBruto || 'Comentário';
  const em = `${row.createdAt ?? row.timestamp ?? row.sentAt ?? ''}`.trim();
  return {
    id,
    texto,
    deEquipe: row.isFromMe === true,
    em: em || null,
  };
}

async function listarMensagens(contactIds: string[], ticketId: string, departmentId: string): Promise<Mensagem[]> {
  const ticket = await digisac(`/api/v1/tickets/${encodeURIComponent(ticketId)}`);
  const row = (ticket && typeof ticket === 'object' ? ticket : {}) as Record<string, unknown>;
  const dono = idCampo(row.contactId);
  if (!pickId(ticket) || !contactIds.includes(dono) || !chamadoNoDepartamento(row, departmentId)) {
    falha('Chamado não encontrado para este cliente', 404);
  }

  const vistos = new Set<string>();
  const out: Mensagem[] = [];
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const query = {
      where: { ticketId },
      order: [['createdAt', 'ASC']],
      page,
      perPage: POR_PAGINA,
    };
    const data = await digisac(`/api/v1/messages?query=${encodeURIComponent(JSON.stringify(query))}`);
    const rows = asRows(data);
    for (const item of rows) {
      const mensagem = mapMensagem(item, ticketId);
      if (!mensagem || vistos.has(mensagem.id)) continue;
      vistos.add(mensagem.id);
      out.push(mensagem);
    }
    const last = ultimaPagina(data);
    if (rows.length < POR_PAGINA || (Number.isFinite(last) && page >= last)) break;
  }
  out.sort((a, b) => {
    const ta = a.em ? Date.parse(a.em) : 0;
    const tb = b.em ? Date.parse(b.em) : 0;
    return ta - tb;
  });
  return out;
}

function chamadoPublico(chamado: Chamado) {
  return {
    id: chamado.id,
    protocolo: chamado.protocolo,
    assunto: chamado.assunto,
    aberto: chamado.aberto,
    inicio: chamado.inicio,
    fim: chamado.fim,
    comentario: chamado.comentario,
  };
}

async function gravarChamados(
  supabaseAdmin: ReturnType<typeof createClient>,
  clienteId: string,
  chamados: Chamado[],
): Promise<void> {
  const agora = new Date().toISOString();
  if (chamados.length) {
    await upsertChamados(
      supabaseAdmin,
      chamados.map((chamado) => linhaChamado(clienteId, chamado, chamado.departmentId, agora)),
    );
    await preencherComentariosChamados(
      supabaseAdmin,
      chamados.map((chamado) => ({ clienteId, chamado })),
      8,
    );
  }

  const { data: atuais, error: listErr } = await supabaseAdmin
    .from('admin_digisac_chamados')
    .select('ticket_id')
    .eq('cliente_id', clienteId);
  if (listErr) {
    if (/admin_digisac_chamados|schema cache/i.test(listErr.message)) return;
    throw new Error(listErr.message);
  }
  const manter = new Set(chamados.map((chamado) => chamado.id));
  const remover = (atuais ?? [])
    .map((row) => `${(row as { ticket_id?: string }).ticket_id ?? ''}`)
    .filter((id) => id && !manter.has(id));
  if (!remover.length) return;
  const { error: delErr } = await supabaseAdmin
    .from('admin_digisac_chamados')
    .delete()
    .eq('cliente_id', clienteId)
    .in('ticket_id', remover);
  if (delErr) throw new Error(delErr.message);
}

type ClienteIndice = { id: string; numeros: string[]; nomes: string[] };

async function indiceDeClientes(supabaseAdmin: ReturnType<typeof createClient>): Promise<{
  porContato: Map<string, string>;
  clientes: ClienteIndice[];
}> {
  const porContato = new Map<string, string>();
  const marcarContato = (contactId: string, clienteId: string) => {
    const contato = contactId.trim();
    const cliente = clienteId.trim();
    if (!contato || !cliente) return;
    const atual = porContato.get(contato);
    if (atual && atual !== cliente) porContato.set(contato, '');
    else porContato.set(contato, cliente);
  };

  const chamados = await supabaseAdmin.from('admin_digisac_chamados').select('cliente_id,contact_id').limit(5000);
  if (!chamados.error) {
    for (const row of chamados.data ?? []) {
      marcarContato(`${(row as { contact_id?: string }).contact_id ?? ''}`, `${(row as { cliente_id?: string }).cliente_id ?? ''}`);
    }
  }
  const envios = await supabaseAdmin.from('admin_digisac_envio').select('cliente_id,contact_id').limit(5000);
  if (!envios.error) {
    for (const row of envios.data ?? []) {
      marcarContato(`${(row as { contact_id?: string }).contact_id ?? ''}`, `${(row as { cliente_id?: string }).cliente_id ?? ''}`);
    }
  }

  let pessoas = await supabaseAdmin.from('clientes_azoup').select('id,nome,telefone,celular').limit(2000);
  if (pessoas.error && /celular/i.test(pessoas.error.message)) {
    pessoas = await supabaseAdmin.from('clientes_azoup').select('id,nome,telefone').limit(2000);
  }
  const { error } = pessoas;
  if (error) throw new Error(error.message);
  const { data: empresas } = await supabaseAdmin.from('empresas').select('cliente_id,nome_fantasia,razao_social').limit(4000);
  let extras = await supabaseAdmin.from('admin_digisac_telefones').select('cliente_id,telefone,contact_id').limit(4000);
  if (extras.error && /contact_id/i.test(extras.error.message)) {
    extras = await supabaseAdmin.from('admin_digisac_telefones').select('cliente_id,telefone').limit(4000);
  }
  const nomesPorCliente = new Map<string, string[]>();
  const numerosPorCliente = new Map<string, string[]>();
  for (const row of empresas ?? []) {
    const id = `${(row as { cliente_id?: string }).cliente_id ?? ''}`;
    const nomes = nomesPorCliente.get(id) ?? [];
    for (const nome of limparNomes(`${(row as { nome_fantasia?: string }).nome_fantasia ?? ''}`)) nomes.push(nome);
    for (const nome of limparNomes(`${(row as { razao_social?: string }).razao_social ?? ''}`)) nomes.push(nome);
    nomesPorCliente.set(id, nomes);
  }
  for (const row of extras.error ? [] : extras.data ?? []) {
    const id = `${(row as { cliente_id?: string }).cliente_id ?? ''}`;
    const numero = telefoneDigisac(null, (row as { telefone?: string }).telefone);
    const contato = `${(row as { contact_id?: string }).contact_id ?? ''}`.trim();
    if (contato) marcarContato(contato, id);
    if (!numero) continue;
    const lista = numerosPorCliente.get(id) ?? [];
    lista.push(numero);
    numerosPorCliente.set(id, lista);
  }

  const clientes: ClienteIndice[] = [];
  for (const row of pessoas.data ?? []) {
    const id = `${(row as { id?: string }).id ?? ''}`;
    if (!id) continue;
    const numero = telefoneDigisac(
      (row as { celular?: string }).celular,
      (row as { telefone?: string }).telefone,
    );
    const outro = telefoneDigisac(null, (row as { telefone?: string }).telefone);
    const numeros = [...(numerosPorCliente.get(id) ?? [])];
    if (numero) numeros.push(numero);
    if (outro && outro !== numero) numeros.push(outro);
    const nomes = [...limparNomes(`${(row as { nome?: string }).nome ?? ''}`), ...(nomesPorCliente.get(id) ?? [])];
    clientes.push({ id, numeros, nomes });
  }
  return { porContato, clientes };
}

function clienteDoTicket(row: Record<string, unknown>, porContato: Map<string, string>, clientes: ClienteIndice[]): string | null {
  const contactId = idCampo(row.contactId);
  const conhecido = porContato.get(contactId);
  if (conhecido) return conhecido;
  const contato = row.contact && typeof row.contact === 'object' && !Array.isArray(row.contact)
    ? (row.contact as Record<string, unknown>)
    : null;
  if (!contato) return null;
  const achados = clientes.filter((cliente) => contatoDoClienteCombina(contato, cliente.numeros, cliente.nomes));
  if (achados.length !== 1) return null;
  return achados[0].id;
}

function diaDoChamado(valor: string): string | null {
  let t = valor.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2} /.test(t)) t = t.replace(' ', 'T');
  t = t.replace(/([+-]\d{2})$/, '$1:00');
  const data = new Date(t);
  if (Number.isNaN(data.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(data);
}

async function datasUltimoChamado(
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<Record<string, string>> {
  const { data, error } = await supabaseAdmin
    .from('admin_digisac_chamados')
    .select('cliente_id,inicio')
    .not('inicio', 'is', null)
    .order('inicio', { ascending: false })
    .limit(5000);
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) return {};
    throw new Error(error.message);
  }
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    const id = `${(row as { cliente_id?: string }).cliente_id ?? ''}`.trim();
    if (!id || map[id]) continue;
    const dia = diaDoChamado(`${(row as { inicio?: string }).inicio ?? ''}`);
    if (dia) map[id] = dia;
  }
  return map;
}

async function importarChamadosRecentes(
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<number> {
  const departmentId = await departamentoAzoupConfec();
  const base = { order: [['startedAt', 'DESC']] as [string, string][], perPage: 50 };
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; page <= 4; page++) {
    let data: unknown;
    try {
      data = await digisac(
        `/api/v1/tickets?query=${encodeURIComponent(JSON.stringify({ ...base, page, where: { departmentId }, include: ['contact'] }))}`,
      );
    } catch {
      data = await digisac(
        `/api/v1/tickets?query=${encodeURIComponent(JSON.stringify({ ...base, page, where: { departmentId } }))}`,
      );
    }
    const pagina = asRows(data);
    rows.push(...pagina);
    if (pagina.length < 50) break;
  }

  const { porContato, clientes } = await indiceDeClientes(supabaseAdmin);
  const faltando = [...new Set(rows.map((row) => idCampo(row.contactId)).filter((id) => id && !porContato.get(id)))].slice(0, 80);
  await Promise.all(
    faltando.map(async (contactId) => {
      try {
        const contato = contatoUnico(await digisac(`/api/v1/contacts/${encodeURIComponent(contactId)}`));
        if (!contato) return;
        const achados = clientes.filter((cliente) => contatoDoClienteCombina(contato, cliente.numeros, cliente.nomes));
        if (achados.length === 1) porContato.set(contactId, achados[0].id);
      } catch (erro) {
        console.error('[digisac-historico] contato do chamado', erro instanceof Error ? erro.message : erro);
      }
    }),
  );

  const porCliente = new Map<string, Chamado[]>();
  for (const row of rows) {
    const chamado = mapChamado(row);
    if (!chamado) continue;
    const departamento = idCampo(row.departmentId) || idCampo(row.department);
    if (departamento && departamento !== departmentId) continue;
    const clienteId = clienteDoTicket(row, porContato, clientes);
    if (!clienteId) continue;
    const lista = porCliente.get(clienteId) ?? [];
    lista.push(chamado);
    porCliente.set(clienteId, lista);
  }

  const agora = new Date().toISOString();
  const pares = [...porCliente.entries()].flatMap(([clienteId, chamados]) =>
    chamados.map((chamado) => ({ clienteId, chamado })),
  );
  const linhas = pares.map(({ clienteId, chamado }) => linhaChamado(clienteId, chamado, departmentId, agora));
  await upsertChamados(supabaseAdmin, linhas);
  await preencherComentariosChamados(supabaseAdmin, pares, 20);
  return linhas.length;
}

async function gravarChamadosSemApagar(
  supabaseAdmin: ReturnType<typeof createClient>,
  clienteId: string,
  chamados: Chamado[],
  departmentId: string,
): Promise<void> {
  if (!chamados.length) return;
  const agora = new Date().toISOString();
  await upsertChamados(
    supabaseAdmin,
    chamados.map((chamado) => linhaChamado(clienteId, chamado, departmentId, agora)),
  );
  await preencherComentariosChamados(
    supabaseAdmin,
    chamados.map((chamado) => ({ clienteId, chamado })),
    8,
  );
}

async function marcarBuscaDigisac(
  supabaseAdmin: ReturnType<typeof createClient>,
  clienteId: string,
  situacao: string,
): Promise<void> {
  const { error } = await supabaseAdmin.from('admin_digisac_busca').upsert(
    { cliente_id: clienteId, situacao, verificado_em: new Date().toISOString() },
    { onConflict: 'cliente_id' },
  );
  if (error && !/schema cache|does not exist|admin_digisac_busca/i.test(error.message)) {
    console.error('[digisac-historico] busca', error.message);
  }
}

/** Clientes sem chamado, ou com telefone extra novo, para puxar os tickets da Digisac. */
async function importarChamadosFaltantes(
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<number> {
  const departmentId = await departamentoAzoupConfec();
  const [pessoas, ja, buscas, extras] = await Promise.all([
    supabaseAdmin.from('clientes_azoup').select('id').limit(3000),
    supabaseAdmin.from('admin_digisac_chamados').select('cliente_id').limit(5000),
    supabaseAdmin.from('admin_digisac_busca').select('cliente_id,verificado_em').limit(3000),
    supabaseAdmin.from('admin_digisac_telefones').select('cliente_id,created_at').limit(4000),
  ]);
  if (pessoas.error) throw new Error(pessoas.error.message);
  const comChamado = new Set((ja.data ?? []).map((row) => `${(row as { cliente_id?: string }).cliente_id ?? ''}`));
  const buscaEm = new Map<string, number>();
  for (const row of buscas.error ? [] : buscas.data ?? []) {
    const id = `${(row as { cliente_id?: string }).cliente_id ?? ''}`.trim();
    const quando = Date.parse(`${(row as { verificado_em?: string }).verificado_em ?? ''}`);
    if (id && Number.isFinite(quando)) buscaEm.set(id, quando);
  }
  const extraEm = new Map<string, number>();
  if (!extras.error) {
    for (const row of extras.data ?? []) {
      const id = `${(row as { cliente_id?: string }).cliente_id ?? ''}`.trim();
      const quando = Date.parse(`${(row as { created_at?: string }).created_at ?? ''}`);
      if (!id || !Number.isFinite(quando)) continue;
      extraEm.set(id, Math.max(extraEm.get(id) ?? 0, quando));
    }
  }
  const limiteBusca = Date.now() - 12 * 3_600_000;
  const fila = (pessoas.data ?? [])
    .map((row) => `${(row as { id?: string }).id ?? ''}`.trim())
    .filter((id) => {
      if (!id) return false;
      const verificado = buscaEm.get(id) ?? 0;
      const extraNovo = (extraEm.get(id) ?? 0) > verificado;
      if (extraNovo) return true;
      if (comChamado.has(id)) return false;
      return verificado < limiteBusca;
    })
    .slice(0, 12);

  let gravados = 0;
  for (const clienteId of fila) {
    try {
      const contato = await contatosDoCliente(supabaseAdmin, clienteId);
      if (contato.situacao || !contato.contactIds.length) {
        await marcarBuscaDigisac(supabaseAdmin, clienteId, contato.situacao ?? 'sem_contato');
        continue;
      }
      const chamados: Chamado[] = [];
      const vistos = new Set<string>();
      for (const contactId of contato.contactIds) {
        for (const chamado of await listarTickets(contactId, departmentId, 2)) {
          if (vistos.has(chamado.id)) continue;
          vistos.add(chamado.id);
          chamados.push(chamado);
        }
      }
      if (!chamados.length) {
        await marcarBuscaDigisac(supabaseAdmin, clienteId, 'sem_chamados');
        continue;
      }
      await gravarChamadosSemApagar(supabaseAdmin, clienteId, chamados, departmentId);
      await marcarBuscaDigisac(supabaseAdmin, clienteId, 'ok');
      gravados += 1;
    } catch (erro) {
      console.error('[digisac-historico] cliente sem chamado', erro instanceof Error ? erro.message : erro);
      await marcarBuscaDigisac(supabaseAdmin, clienteId, 'erro');
    }
  }
  return gravados;
}

async function pendentesDeChamado(supabaseAdmin: ReturnType<typeof createClient>): Promise<number> {
  const [pessoas, ja, buscas] = await Promise.all([
    supabaseAdmin.from('clientes_azoup').select('id').limit(3000),
    supabaseAdmin.from('admin_digisac_chamados').select('cliente_id').limit(5000),
    supabaseAdmin.from('admin_digisac_busca').select('cliente_id,verificado_em').limit(3000),
  ]);
  if (pessoas.error) return 0;
  const comChamado = new Set((ja.data ?? []).map((row) => `${(row as { cliente_id?: string }).cliente_id ?? ''}`));
  const limiteBusca = Date.now() - 12 * 3_600_000;
  const buscado = new Set(
    (buscas.error ? [] : buscas.data ?? [])
      .filter((row) => Date.parse(`${(row as { verificado_em?: string }).verificado_em ?? ''}`) > limiteBusca)
      .map((row) => `${(row as { cliente_id?: string }).cliente_id ?? ''}`),
  );
  return (pessoas.data ?? [])
    .map((row) => `${(row as { id?: string }).id ?? ''}`)
    .filter((id) => id && !comChamado.has(id) && !buscado.has(id)).length;
}

async function refletirUltimoChamado(supabaseAdmin: ReturnType<typeof createClient>): Promise<void> {
  const { error } = await supabaseAdmin.rpc('painel_refletir_ultimo_chamado');
  if (error && !/schema cache|does not exist|could not find/i.test(error.message)) {
    console.error('[digisac-historico] refletir último chamado', error.message);
  }
}

async function sincronizarUltimosChamados(
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<{ atualizados: number; contatos: Record<string, string>; pendentes: number }> {
  let atualizados = 0;
  try {
    atualizados = await importarChamadosRecentes(supabaseAdmin);
  } catch (erro) {
    console.error('[digisac-historico] sync chamados', erro instanceof Error ? erro.message : erro);
  }
  try {
    atualizados += await importarChamadosFaltantes(supabaseAdmin);
  } catch (erro) {
    console.error('[digisac-historico] chamados faltantes', erro instanceof Error ? erro.message : erro);
  }
  let contatos: Record<string, string> = {};
  try {
    contatos = await datasUltimoChamado(supabaseAdmin);
  } catch (erro) {
    console.error('[digisac-historico] datas dos chamados', erro instanceof Error ? erro.message : erro);
  }
  await refletirUltimoChamado(supabaseAdmin);
  let pendentes = 0;
  try {
    pendentes = await pendentesDeChamado(supabaseAdmin);
  } catch (erro) {
    console.error('[digisac-historico] pendentes', erro instanceof Error ? erro.message : erro);
  }
  return { atualizados, contatos, pendentes };
}

function clienteIdDoPayload(payload: Record<string, unknown>): string {
  const clienteId = `${payload.clienteId ?? ''}`.trim();
  if (!/^[0-9a-f-]{36}$/i.test(clienteId)) falha('Cliente inválido');
  return clienteId;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não suportado' }, 405);

  try {
    const body = (await req.json()) as { op?: string; payload?: Record<string, unknown> };
    const op = `${body.op ?? ''}`.trim();
    const payload = body.payload ?? {};
    const { supabaseAdmin } = await requireAdmin(req);

    if (op === 'listar_chamados') {
      const clienteId = clienteIdDoPayload(payload);
      const [contato, departmentId] = await Promise.all([
        contatosDoCliente(supabaseAdmin, clienteId),
        departamentoAzoupConfec(),
      ]);
      if (contato.situacao) {
        await marcarBuscaDigisac(supabaseAdmin, clienteId, contato.situacao);
        return json({
          situacao: contato.situacao,
          chamados: [],
          extras: extrasPublicos(contato.extras, []),
        });
      }
      const vistos = new Set<string>();
      const chamados: Chamado[] = [];
      for (const contactId of contato.contactIds) {
        for (const chamado of await listarTickets(contactId, departmentId)) {
          if (vistos.has(chamado.id)) continue;
          vistos.add(chamado.id);
          chamados.push(chamado);
        }
      }
      chamados.sort((a, b) => {
        const ta = a.inicio ? Date.parse(a.inicio) : 0;
        const tb = b.inicio ? Date.parse(b.inicio) : 0;
        return tb - ta;
      });
      await gravarChamados(supabaseAdmin, clienteId, chamados);
      await refletirUltimoChamado(supabaseAdmin);
      await marcarBuscaDigisac(supabaseAdmin, clienteId, chamados.length ? 'ok' : 'sem_chamados');
      return json({
        situacao: chamados.length ? 'ok' : 'sem_chamados',
        chamados: chamados.map(chamadoPublico),
        extras: extrasPublicos(contato.extras, chamados),
      });
    }

    if (op === 'listar_mensagens') {
      const clienteId = clienteIdDoPayload(payload);
      const ticketId = `${payload.ticketId ?? ''}`.trim();
      if (!ticketId || ticketId.length > 80) falha('Chamado inválido');
      const [contato, departmentId] = await Promise.all([
        contatosDoCliente(supabaseAdmin, clienteId),
        departamentoAzoupConfec(),
      ]);
      if (contato.situacao || !contato.contactIds.length) falha('Chamado não encontrado para este cliente', 404);
      const mensagens = await listarMensagens(contato.contactIds, ticketId, departmentId);
      return json({ mensagens });
    }

    if (op === 'enviar_mensagem_pronta') {
      const clienteId = clienteIdDoPayload(payload);
      const texto = `${payload.texto ?? ''}`.trim();
      const extraId = `${payload.extraId ?? ''}`.trim();
      if (!texto || texto.length > 4000) falha('Mensagem inválida');
      if (extraId && !/^[0-9a-f-]{36}$/i.test(extraId)) falha('Contato extra inválido');
      const [contactId, departmentId] = await Promise.all([
        contactIdParaMensagem(supabaseAdmin, clienteId, extraId),
        departamentoAzoupConfec(),
      ]);
      const userId = pickId(await digisac('/api/v1/me'));
      if (!userId) falha('Token Digisac sem usuário');
      await digisac('/api/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          text: texto,
          type: 'chat',
          contactId,
          userId,
          origin: 'bot',
        }),
      });
      try {
        await digisac(`/api/v1/contacts/${encodeURIComponent(contactId)}/ticket/transfer`, {
          method: 'POST',
          body: JSON.stringify({ departmentId }),
        });
      } catch (erro) {
        console.error('[digisac-historico] transferir chamado', erro instanceof Error ? erro.message : erro);
      }
      return json({ ok: true });
    }

    if (op === 'sincronizar_ultimos_chamados') {
      const resultado = await sincronizarUltimosChamados(supabaseAdmin);
      return json(resultado);
    }

    return json({ error: `Operação desconhecida: ${op}` }, 400);
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro interno';
    console.error('[digisac-historico]', message);
    return json({ error: message }, status);
  }
});
