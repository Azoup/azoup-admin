import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

const NOME_CONEXAO = 'azoup confec';
const ESPERA_EMPRESA_MS = 2_000;
const TENTATIVAS_EMPRESA = 6;

type EmpresaRow = {
  nome_fantasia?: string | null;
  razao_social?: string | null;
  empresa_matriz?: boolean | null;
};

type EnvioRow = {
  status?: string | null;
  updated_at?: string | null;
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

function semAcento(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

function digitsOnlyPhone(value: string): string {
  return value.replace(/\D/g, '');
}

/** Mesma regra de src/utils/whatsapp.ts: DDI 55, só dígitos. */
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

function nomeContato(pessoa: string, empresa: string): string {
  const base = pessoa.trim().toLocaleLowerCase('pt-BR');
  const pessoaFmt = base ? base.charAt(0).toLocaleUpperCase('pt-BR') + base.slice(1) : 'Cliente';
  const emp = empresa.trim().toLocaleUpperCase('pt-BR');
  return emp ? `${pessoaFmt} - ${emp}` : pessoaFmt;
}

function nomeEmpresa(rows: EmpresaRow[]): string {
  const matriz = rows.find((row) => row.empresa_matriz) ?? rows[0];
  if (!matriz) return '';
  const fantasia = `${matriz.nome_fantasia ?? ''}`.trim();
  if (fantasia) return fantasia;
  return `${matriz.razao_social ?? ''}`.trim();
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

async function digisac(path: string, init?: RequestInit): Promise<unknown> {
  const base = env('DIGISAC_BASE_URL').replace(/\/$/, '');
  const token = env('DIGISAC_TOKEN');
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
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
    const last = data && typeof data === 'object' ? Number((data as { lastPage?: unknown }).lastPage) : NaN;
    if (rows.length < 50 || (Number.isFinite(last) && page >= last)) break;
  }
  return out;
}

function acharPorNome(rows: Record<string, unknown>[], nome: string): Record<string, unknown> | null {
  const alvo = semAcento(nome);
  return rows.find((row) => semAcento(`${row.name ?? ''}`) === alvo) ?? null;
}

async function buscarEmpresas(supabase: SupabaseClient, clienteId: string): Promise<EmpresaRow[]> {
  const { data, error } = await supabase
    .from('empresas')
    .select('nome_fantasia, razao_social, empresa_matriz')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as EmpresaRow[];
}

async function esperarEmpresa(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<{ pronta: boolean; nome: string }> {
  for (let i = 0; i < TENTATIVAS_EMPRESA; i++) {
    const rows = await buscarEmpresas(supabase, clienteId);
    if (rows.length) return { pronta: true, nome: nomeEmpresa(rows) };
    if (i < TENTATIVAS_EMPRESA - 1) {
      await new Promise((resolve) => setTimeout(resolve, ESPERA_EMPRESA_MS));
    }
  }
  return { pronta: false, nome: '' };
}

async function marcar(
  supabase: SupabaseClient,
  clienteId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('admin_digisac_envio').upsert(
    { cliente_id: clienteId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'cliente_id' },
  );
  if (error) throw new Error(error.message);
}

async function marcarSeAindaNaoEnviou(
  supabase: SupabaseClient,
  clienteId: string,
  status: 'aguardando_empresa' | 'sem_telefone',
  erro: string | null,
): Promise<void> {
  const { data, error } = await supabase
    .from('admin_digisac_envio')
    .select('status')
    .eq('cliente_id', clienteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const atual = `${(data as { status?: string } | null)?.status ?? ''}`;
  if (atual === 'enviado' || atual === 'enviando' || atual === 'erro' || atual === 'sem_telefone') return;
  if (atual === status) return;
  await marcar(supabase, clienteId, { status, erro });
}

async function criarOuAcharContato(input: {
  nome: string;
  number: string;
  serviceId: string;
  departmentId: string;
}): Promise<string> {
  const body = {
    name: input.nome,
    internalName: input.nome,
    number: input.number,
    serviceId: input.serviceId,
    defaultDepartmentId: input.departmentId,
  };
  try {
    const created = await digisac('/api/v1/contacts', { method: 'POST', body: JSON.stringify(body) });
    const id = pickId(created);
    if (!id) throw new Error('Digisac não retornou o id do contato');
    return id;
  } catch (erro) {
    const found = await digisac(
      `/api/v1/contacts?number=${encodeURIComponent(input.number)}&serviceId=${encodeURIComponent(input.serviceId)}&perPage=5`,
    );
    const id = pickId(asRows(found)[0]);
    if (!id) throw erro;
    try {
      await digisac(`/api/v1/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: input.nome,
          internalName: input.nome,
          defaultDepartmentId: input.departmentId,
        }),
      });
    } catch (rename) {
      console.error('[digisac-boas-vindas] renomear contato', rename instanceof Error ? rename.message : rename);
    }
    return id;
  }
}

async function protocoloDoContato(contactId: string): Promise<{ protocolo: string | null; departmentId: string | null }> {
  const query = encodeURIComponent(JSON.stringify({
    where: { contactId },
    attributes: ['id', 'isOpen', 'protocol', 'departmentId', 'startedAt'],
    order: [['startedAt', 'DESC']],
    perPage: 5,
  }));
  const data = await digisac(`/api/v1/tickets?query=${query}`);
  const rows = asRows(data);
  const aberto = rows.find((row) => row.isOpen === true) ?? rows[0];
  if (!aberto) return { protocolo: null, departmentId: null };
  const protocolo = `${aberto.protocol ?? ''}`.trim();
  const departmentId = `${aberto.departmentId ?? ''}`.trim();
  return { protocolo: protocolo || null, departmentId: departmentId || null };
}

async function enviar(supabase: SupabaseClient, clienteId: string, empresa: string) {
  const { data: reivindicou, error: claimErr } = await supabase.rpc('admin_digisac_reivindicar_envio', {
    p_cliente_id: clienteId,
  });
  if (claimErr) throw new Error(claimErr.message);
  if (!reivindicou) return { ok: true, skipped: 'ja_processado' };

  try {
    const { data: cliente, error: cliErr } = await supabase
      .from('clientes_azoup')
      .select('id, nome, telefone, celular')
      .eq('id', clienteId)
      .maybeSingle();
    if (cliErr) throw new Error(cliErr.message);
    if (!cliente) throw new Error('Cliente não encontrado');

    const numero = telefoneDigisac(
      (cliente as { celular?: string | null }).celular,
      (cliente as { telefone?: string | null }).telefone,
    );
    if (!numero) {
      await marcar(supabase, clienteId, { status: 'sem_telefone', erro: 'Cliente sem telefone válido' });
      return { ok: true, skipped: 'sem_telefone' };
    }

    const { data: config, error: cfgErr } = await supabase
      .from('admin_digisac_boas_vindas')
      .select('mensagem')
      .eq('id', 1)
      .maybeSingle();
    if (cfgErr) throw new Error(cfgErr.message);
    const texto = `${(config as { mensagem?: string | null } | null)?.mensagem ?? ''}`.trim();
    if (!texto) {
      await marcar(supabase, clienteId, { status: 'erro', erro: 'Mensagem automática vazia' });
      return { ok: true, skipped: 'mensagem_vazia' };
    }

    const [services, departments, me] = await Promise.all([
      listarPaginas('/api/v1/services'),
      listarPaginas('/api/v1/departments'),
      digisac('/api/v1/me'),
    ]);
    const service = acharPorNome(services, NOME_CONEXAO);
    const department = acharPorNome(departments, NOME_CONEXAO);
    if (!service?.id) throw new Error('Conexão Azoup Confec não encontrada na Digisac');
    if (!department?.id) throw new Error('Departamento Azoup Confec não encontrado na Digisac');
    const userId = pickId(me);
    if (!userId) throw new Error('Token Digisac sem usuário');

    const nome = nomeContato(`${(cliente as { nome?: string | null }).nome ?? ''}`, empresa);
    const contactId = await criarOuAcharContato({
      nome,
      number: numero,
      serviceId: `${service.id}`,
      departmentId: `${department.id}`,
    });

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

    let protocolo: string | null = null;
    let aviso: string | null = null;
    try {
      let ticket = await protocoloDoContato(contactId);
      if (ticket.departmentId !== `${department.id}`) {
        try {
          await digisac(`/api/v1/contacts/${contactId}/ticket/transfer`, {
            method: 'POST',
            body: JSON.stringify({ departmentId: `${department.id}` }),
          });
          ticket = await protocoloDoContato(contactId);
        } catch (transfer) {
          aviso = transfer instanceof Error ? transfer.message : 'Falha ao transferir o chamado';
        }
      }
      protocolo = ticket.protocolo;
    } catch (proto) {
      aviso = proto instanceof Error ? proto.message : 'Protocolo não encontrado';
    }

    await marcar(supabase, clienteId, {
      status: 'enviado',
      contact_id: contactId,
      protocolo,
      erro: aviso,
    });
    return { ok: true, protocolo, contactId };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro ao enviar mensagem Digisac';
    await marcar(supabase, clienteId, { status: 'erro', erro: message.slice(0, 1000) });
    console.error('[digisac-boas-vindas]', message);
    return { ok: false, error: message };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método inválido' }, 405);

  try {
    const secret = req.headers.get('x-webhook-secret') ?? '';
    if (!secret || secret !== env('DIGISAC_WEBHOOK_SECRET')) {
      return json({ error: 'Webhook não autorizado' }, 401);
    }

    const body = await req.json().catch(() => ({})) as {
      type?: string;
      table?: string;
      record?: Record<string, unknown> | null;
    };
    if (body.type && body.type !== 'INSERT') return json({ ok: true, skipped: 'nao_insert' });

    const record = body.record ?? {};
    const table = `${body.table ?? ''}`;
    const clienteId = table === 'empresas'
      ? `${record.cliente_id ?? ''}`
      : `${record.id ?? ''}`;
    if (!clienteId) return json({ ok: true, skipped: 'sem_cliente' });

    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: config, error: cfgErr } = await supabase
      .from('admin_digisac_boas_vindas')
      .select('habilitado, mensagem')
      .eq('id', 1)
      .maybeSingle();
    if (cfgErr) throw new Error(cfgErr.message);
    const habilitado = Boolean((config as { habilitado?: boolean } | null)?.habilitado);
    const mensagem = `${(config as { mensagem?: string | null } | null)?.mensagem ?? ''}`.trim();
    if (!habilitado || !mensagem) return json({ ok: true, skipped: 'desligado' });

    const { data: envio, error: envioErr } = await supabase
      .from('admin_digisac_envio')
      .select('status, updated_at')
      .eq('cliente_id', clienteId)
      .maybeSingle();
    if (envioErr) throw new Error(envioErr.message);
    const status = `${(envio as EnvioRow | null)?.status ?? ''}`;

    if (table === 'empresas' && status !== 'aguardando_empresa') {
      return json({ ok: true, skipped: 'sem_pendencia' });
    }
    if (status === 'enviado' || status === 'sem_telefone' || status === 'erro') {
      return json({ ok: true, skipped: status });
    }
    if (status === 'enviando') {
      const updated = Date.parse(`${(envio as EnvioRow).updated_at ?? ''}`);
      if (Number.isFinite(updated) && Date.now() - updated < 3 * 60_000) {
        return json({ ok: true, skipped: 'enviando' });
      }
    }

    const { data: cliente, error: cliErr } = await supabase
      .from('clientes_azoup')
      .select('id, telefone, celular')
      .eq('id', clienteId)
      .maybeSingle();
    if (cliErr) throw new Error(cliErr.message);
    if (!cliente) return json({ ok: true, skipped: 'cliente_ausente' });

    const numero = telefoneDigisac(
      (cliente as { celular?: string | null }).celular,
      (cliente as { telefone?: string | null }).telefone,
    );
    if (!numero) {
      await marcarSeAindaNaoEnviou(supabase, clienteId, 'sem_telefone', 'Cliente sem telefone válido');
      return json({ ok: true, skipped: 'sem_telefone' });
    }

    const rowsEmpresa = table === 'empresas' ? await buscarEmpresas(supabase, clienteId) : null;
    const empresa = rowsEmpresa
      ? { pronta: rowsEmpresa.length > 0, nome: nomeEmpresa(rowsEmpresa) }
      : await esperarEmpresa(supabase, clienteId);
    if (!empresa.pronta) {
      await marcarSeAindaNaoEnviou(supabase, clienteId, 'aguardando_empresa', null);
      return json({ ok: true, skipped: 'aguardando_empresa' });
    }

    return json(await enviar(supabase, clienteId, empresa.nome));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro interno';
    console.error('[digisac-boas-vindas]', message);
    return json({ error: message }, 500);
  }
});
