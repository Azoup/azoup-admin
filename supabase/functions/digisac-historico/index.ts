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

async function digisac(path: string): Promise<unknown> {
  const res = await fetch(`${digisacBase()}${path}`, {
    headers: {
      Authorization: `Bearer ${digisacToken()}`,
      Accept: 'application/json',
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
  return rows.find((row) => semAcento(`${row.name ?? ''}`) === alvo) ?? null;
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

function mapChamado(row: Record<string, unknown>): Chamado | null {
  const id = `${row.id ?? ''}`.trim();
  if (!id) return null;
  const protocolo = `${row.protocol ?? ''}`.trim();
  const inicio = `${row.startedAt ?? row.createdAt ?? ''}`.trim();
  const fim = `${row.endedAt ?? ''}`.trim();
  return {
    id,
    protocolo: protocolo || null,
    assunto: assuntoDoChamado(row),
    aberto: row.isOpen === true,
    inicio: inicio || null,
    fim: fim || null,
  };
}

async function consultarTickets(contactId: string, comTopicos: boolean, page: number): Promise<unknown> {
  const query: Record<string, unknown> = {
    where: { contactId },
    order: [['startedAt', 'DESC']],
    page,
    perPage: POR_PAGINA,
  };
  if (comTopicos) query.include = ['ticketTopics'];
  return digisac(`/api/v1/tickets?query=${encodeURIComponent(JSON.stringify(query))}`);
}

async function listarTickets(contactId: string): Promise<Chamado[]> {
  const vistos = new Set<string>();
  const out: Chamado[] = [];
  let comTopicos = true;
  for (let page = 1; page <= MAX_PAGINAS; page++) {
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
      vistos.add(chamado.id);
      out.push(chamado);
    }
    const last = ultimaPagina(data);
    if (rows.length < POR_PAGINA || (Number.isFinite(last) && page >= last)) break;
  }
  return out;
}

async function acharContato(numero: string | null, contactIdSalvo: string | null): Promise<string | null> {
  if (contactIdSalvo) {
    try {
      const row = await digisac(`/api/v1/contacts/${encodeURIComponent(contactIdSalvo)}`);
      const id = pickId(row);
      if (id) return id;
    } catch (erro) {
      console.error('[digisac-historico] contato salvo', erro instanceof Error ? erro.message : erro);
    }
  }
  if (!numero) return null;

  const services = await listarPaginas('/api/v1/services');
  const service = acharPorNome(services, NOME_CONEXAO);
  const serviceId = service ? `${service.id ?? ''}`.trim() : '';
  if (!serviceId) throw new Error('Conexão Azoup Confec não encontrada na Digisac.');

  const found = await digisac(
    `/api/v1/contacts?number=${encodeURIComponent(numero)}&serviceId=${encodeURIComponent(serviceId)}&perPage=5`,
  );
  return pickId(asRows(found)[0]);
}

async function contatoDoCliente(
  supabaseAdmin: ReturnType<typeof createClient>,
  clienteId: string,
): Promise<{ situacao: 'sem_telefone' | 'sem_contato' | null; contactId: string | null }> {
  const { data: cliente, error } = await supabaseAdmin
    .from('clientes_azoup')
    .select('id, telefone')
    .eq('id', clienteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!cliente) falha('Cliente não encontrado', 404);

  let contactIdSalvo: string | null = null;
  const envio = await supabaseAdmin
    .from('admin_digisac_envio')
    .select('contact_id')
    .eq('cliente_id', clienteId)
    .maybeSingle();
  if (!envio.error) {
    const salvo = `${(envio.data as { contact_id?: string | null } | null)?.contact_id ?? ''}`.trim();
    contactIdSalvo = salvo || null;
  }

  const numero = telefoneDigisac(null, (cliente as { telefone?: string | null }).telefone);
  if (!numero && !contactIdSalvo) return { situacao: 'sem_telefone', contactId: null };

  const contactId = await acharContato(numero, contactIdSalvo);
  if (!contactId) return { situacao: 'sem_contato', contactId: null };
  return { situacao: null, contactId };
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

async function listarMensagens(contactId: string, ticketId: string): Promise<Mensagem[]> {
  const ticket = await digisac(`/api/v1/tickets/${encodeURIComponent(ticketId)}`);
  const row = (ticket && typeof ticket === 'object' ? ticket : {}) as Record<string, unknown>;
  const dono = `${row.contactId ?? ''}`.trim();
  if (!pickId(ticket) || dono !== contactId) falha('Chamado não encontrado para este cliente', 404);

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
      const contato = await contatoDoCliente(supabaseAdmin, clienteId);
      if (contato.situacao) return json({ situacao: contato.situacao, chamados: [] });
      const chamados = await listarTickets(contato.contactId!);
      return json({
        situacao: chamados.length ? 'ok' : 'sem_chamados',
        chamados,
      });
    }

    if (op === 'listar_mensagens') {
      const clienteId = clienteIdDoPayload(payload);
      const ticketId = `${payload.ticketId ?? ''}`.trim();
      if (!ticketId || ticketId.length > 80) falha('Chamado inválido');
      const contato = await contatoDoCliente(supabaseAdmin, clienteId);
      if (contato.situacao || !contato.contactId) falha('Chamado não encontrado para este cliente', 404);
      const mensagens = await listarMensagens(contato.contactId, ticketId);
      return json({ mensagens });
    }

    return json({ error: `Operação desconhecida: ${op}` }, 400);
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro interno';
    console.error('[digisac-historico]', message);
    return json({ error: message }, status);
  }
});
