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

async function listarTickets(contactId: string, departmentId: string): Promise<Chamado[]> {
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
  if (a.length < 10 || b.length < 10) return false;
  return a === b || comNonoDigito(a) === comNonoDigito(b);
}

function numeroDeTexto(value: unknown): string | null {
  if (typeof value === 'number') return telefoneDigisac(null, `${value}`);
  if (typeof value !== 'string') return null;
  const bruto = value.trim();
  if (!bruto) return null;
  return telefoneDigisac(null, bruto.split('@')[0] ?? bruto);
}

function numeroDoContatoDigisac(row: Record<string, unknown>): string | null {
  const direto = numeroDeTexto(row.number) ?? numeroDeTexto(row.phone) ?? numeroDeTexto(row.idFromService);
  if (direto) return direto;
  const data = row.data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      return numeroDeTexto(parsed.number) ?? numeroDeTexto(parsed.phone);
    } catch {
      return null;
    }
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    return numeroDeTexto(obj.number) ?? numeroDeTexto(obj.phone);
  }
  return null;
}

function limparNomes(value: string): string[] {
  const bruto = value.trim();
  if (bruto.length < 3) return [];
  const semAspas = bruto.replace(/"[^"]*"/g, ' ').replace(/\s+/g, ' ').trim();
  const saida = new Set<string>();
  saida.add(bruto);
  if (semAspas.length >= 3) saida.add(semAspas);
  const palavras = semAspas.split(' ').filter((parte) => parte.length >= 3);
  if (palavras[0] && palavras[0].length >= 8) saida.add(palavras[0]);
  if (palavras.length >= 2) {
    const dois = `${palavras[0]} ${palavras[1]}`;
    if (dois.length >= 8) saida.add(dois);
  }
  return [...saida];
}

/** O nome da Digisac é o da pessoa, o da empresa, ou os dois separados por traço. */
function nomeCompativel(nomeDigisac: string, alvos: string[]): boolean {
  const nome = semAcento(nomeDigisac);
  if (!nome) return false;
  const partes = [nome, ...nome.split(/\s*-\s*/).map((parte) => parte.trim())].filter((parte) => parte.length >= 3);
  for (const alvo of alvos) {
    const comparado = semAcento(alvo);
    if (comparado.length < 3) continue;
    if (partes.some((parte) => parte === comparado)) return true;
    if (comparado.length < 8) continue;
    if (partes.some((parte) => parte.startsWith(`${comparado} `) || (parte.length >= 8 && comparado.startsWith(`${parte} `)))) {
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

async function buscarContatosPorTelefone(serviceId: string, numero: string): Promise<Record<string, unknown>[]> {
  const local = nacional(numero);
  const termos = new Set<string>();
  if (local.length >= 8) termos.add(local.slice(-8));
  if (numero) termos.add(numero);
  if (local.length === 10) termos.add(`55${comNonoDigito(local)}`);
  const vistos = new Set<string>();
  const out: Record<string, unknown>[] = [];
  const guardar = (rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const id = pickId(row);
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      out.push(row);
    }
  };

  for (const termo of termos) {
    const porCampo =
      `/api/v1/contacts?where[data.number][$iLike]=%${encodeURIComponent(termo)}%` +
      `&where[serviceId]=${encodeURIComponent(serviceId)}&perPage=20`;
    const porNumero =
      `/api/v1/contacts?number=${encodeURIComponent(termo)}&serviceId=${encodeURIComponent(serviceId)}&perPage=10`;
    for (const path of [porCampo, porNumero]) {
      try {
        guardar(asRows(await digisac(path)));
      } catch (erro) {
        console.error('[digisac-historico] busca telefone', erro instanceof Error ? erro.message : erro);
      }
    }
  }
  return out;
}

async function buscarContatosPorNome(serviceId: string, termo: string): Promise<Record<string, unknown>[]> {
  const limpo = termo.replace(/[%_\\]/g, '').trim();
  if (limpo.length < 3) return [];
  const like = `%${encodeURIComponent(limpo)}%`;
  const vistos = new Set<string>();
  const out: Record<string, unknown>[] = [];
  const guardar = (rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const id = pickId(row);
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      out.push(row);
    }
  };
  for (const campo of ['name', 'internalName', 'alternativeName']) {
    try {
      guardar(asRows(await digisac(
        `/api/v1/contacts?where[${campo}][$iLike]=${like}&where[serviceId]=${encodeURIComponent(serviceId)}&perPage=20`,
      )));
    } catch (erro) {
      console.error('[digisac-historico] busca nome', erro instanceof Error ? erro.message : erro);
    }
  }
  return out;
}

async function contatosDoCliente(
  supabaseAdmin: ReturnType<typeof createClient>,
  clienteId: string,
): Promise<{ situacao: 'sem_telefone' | 'sem_contato' | null; contactIds: string[] }> {
  const { data: cliente, error } = await supabaseAdmin
    .from('clientes_azoup')
    .select('id, nome, telefone')
    .eq('id', clienteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
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
  const numeros = new Set<string>();
  const principal = telefoneDigisac(null, (cliente as { telefone?: string | null }).telefone);
  if (principal) numeros.add(principal);

  const extras = await supabaseAdmin
    .from('admin_digisac_telefones')
    .select('telefone')
    .eq('cliente_id', clienteId);
  if (extras.error) {
    if (!/admin_digisac_telefones|schema cache/i.test(extras.error.message)) throw new Error(extras.error.message);
  } else {
    for (const row of extras.data ?? []) {
      const extra = telefoneDigisac(null, (row as { telefone?: string | null }).telefone);
      if (extra) numeros.add(extra);
    }
  }
  const listaNumeros = [...numeros];
  if (!listaNumeros.length && !alvos.length) return { situacao: 'sem_telefone', contactIds: [] };

  const serviceId = await serviceAzoupConfec();
  const candidatos: Record<string, unknown>[] = [];

  const envio = await supabaseAdmin
    .from('admin_digisac_envio')
    .select('contact_id')
    .eq('cliente_id', clienteId)
    .maybeSingle();
  const salvo = !envio.error
    ? `${(envio.data as { contact_id?: string | null } | null)?.contact_id ?? ''}`.trim()
    : '';
  if (salvo) {
    try {
      const row = contatoUnico(await digisac(`/api/v1/contacts/${encodeURIComponent(salvo)}`));
      if (row) candidatos.push(row);
    } catch (erro) {
      console.error('[digisac-historico] contato salvo', erro instanceof Error ? erro.message : erro);
    }
  }

  const telefonesAchados = await Promise.all(listaNumeros.slice(0, 8).map((numero) => buscarContatosPorTelefone(serviceId, numero)));
  const nomesBusca = [...alvos].sort((a, b) => a.length - b.length).slice(0, 8);
  const nomesAchados = await Promise.all(nomesBusca.map((nome) => buscarContatosPorNome(serviceId, nome)));
  for (const lista of [...telefonesAchados, ...nomesAchados]) candidatos.push(...lista);

  const ids = new Set<string>();
  for (const row of candidatos) {
    const id = pickId(row);
    if (!id || ids.has(id)) continue;
    const serviceDoContato = idCampo(row.serviceId);
    if (serviceDoContato && serviceDoContato !== serviceId) continue;
    if (!contatoDoClienteCombina(row, listaNumeros, alvos)) continue;
    ids.add(id);
    if (ids.size >= 15) break;
  }

  const contactIds = [...ids];
  if (!contactIds.length) return { situacao: 'sem_contato', contactIds: [] };
  return { situacao: null, contactIds };
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
  };
}

async function gravarChamados(
  supabaseAdmin: ReturnType<typeof createClient>,
  clienteId: string,
  chamados: Chamado[],
): Promise<void> {
  const agora = new Date().toISOString();
  if (chamados.length) {
    const { error } = await supabaseAdmin.from('admin_digisac_chamados').upsert(
      chamados.map((chamado) => ({
        cliente_id: clienteId,
        ticket_id: chamado.id,
        contact_id: chamado.contactId || null,
        protocolo: chamado.protocolo,
        assunto: chamado.assunto,
        aberto: chamado.aberto,
        inicio: chamado.inicio,
        fim: chamado.fim,
        department_id: chamado.departmentId || null,
        updated_at: agora,
      })),
      { onConflict: 'cliente_id,ticket_id' },
    );
    if (error) {
      if (/admin_digisac_chamados|schema cache/i.test(error.message)) {
        console.error('[digisac-historico] tabela de chamados ausente');
        return;
      }
      throw new Error(error.message);
    }
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

  const { data: pessoas, error } = await supabaseAdmin.from('clientes_azoup').select('id,nome,telefone').limit(2000);
  if (error) throw new Error(error.message);
  const { data: empresas } = await supabaseAdmin.from('empresas').select('cliente_id,nome_fantasia,razao_social').limit(4000);
  const { data: extras } = await supabaseAdmin.from('admin_digisac_telefones').select('cliente_id,telefone').limit(4000);
  const nomesPorCliente = new Map<string, string[]>();
  const numerosPorCliente = new Map<string, string[]>();
  for (const row of empresas ?? []) {
    const id = `${(row as { cliente_id?: string }).cliente_id ?? ''}`;
    const nomes = nomesPorCliente.get(id) ?? [];
    for (const nome of limparNomes(`${(row as { nome_fantasia?: string }).nome_fantasia ?? ''}`)) nomes.push(nome);
    for (const nome of limparNomes(`${(row as { razao_social?: string }).razao_social ?? ''}`)) nomes.push(nome);
    nomesPorCliente.set(id, nomes);
  }
  for (const row of extras ?? []) {
    const id = `${(row as { cliente_id?: string }).cliente_id ?? ''}`;
    const numero = telefoneDigisac(null, (row as { telefone?: string }).telefone);
    if (!numero) continue;
    const lista = numerosPorCliente.get(id) ?? [];
    lista.push(numero);
    numerosPorCliente.set(id, lista);
  }

  const clientes: ClienteIndice[] = [];
  for (const row of pessoas ?? []) {
    const id = `${(row as { id?: string }).id ?? ''}`;
    if (!id) continue;
    const numero = telefoneDigisac(null, (row as { telefone?: string }).telefone);
    const numeros = [...(numerosPorCliente.get(id) ?? [])];
    if (numero) numeros.push(numero);
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
  for (let page = 1; page <= 3; page++) {
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
  const faltando = [...new Set(rows.map((row) => idCampo(row.contactId)).filter((id) => id && !porContato.get(id)))].slice(0, 40);
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
  const linhas = [...porCliente.entries()].flatMap(([clienteId, chamados]) =>
    chamados.map((chamado) => ({
      cliente_id: clienteId,
      ticket_id: chamado.id,
      contact_id: chamado.contactId || null,
      protocolo: chamado.protocolo,
      assunto: chamado.assunto,
      aberto: chamado.aberto,
      inicio: chamado.inicio,
      fim: chamado.fim,
      department_id: chamado.departmentId || departmentId,
      updated_at: agora,
    })),
  );
  if (linhas.length) {
    const { error } = await supabaseAdmin.from('admin_digisac_chamados').upsert(linhas, { onConflict: 'cliente_id,ticket_id' });
    if (error && !/schema cache|does not exist/i.test(error.message)) throw new Error(error.message);
  }
  return linhas.length;
}

async function refletirUltimoChamado(supabaseAdmin: ReturnType<typeof createClient>): Promise<void> {
  const { error } = await supabaseAdmin.rpc('painel_refletir_ultimo_chamado');
  if (error && !/schema cache|does not exist|could not find/i.test(error.message)) {
    console.error('[digisac-historico] refletir último chamado', error.message);
  }
}

async function sincronizarUltimosChamados(
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<{ atualizados: number; contatos: Record<string, string> }> {
  let atualizados = 0;
  try {
    atualizados = await importarChamadosRecentes(supabaseAdmin);
  } catch (erro) {
    console.error('[digisac-historico] sync chamados', erro instanceof Error ? erro.message : erro);
  }
  let contatos: Record<string, string> = {};
  try {
    contatos = await datasUltimoChamado(supabaseAdmin);
  } catch (erro) {
    console.error('[digisac-historico] datas dos chamados', erro instanceof Error ? erro.message : erro);
  }
  await refletirUltimoChamado(supabaseAdmin);
  return { atualizados, contatos };
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
        return json({ situacao: contato.situacao, chamados: [] });
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
      return json({
        situacao: chamados.length ? 'ok' : 'sem_chamados',
        chamados: chamados.map(chamadoPublico),
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
      if (!texto || texto.length > 4000) falha('Mensagem inválida');
      const [contato, departmentId] = await Promise.all([
        contatosDoCliente(supabaseAdmin, clienteId),
        departamentoAzoupConfec(),
      ]);
      if (contato.situacao || !contato.contactIds.length) {
        falha('Nenhum contato deste cliente na Digisac', 404);
      }
      const contactId = contato.contactIds[0];
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
