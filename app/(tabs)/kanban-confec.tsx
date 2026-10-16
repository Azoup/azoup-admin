import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ClienteSearchPicker } from '@/components/ui/ClienteSearchPicker';
import { FormDateInput } from '@/components/ui/FormDateInput';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { FormSelect } from '@/components/ui/FormSelect';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { registrarAuditoria } from '@/src/services/audit';
import { listarClientesParaSelecao } from '@/src/services/repos/conversas-repo';
import { CONFEC_SECOES, type ConfecSecao } from '@/src/constants/confec-notas';
import { gerarESalvarNotaConfec } from '@/src/services/confec-notas-api';
import {
  adicionarChecklistConfec,
  adicionarComentarioConfec,
  alternarChecklistConfec,
  assinarQuadroConfec,
  atualizarCardConfec,
  atualizarColunaConfec,
  carregarQuadroConfec,
  colunaDeConclusao,
  criarCardConfec,
  criarColunaConfec,
  editarComentarioConfec,
  ehColunaConclusao,
  enviarAnexoConfec,
  excluirAnexoConfec,
  excluirCardConfec,
  excluirChecklistConfec,
  excluirColunaConfec,
  excluirComentarioConfec,
  excluirEtiquetaConfec,
  listarAdminsAtivos,
  moverCardConfec,
  normalizarTitulo,
  numeroTicket,
  reordenarCardsConfec,
  reordenarColunasConfec,
  salvarEtiquetaConfec,
  type ConfecCard,
  type ConfecColuna,
  type ConfecEtiqueta,
} from '@/src/services/repos/confec-kanban-repo';
import type { ClienteAzoupRow } from '@/src/types/azoup';
import { dataCalendarioBrasil, dataHojeBrasil, formatDateTimeBR, somarDiasYmd } from '@/src/utils/format';
import {
  colunaSobPonto,
  marcarColuna,
  marcarScrollKanban,
  posicionarFantasma,
  SemArraste,
  useCardPointerDrag,
} from '@/src/utils/kanban-drag';
import { abrirPdfConcluidosConfec } from '@/src/utils/pdf-kanban-confec';

const SCROLL = '[data-kanban-scroll="confec"]';
const CORES = ['#94A3B8', '#4C9AFF', '#F5C542', '#22C55E', '#F07167', '#A78BFA', '#10b981'];
const VAZIO = '__nenhum__';
const PERIODOS: Periodo[] = ['ordem', 'recentes', 'antigos', 'mes', '7dias', 'intervalo'];
const ROTULO_PERIODO: Record<Periodo, string> = {
  ordem: 'Ordem do quadro',
  recentes: 'Mais recentes',
  antigos: 'Mais antigos',
  mes: 'Mês atual',
  '7dias': 'Últimos 7 dias',
  intervalo: 'Intervalo',
};

function normalizarCor(valor: string): string {
  const limpo = valor.trim();
  const cheio = /^#?([0-9a-fA-F]{6})$/.exec(limpo);
  if (cheio) return `#${cheio[1]}`;
  const curto = /^#?([0-9a-fA-F]{3})$/.exec(limpo);
  if (!curto) return '';
  const [r, g, b] = curto[1].split('');
  return `#${r}${r}${g}${g}${b}${b}`;
}

function SeletorCor({ cor, onChange }: { cor: string; onChange: (valor: string) => void }) {
  const { theme } = useTheme();
  const hex = normalizarCor(cor) || '#4C9AFF';
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {Platform.OS === 'web'
          ? createElement('input', {
              type: 'color',
              value: hex,
              'aria-label': 'Escolher cor',
              onInput: (event: Event) => onChange((event.target as HTMLInputElement).value),
              style: { width: 36, height: 32, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' },
            })
          : null}
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: hex, borderWidth: 1, borderColor: theme.border }} />
        <FormInput
          value={cor}
          onChangeText={onChange}
          placeholder="#4C9AFF"
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1 }}
        />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {CORES.map((item) => (
          <Pressable
            key={item}
            onPress={() => onChange(item)}
            accessibilityLabel={item}
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: item,
              borderWidth: hex.toLowerCase() === item.toLowerCase() ? 2 : 0,
              borderColor: theme.headerText,
            }}
          />
        ))}
      </View>
    </View>
  );
}

type Periodo = 'ordem' | 'recentes' | 'antigos' | 'mes' | '7dias' | 'intervalo';

type Rascunho = {
  id: string | null;
  title: string;
  description: string;
  devNotes: string;
  clienteId: string | null;
  analista: string;
  desenvolvedor: string;
  secao: ConfecSecao | '';
  tela: string;
  telaNova: boolean;
  status: string;
  labelIds: string[];
  base: string;
};

function chaveRascunho(r: Omit<Rascunho, 'base'>): string {
  return JSON.stringify({
    title: normalizarTitulo(r.title),
    description: r.description.trim(),
    devNotes: r.devNotes.trim(),
    clienteId: r.clienteId,
    analista: r.analista,
    desenvolvedor: r.desenvolvedor,
    secao: r.secao,
    tela: r.tela.trim(),
    telaNova: r.telaNova,
    status: r.status,
    labelIds: [...r.labelIds].sort(),
  });
}

function cardSobPonto(x: number, y: number): string | null {
  if (typeof document === 'undefined') return null;
  for (const no of document.elementsFromPoint(x, y)) {
    if (!(no instanceof Element)) continue;
    const id = no.closest('[data-confec-card]')?.getAttribute('data-confec-card');
    if (id) return id;
  }
  return null;
}

function marcarCard(id: string) {
  return (node: View | null) => {
    const el = node as unknown as { setAttribute?: (nome: string, valor: string) => void } | null;
    el?.setAttribute?.('data-confec-card', id);
  };
}

function passaFiltro(
  card: ConfecCard,
  busca: string,
  etiquetas: string[],
  analista: string,
  desenvolvedor: string,
  periodo: Periodo,
  de: string,
  ate: string,
): boolean {
  const q = busca.trim();
  if (q) {
    if (/^\d+$/.test(q)) {
      if (card.ticket_number !== Number(q)) return false;
    } else {
      const blob = `${card.title} ${card.description} ${card.cliente_nome ?? ''}`.toLowerCase();
      if (!blob.includes(q.toLowerCase())) return false;
    }
  }
  if (etiquetas.length && !card.etiquetas.some((item) => etiquetas.includes(item.id))) return false;
  if (analista && card.analista_email !== analista) return false;
  if (desenvolvedor && card.desenvolvedor_email !== desenvolvedor) return false;
  const dia = dataCalendarioBrasil(card.created_at) ?? '';
  const hoje = dataHojeBrasil();
  if (periodo === 'mes' && !dia.startsWith(hoje.slice(0, 7))) return false;
  if (periodo === '7dias' && dia < somarDiasYmd(hoje, -6)) return false;
  if (periodo === 'intervalo') {
    if (de && dia < de) return false;
    if (ate && dia > ate) return false;
  }
  return true;
}

function ordenar(cards: ConfecCard[], periodo: Periodo): ConfecCard[] {
  const lista = [...cards];
  if (periodo === 'recentes') return lista.sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (periodo === 'antigos') return lista.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return lista.sort((a, b) => a.position - b.position);
}

function TicketCard({
  card,
  cor,
  onAbrir,
  onArrastar,
  onSoltar,
}: {
  card: ConfecCard;
  cor: string;
  onAbrir: () => void;
  onArrastar: (x: number, y: number) => void;
  onSoltar: (x: number, y: number) => void;
}) {
  const { theme } = useTheme();
  const arrastarRef = useRef(onArrastar);
  const soltarRef = useRef(onSoltar);
  arrastarRef.current = onArrastar;
  soltarRef.current = onSoltar;
  const { ref, arrastou } = useCardPointerDrag({
    scrollSelector: SCROLL,
    onMove: ({ x, y }) => arrastarRef.current(x, y),
    onDrop: ({ x, y }) => soltarRef.current(x, y),
    onCancel: () => soltarRef.current(-1, -1),
  });
  return (
    <View
      ref={(node) => {
        ref.current = node;
        marcarCard(card.id)(node);
      }}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: cor }]}
    >
      <Pressable
        onPress={() => {
          if (arrastou.current) {
            arrastou.current = false;
            return;
          }
          onAbrir();
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {card.completed_at ? <FontAwesome name="check-circle" size={14} color="#22C55E" /> : null}
          <Text style={{ color: theme.headerText, fontWeight: '800', flex: 1 }}>
            #{numeroTicket(card.ticket_number)} {card.title}
          </Text>
        </View>
        {card.cliente_nome ? <Text style={{ color: theme.textMuted, fontSize: 12 }}>{card.cliente_nome}</Text> : null}
        {card.secao || card.tela ? (
          <Text style={{ color: theme.textMuted, fontSize: 11 }}>
            {[card.secao, card.tela].filter(Boolean).join(' · ')}
            {card.tela_nova ? ' · nova' : ''}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {card.etiquetas.map((etiqueta) => (
            <Text key={etiqueta.id} style={{ color: etiqueta.color, fontSize: 11, fontWeight: '800' }}>
              {etiqueta.name}
            </Text>
          ))}
        </View>
        <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 6 }}>
          {card.analista_email || 'Sem analista'} · {card.desenvolvedor_email || 'Sem desenvolvedor'}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 11 }}>
          Criado em {formatDateTimeBR(card.created_at)}
          {card.completed_at ? ` · Concluído em ${formatDateTimeBR(card.completed_at)}` : ''}
        </Text>
      </Pressable>
    </View>
  );
}

export default function KanbanConfecScreen() {
  const { theme } = useTheme();
  const { canAccessScreen, canDeleteRecords, papel, adminProfile, session } = useAdminAuth();
  const email = adminProfile?.email ?? session?.user?.email ?? '';
  const owner = papel === 'owner';
  const qc = useQueryClient();
  const pode = canAccessScreen('kanban_confec');
  const [busca, setBusca] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>('ordem');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [etiquetaFiltro, setEtiquetaFiltro] = useState<string[]>([]);
  const [analista, setAnalista] = useState('');
  const [desenvolvedor, setDesenvolvedor] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [etiquetasAbertas, setEtiquetasAbertas] = useState(false);
  const [colunaEdit, setColunaEdit] = useState<ConfecColuna | null>(null);
  const [novaLista, setNovaLista] = useState(false);
  const [pdfAberto, setPdfAberto] = useState(false);
  const [imagemAberta, setImagemAberta] = useState<string | null>(null);
  const [comentario, setComentario] = useState('');
  const [comentarioEdit, setComentarioEdit] = useState<{ id: string; texto: string } | null>(null);
  const [checklistTexto, setChecklistTexto] = useState('');
  const [nomeEtiqueta, setNomeEtiqueta] = useState('');
  const [corEtiqueta, setCorEtiqueta] = useState(CORES[1]);
  const [etiquetaEdit, setEtiquetaEdit] = useState<ConfecEtiqueta | null>(null);
  const [nomeLista, setNomeLista] = useState('');
  const [corLista, setCorLista] = useState(CORES[0]);
  const [pdfDe, setPdfDe] = useState(`${dataHojeBrasil().slice(0, 7)}-01`);
  const [pdfAte, setPdfAte] = useState(dataHojeBrasil());
  const fantasmaRef = useRef<View>(null);
  const posicao = useRef({ x: 0, y: 0 });
  const [rotulo, setRotulo] = useState<string | null>(null);

  const quadroQ = useQuery({
    queryKey: ['confec_kanban'],
    queryFn: carregarQuadroConfec,
    enabled: pode,
  });
  const adminsQ = useQuery({
    queryKey: ['confec_admins'],
    queryFn: listarAdminsAtivos,
    enabled: pode,
  });
  const clientesQ = useQuery({
    queryKey: ['clientes_para_selecao'],
    queryFn: listarClientesParaSelecao,
    enabled: pode && rascunho != null,
  });

  useEffect(() => {
    if (!pode) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const parar = assinarQuadroConfec(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void qc.invalidateQueries({ queryKey: ['confec_kanban'] }), 400);
    });
    return () => {
      if (timer) clearTimeout(timer);
      parar();
    };
  }, [pode, qc]);

  const quadro = quadroQ.data;
  const colunas = quadro?.colunas ?? [];
  const conclusao = colunaDeConclusao(colunas);
  const ordemVisual = periodo === 'recentes' || periodo === 'antigos';

  const porColuna = useMemo(() => {
    const map = new Map<string, ConfecCard[]>();
    for (const coluna of colunas) map.set(coluna.slug, []);
    for (const card of quadro?.cards ?? []) {
      if (!passaFiltro(card, busca, etiquetaFiltro, analista, desenvolvedor, periodo, de, ate)) continue;
      const lista = map.get(card.status) ?? [];
      lista.push(card);
      map.set(card.status, lista);
    }
    for (const [slug, lista] of map) map.set(slug, ordenar(lista, periodo));
    return map;
  }, [quadro?.cards, colunas, busca, etiquetaFiltro, analista, desenvolvedor, periodo, de, ate]);

  const detalhe = quadro?.cards.find((card) => card.id === detalheId) ?? null;
  const clienteRascunho = (clientesQ.data ?? []).find((cliente) => cliente.id === rascunho?.clienteId) ?? null;

  function auditar(acao: string, id: string, antes: Record<string, unknown> | null, depois: Record<string, unknown> | null) {
    void registrarAuditoria(
      { id: adminProfile?.id, email },
      { acao, entidade: 'confec_kanban_cards', entidade_id: id, valores_anteriores: antes, valores_novos: depois },
    );
  }

  function abrirNovo(status: string) {
    const vazio = {
      id: null,
      title: '',
      description: '',
      devNotes: '',
      clienteId: null,
      analista: '',
      desenvolvedor: '',
      secao: '' as ConfecSecao | '',
      tela: '',
      telaNova: false,
      status,
      labelIds: [] as string[],
    };
    setRascunho({ ...vazio, base: chaveRascunho(vazio) });
    setDetalheId(null);
  }

  function abrirEdicao(card: ConfecCard) {
    const atual = {
      id: card.id,
      title: card.title,
      description: card.description,
      devNotes: card.dev_notes,
      clienteId: card.cliente_id,
      analista: card.analista_email ?? '',
      desenvolvedor: card.desenvolvedor_email ?? '',
      secao: (card.secao ?? '') as ConfecSecao | '',
      tela: card.tela ?? '',
      telaNova: Boolean(card.tela_nova),
      status: card.status,
      labelIds: card.etiquetas.map((item) => item.id),
    };
    setRascunho({ ...atual, base: chaveRascunho(atual) });
  }

  const salvar = useMutation({
    mutationFn: async (atual: Rascunho) => {
      if (!atual.id) {
        return criarCardConfec({
          title: atual.title,
          status: atual.status,
          description: atual.description,
          devNotes: atual.devNotes,
          clienteId: atual.clienteId,
          analistaEmail: atual.analista,
          desenvolvedorEmail: atual.desenvolvedor,
          createdByEmail: email,
          secao: atual.secao || null,
          tela: atual.tela,
          telaNova: atual.telaNova,
          labelIds: atual.labelIds,
        });
      }
      const anterior = quadro?.cards.find((card) => card.id === atual.id);
      await atualizarCardConfec({
        id: atual.id,
        title: atual.title,
        description: atual.description,
        devNotes: atual.devNotes,
        clienteId: atual.clienteId,
        analistaEmail: atual.analista,
        desenvolvedorEmail: atual.desenvolvedor,
        secao: atual.secao || null,
        tela: atual.tela,
        telaNova: atual.telaNova,
        status: atual.status,
        statusAnterior: anterior?.status ?? atual.status,
        colunas,
        labelIds: atual.labelIds,
      });
      return atual.id;
    },
    onSuccess: (id, atual) => {
      const novo = !atual.id;
      auditar(
        novo ? 'Criou card no Kanban Confec' : 'Editou card no Kanban Confec',
        id,
        novo ? null : { titulo: quadro?.cards.find((card) => card.id === id)?.title ?? null },
        {
          titulo: normalizarTitulo(atual.title),
          observacoes: atual.description.trim(),
          dev: atual.devNotes.trim(),
          secao: atual.secao || null,
          tela: atual.tela.trim() || null,
          analista: atual.analista || null,
          desenvolvedor: atual.desenvolvedor || null,
          cliente: atual.clienteId,
          etiquetas: atual.labelIds.length,
        },
      );
      setRascunho(null);
      setErro(null);
      void qc.invalidateQueries({ queryKey: ['confec_kanban'] });
      void qc.invalidateQueries({ queryKey: ['confec_notas_publicadas'] });
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao salvar o ticket'),
  });

  async function fecharEdicao() {
    if (!rascunho) return;
    const sujo = chaveRascunho(rascunho) !== rascunho.base;
    if (sujo && normalizarTitulo(rascunho.title)) {
      salvar.mutate(rascunho);
      return;
    }
    setRascunho(null);
  }

  function aoSoltar(card: ConfecCard, x: number, y: number) {
    posicionarFantasma(fantasmaRef.current, 0, 0, false);
    setRotulo(null);
    if (x < 0) return;
    const slug = colunaSobPonto(x, y);
    if (!slug || !colunas.some((coluna) => coluna.slug === slug)) return;
    const mesma = slug === card.status;
    if (mesma && ordemVisual) return;
    const destino = (quadro?.cards ?? [])
      .filter((item) => item.status === slug && item.id !== card.id)
      .sort((a, b) => a.position - b.position);
    const sob = cardSobPonto(x, y);
    const indice = sob ? destino.findIndex((item) => item.id === sob) : destino.length;
    const lista = [...destino];
    lista.splice(indice < 0 ? destino.length : indice, 0, card);
    if (mesma) {
      void reordenarCardsConfec(lista.map((item) => item.id)).then(() => qc.invalidateQueries({ queryKey: ['confec_kanban'] }));
      return;
    }
    void moverCardConfec({
      id: card.id,
      status: slug,
      position: indice < 0 ? destino.length : indice,
      statusAnterior: card.status,
      colunas,
      labelIds: card.etiquetas.map((item) => item.id),
      gravarPosicao: true,
      secao: card.secao,
      tela: card.tela,
      telaNova: card.tela_nova,
    })
      .then(() => reordenarCardsConfec(lista.map((item) => item.id)))
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['confec_kanban'] });
        void qc.invalidateQueries({ queryKey: ['confec_notas_publicadas'] });
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao mover o ticket'));
    auditar('Moveu card no Kanban Confec', card.id, { status: card.status }, { status: slug });
  }

  async function anexar(arquivo: File, imagem: boolean) {
    const cardId = rascunho?.id ?? detalheId;
    if (!cardId) {
      setErro('Salve o ticket antes de anexar.');
      return;
    }
    try {
      await enviarAnexoConfec({
        cardId,
        arquivo,
        nome: arquivo.name,
        mime: arquivo.type,
        imagem,
        authorEmail: email,
      });
      auditar('Anexou arquivo no Kanban Confec', cardId, null, { imagens: imagem ? 1 : 0, arquivos: imagem ? 0 : 1 });
      void qc.invalidateQueries({ queryKey: ['confec_kanban'] });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao anexar');
    }
  }

  function escolherArquivo(imagem: boolean) {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    if (imagem) input.accept = 'image/*';
    input.onchange = () => {
      const arquivo = input.files?.[0];
      if (arquivo) void anexar(arquivo, imagem || arquivo.type.startsWith('image/'));
    };
    input.click();
  }

  useEffect(() => {
    if (!rascunho || typeof window === 'undefined') return;
    const aoColar = (event: ClipboardEvent) => {
      const itens = event.clipboardData?.items;
      if (!itens) return;
      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        if (!item.type.startsWith('image/')) continue;
        const arquivo = item.getAsFile();
        if (arquivo) void anexar(arquivo, true);
      }
    };
    window.addEventListener('paste', aoColar);
    return () => window.removeEventListener('paste', aoColar);
  }, [rascunho, detalheId]);

  if (!pode) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Seu perfil não tem acesso ao Kanban Confec.</Text>
      </View>
    );
  }

  const emails = [VAZIO, ...(adminsQ.data ?? [])];

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={styles.filtros}>
        <View style={styles.barraTopo}>
          <Text style={[styles.titulo, { color: theme.headerText }]}>Kanban Confec</Text>
          <View style={styles.acoes}>
            <Pressable
              onPress={() => setPdfAberto(true)}
              style={({ pressed }) => [styles.btn, styles.btnSecundario, { borderColor: theme.border, backgroundColor: theme.surface, opacity: pressed ? 0.88 : 1 }]}
            >
              <Text style={[styles.btnTexto, { color: theme.headerText }]}>PDF concluídos</Text>
            </Pressable>
            <Pressable
              onPress={() => setEtiquetasAbertas(true)}
              style={({ pressed }) => [styles.btn, styles.btnSecundario, { borderColor: theme.border, backgroundColor: theme.surface, opacity: pressed ? 0.88 : 1 }]}
            >
              <Text style={[styles.btnTexto, { color: theme.headerText }]}>Etiquetas</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setNomeLista('');
                setCorLista(CORES[0]);
                setNovaLista(true);
              }}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimario,
                { backgroundColor: theme.cadastroAction, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Text style={[styles.btnTexto, { color: theme.cadastroActionText }]}>Nova lista</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.barraFiltros}>
          <View style={styles.busca}>
            <FormInput value={busca} onChangeText={setBusca} placeholder="Buscar número, cliente ou título" />
          </View>
          <View style={styles.filtro}>
            <FormSelect options={PERIODOS} value={periodo} onChange={setPeriodo} labels={ROTULO_PERIODO} />
          </View>
          <View style={styles.filtro}>
            <FormSelect
              options={emails}
              value={analista || VAZIO}
              onChange={(valor) => setAnalista(valor === VAZIO ? '' : valor)}
              labels={{ [VAZIO]: 'Analista' }}
            />
          </View>
          <View style={styles.filtro}>
            <FormSelect
              options={emails}
              value={desenvolvedor || VAZIO}
              onChange={(valor) => setDesenvolvedor(valor === VAZIO ? '' : valor)}
              labels={{ [VAZIO]: 'Desenvolvedor' }}
            />
          </View>
        </View>
        {periodo === 'intervalo' ? (
          <View style={styles.barraFiltros}>
            <View style={styles.filtro}>
              <FormDateInput value={de} onChange={setDe} />
            </View>
            <View style={styles.filtro}>
              <FormDateInput value={ate} onChange={setAte} />
            </View>
          </View>
        ) : null}
        {(quadro?.etiquetas.length ?? 0) > 0 ? (
          <View style={styles.etiquetasFiltro}>
            {(quadro?.etiquetas ?? []).map((etiqueta) => {
              const ativa = etiquetaFiltro.includes(etiqueta.id);
              return (
                <Pressable
                  key={etiqueta.id}
                  onPress={() => setEtiquetaFiltro((atual) => (ativa ? atual.filter((id) => id !== etiqueta.id) : [...atual, etiqueta.id]))}
                  style={[
                    styles.chip,
                    {
                      borderColor: etiqueta.color,
                      backgroundColor: ativa ? etiqueta.color : theme.surface,
                    },
                  ]}
                >
                  <Text style={{ color: ativa ? '#1A1408' : etiqueta.color, fontWeight: '800', fontSize: 11 }}>{etiqueta.name}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}
        {quadroQ.isLoading ? <ActivityIndicator color={theme.cadastroAction} /> : null}
        {quadroQ.error ? <Text style={{ color: theme.error }}>{(quadroQ.error as Error).message}</Text> : null}
      </View>
      <ScrollView
        horizontal
        style={styles.quadro}
        ref={marcarScrollKanban('confec')}
        contentContainerStyle={{ height: '100%', paddingHorizontal: 16, gap: 12, paddingBottom: 16 }}
      >
        {colunas.map((coluna, indice) => {
          const cards = porColuna.get(coluna.slug) ?? [];
          const concluida = ehColunaConclusao(coluna, colunas);
          return (
            <View
              key={coluna.id}
              ref={marcarColuna(coluna.slug)}
              style={[styles.coluna, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, borderTopColor: coluna.color }]}
            >
              <View style={styles.colunaTopo}>
                <Text style={{ color: theme.headerText, fontWeight: '800', flex: 1 }}>
                  {coluna.title} <Text style={{ color: coluna.color }}>{cards.length}</Text>
                </Text>
                {owner ? (
                  <SemArraste>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        disabled={indice === 0}
                        onPress={() => {
                          const ids = colunas.map((item) => item.id);
                          const anterior = ids[indice - 1];
                          ids[indice - 1] = ids[indice];
                          ids[indice] = anterior;
                          void reordenarColunasConfec(ids).then(() => qc.invalidateQueries({ queryKey: ['confec_kanban'] }));
                        }}
                      >
                        <FontAwesome name="chevron-left" size={12} color={theme.textMuted} />
                      </Pressable>
                      <Pressable
                        disabled={indice === colunas.length - 1}
                        onPress={() => {
                          const ids = colunas.map((item) => item.id);
                          const proxima = ids[indice + 1];
                          ids[indice + 1] = ids[indice];
                          ids[indice] = proxima;
                          void reordenarColunasConfec(ids).then(() => qc.invalidateQueries({ queryKey: ['confec_kanban'] }));
                        }}
                      >
                        <FontAwesome name="chevron-right" size={12} color={theme.textMuted} />
                      </Pressable>
                    </View>
                  </SemArraste>
                ) : null}
              </View>
              <SemArraste>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                  <Pressable onPress={() => { setColunaEdit(coluna); setNomeLista(coluna.title); setCorLista(coluna.color); }}>
                    <Text style={{ color: theme.cadastroAction, fontSize: 12, fontWeight: '700' }}>Editar</Text>
                  </Pressable>
                  {canDeleteRecords ? (
                    <Pressable
                      onPress={() =>
                        excluirColunaConfec(coluna.id, colunas)
                          .then(() => qc.invalidateQueries({ queryKey: ['confec_kanban'] }))
                          .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao excluir a lista'))
                      }
                    >
                      <Text style={{ color: theme.error, fontSize: 12, fontWeight: '700' }}>Excluir</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => abrirNovo(coluna.slug)}>
                    <Text style={{ color: theme.headerText, fontSize: 12, fontWeight: '800' }}>Novo card</Text>
                  </Pressable>
                </View>
              </SemArraste>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 12 }} nestedScrollEnabled>
                {cards.map((card) => (
                  <TicketCard
                    key={card.id}
                    card={card}
                    cor={concluida ? '#22C55E' : coluna.color}
                    onAbrir={() => setDetalheId(card.id)}
                    onArrastar={(x, y) => {
                      posicao.current = { x, y };
                      posicionarFantasma(fantasmaRef.current, x, y, true);
                      setRotulo(`#${numeroTicket(card.ticket_number)}`);
                    }}
                    onSoltar={(x, y) => aoSoltar(card, x, y)}
                  />
                ))}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={detalhe != null && rascunho == null} animationType="fade" transparent onRequestClose={() => setDetalheId(null)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDetalheId(null)} />
          <ScrollView style={styles.modal} contentContainerStyle={{ gap: 8 }}>
            {detalhe ? (
              <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 18 }}>
                  #{numeroTicket(detalhe.ticket_number)} {detalhe.title}
                </Text>
                <Text style={{ color: theme.textMuted }}>
                  {colunas.find((coluna) => coluna.slug === detalhe.status)?.title ?? detalhe.status}
                  {detalhe.cliente_nome ? ` · ${detalhe.cliente_nome}` : ''}
                </Text>
                <Text style={{ color: theme.text }}>{detalhe.description || 'Sem observações do ticket.'}</Text>
                <Text style={{ color: theme.text }}>{detalhe.dev_notes || 'Sem observações DEV.'}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                  Seção: {detalhe.secao || '—'} · Tela: {detalhe.tela || '—'}
                  {detalhe.tela_nova ? ' (nova)' : ''}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                  Analista: {detalhe.analista_email || '—'} · Desenvolvedor: {detalhe.desenvolvedor_email || '—'}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                  Criado por {detalhe.created_by_email || '—'} em {formatDateTimeBR(detalhe.created_at)}
                  {detalhe.completed_at ? ` · Concluído em ${formatDateTimeBR(detalhe.completed_at)}` : ''}
                </Text>
                {detalhe.nota_linha ? (
                  <View style={{ gap: 4, marginTop: 4 }}>
                    <Text style={{ color: theme.headerText, fontWeight: '800' }}>Nota publicada</Text>
                    <Text style={{ color: theme.text }}>{detalhe.nota_linha}</Text>
                    {detalhe.nota_detalhe ? <Text style={{ color: theme.textMuted }}>{detalhe.nota_detalhe}</Text> : null}
                    <Pressable
                      onPress={() =>
                        gerarESalvarNotaConfec({
                          cardId: detalhe.id,
                          secao: detalhe.secao ?? undefined,
                          tela: detalhe.tela ?? undefined,
                          telaNova: detalhe.tela_nova,
                        })
                          .then(() => {
                            void qc.invalidateQueries({ queryKey: ['confec_kanban'] });
                            void qc.invalidateQueries({ queryKey: ['confec_notas_publicadas'] });
                          })
                          .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao regenerar a nota'))
                      }
                    >
                      <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>Regenerar nota com IA</Text>
                    </Pressable>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {detalhe.etiquetas.map((etiqueta) => (
                    <Text key={etiqueta.id} style={{ color: etiqueta.color, fontWeight: '800' }}>{etiqueta.name}</Text>
                  ))}
                </View>
                {detalhe.imagens.map((imagem) => (
                  <View key={imagem.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Pressable onPress={() => setImagemAberta(imagem.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Image source={{ uri: imagem.url }} style={styles.miniatura} />
                      <Text style={{ color: theme.cadastroAction, flex: 1 }}>{imagem.nome}</Text>
                    </Pressable>
                    <Pressable onPress={() => void excluirAnexoConfec(imagem, true).then(() => qc.invalidateQueries({ queryKey: ['confec_kanban'] }))}>
                      <Text style={{ color: theme.error, fontSize: 12 }}>Excluir</Text>
                    </Pressable>
                  </View>
                ))}
                {detalhe.arquivos.map((arquivo) => (
                  <View key={arquivo.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Pressable onPress={() => void Linking.openURL(arquivo.url)}>
                      <Text style={{ color: theme.cadastroAction }}>{arquivo.nome}</Text>
                    </Pressable>
                    <Pressable onPress={() => void excluirAnexoConfec(arquivo, false).then(() => qc.invalidateQueries({ queryKey: ['confec_kanban'] }))}>
                      <Text style={{ color: theme.error, fontSize: 12 }}>Excluir</Text>
                    </Pressable>
                  </View>
                ))}
                <Text style={{ color: theme.headerText, fontWeight: '800' }}>Checklist</Text>
                {detalhe.checklist.map((item) => (
                  <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Pressable style={{ flex: 1 }} onPress={() => void alternarChecklistConfec(item.id, !item.feito).then(() => qc.invalidateQueries({ queryKey: ['confec_kanban'] }))}>
                      <Text style={{ color: theme.text }}>{item.feito ? '☑' : '☐'} {item.texto}</Text>
                    </Pressable>
                    <Pressable onPress={() => void excluirChecklistConfec(item.id).then(() => qc.invalidateQueries({ queryKey: ['confec_kanban'] }))}>
                      <Text style={{ color: theme.error, fontSize: 12 }}>Excluir</Text>
                    </Pressable>
                  </View>
                ))}
                <FormInput value={checklistTexto} onChangeText={setChecklistTexto} placeholder="Novo item do checklist" />
                <PrimaryButton
                  compact
                  label="Adicionar item"
                  onPress={() =>
                    adicionarChecklistConfec(detalhe.id, checklistTexto)
                      .then(() => {
                        setChecklistTexto('');
                        void qc.invalidateQueries({ queryKey: ['confec_kanban'] });
                      })
                      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro no checklist'))
                  }
                />
                <Text style={{ color: theme.headerText, fontWeight: '800' }}>Comentários</Text>
                {detalhe.comentarios.map((item) => (
                  <View key={item.id} style={{ gap: 2 }}>
                    <Text style={{ color: theme.text }}>{item.texto}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 11 }}>{item.author_email} · {formatDateTimeBR(item.created_at)}</Text>
                    {item.author_email.toLowerCase() === email.toLowerCase() ? (
                      <Pressable onPress={() => setComentarioEdit({ id: item.id, texto: item.texto })}>
                        <Text style={{ color: theme.cadastroAction, fontSize: 12 }}>Editar</Text>
                      </Pressable>
                    ) : null}
                    {item.author_email.toLowerCase() === email.toLowerCase() || canDeleteRecords ? (
                      <Pressable onPress={() => void excluirComentarioConfec(item.id).then(() => qc.invalidateQueries({ queryKey: ['confec_kanban'] }))}>
                        <Text style={{ color: theme.error, fontSize: 12 }}>Excluir</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                <FormInput value={comentario} onChangeText={setComentario} placeholder="Comentário" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <PrimaryButton
                    compact
                    label="Comentar"
                    style={{ flex: 1 }}
                    onPress={() =>
                      adicionarComentarioConfec(detalhe.id, comentario, email)
                        .then(() => {
                          setComentario('');
                          void qc.invalidateQueries({ queryKey: ['confec_kanban'] });
                        })
                        .catch((e) => setErro(e instanceof Error ? e.message : 'Erro no comentário'))
                    }
                  />
                  <PrimaryButton compact label="Editar" style={{ flex: 1 }} onPress={() => abrirEdicao(detalhe)} />
                </View>
                {canDeleteRecords ? (
                  <Pressable
                    onPress={() =>
                      excluirCardConfec(detalhe.id)
                        .then(() => {
                          auditar('Excluiu card do Kanban Confec', detalhe.id, { titulo: detalhe.title }, null);
                          setDetalheId(null);
                          void qc.invalidateQueries({ queryKey: ['confec_kanban'] });
                        })
                        .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao excluir'))
                    }
                  >
                    <Text style={{ color: theme.error, fontWeight: '800' }}>Excluir ticket</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={rascunho != null} animationType="fade" transparent onRequestClose={() => void fecharEdicao()}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => void fecharEdicao()} />
          {rascunho ? (
            <ScrollView style={styles.modal} keyboardShouldPersistTaps="handled">
              <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 18 }}>
                  {rascunho.id ? 'Editar ticket' : 'Novo ticket'}
                </Text>
                <FormField label="Título" required>
                  <FormInput value={rascunho.title} onChangeText={(title) => setRascunho({ ...rascunho, title })} placeholder="O que precisa ser feito" />
                </FormField>
                <FormField label="Observações do ticket">
                  <FormInput value={rascunho.description} onChangeText={(description) => setRascunho({ ...rascunho, description })} multiline style={styles.area} />
                </FormField>
                <FormField label="Observações / correções (DEV)">
                  <FormInput value={rascunho.devNotes} onChangeText={(devNotes) => setRascunho({ ...rascunho, devNotes })} multiline style={styles.area} />
                </FormField>
                <FormField label="Cliente">
                  <ClienteSearchPicker
                    todosClientes={clientesQ.data ?? []}
                    value={clienteRascunho}
                    onChange={(cliente: ClienteAzoupRow | null) => setRascunho({ ...rascunho, clienteId: cliente?.id ?? null })}
                    loading={clientesQ.isLoading}
                    placeholderBusca="Buscar cliente (opcional)"
                  />
                </FormField>
                <FormField label="Analista">
                  <FormSelect options={emails} value={rascunho.analista || VAZIO} onChange={(valor) => setRascunho({ ...rascunho, analista: valor === VAZIO ? '' : valor })} labels={{ [VAZIO]: 'Nenhum' }} />
                </FormField>
                <FormField label="Desenvolvedor">
                  <FormSelect options={emails} value={rascunho.desenvolvedor || VAZIO} onChange={(valor) => setRascunho({ ...rascunho, desenvolvedor: valor === VAZIO ? '' : valor })} labels={{ [VAZIO]: 'Nenhum' }} />
                </FormField>
                <FormField label="Seção do sistema" required>
                  <FormSelect
                    options={[VAZIO, ...CONFEC_SECOES]}
                    value={rascunho.secao || VAZIO}
                    onChange={(valor) => setRascunho({ ...rascunho, secao: valor === VAZIO ? '' : (valor as ConfecSecao) })}
                    labels={{ [VAZIO]: 'Selecione…' }}
                  />
                </FormField>
                <FormField label="Tela do sistema" required>
                  <FormInput
                    value={rascunho.tela}
                    onChangeText={(tela) => setRascunho({ ...rascunho, tela })}
                    placeholder={rascunho.telaNova ? 'Nome da tela nova' : 'Ex.: Pedidos, PDV, Romaneio'}
                  />
                </FormField>
                <Pressable
                  onPress={() => setRascunho({ ...rascunho, telaNova: !rascunho.telaNova })}
                  style={[
                    styles.chip,
                    {
                      alignSelf: 'flex-start',
                      borderColor: rascunho.telaNova ? theme.cadastroAction : theme.border,
                      backgroundColor: rascunho.telaNova ? theme.cadastroAction : theme.surface,
                    },
                  ]}
                >
                  <Text style={{ color: rascunho.telaNova ? theme.cadastroActionText : theme.textMuted, fontWeight: '800', fontSize: 12 }}>
                    {rascunho.telaNova ? '✓ Tela nova' : 'Marcar como tela nova'}
                  </Text>
                </Pressable>
                <FormField label="Mover para">
                  <FormSelect
                    options={colunas.map((coluna) => coluna.slug)}
                    value={rascunho.status}
                    onChange={(status) => setRascunho({ ...rascunho, status })}
                    labels={Object.fromEntries(colunas.map((coluna) => [coluna.slug, coluna.title]))}
                  />
                </FormField>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Etiquetas</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {(quadro?.etiquetas ?? []).map((etiqueta) => {
                    const ativa = rascunho.labelIds.includes(etiqueta.id);
                    return (
                      <Pressable
                        key={etiqueta.id}
                        onPress={() =>
                          setRascunho({
                            ...rascunho,
                            labelIds: ativa ? rascunho.labelIds.filter((id) => id !== etiqueta.id) : [...rascunho.labelIds, etiqueta.id],
                          })
                        }
                        style={[styles.chip, { borderColor: etiqueta.color, backgroundColor: ativa ? etiqueta.color : theme.surface }]}
                      >
                        <Text style={{ color: ativa ? '#1A1408' : etiqueta.color, fontWeight: '800', fontSize: 12 }}>{etiqueta.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Criado por {email || '—'}. Cole uma imagem com Ctrl+V.</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => escolherArquivo(true)}
                    style={({ pressed }) => [styles.btn, styles.btnSecundario, { borderColor: theme.border, backgroundColor: theme.surface, opacity: pressed ? 0.88 : 1 }]}
                  >
                    <Text style={[styles.btnTexto, { color: theme.headerText }]}>Imagem</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => escolherArquivo(false)}
                    style={({ pressed }) => [styles.btn, styles.btnSecundario, { borderColor: theme.border, backgroundColor: theme.surface, opacity: pressed ? 0.88 : 1 }]}
                  >
                    <Text style={[styles.btnTexto, { color: theme.headerText }]}>Arquivo</Text>
                  </Pressable>
                </View>
                <PrimaryButton label={salvar.isPending ? 'Salvando…' : 'Salvar'} loading={salvar.isPending} onPress={() => salvar.mutate(rascunho)} />
              </View>
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      <Modal visible={etiquetasAbertas} animationType="fade" transparent onRequestClose={() => setEtiquetasAbertas(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEtiquetasAbertas(false)} />
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, width: '100%', maxWidth: 420 }]}>
            <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 18 }}>Etiquetas</Text>
            {(quadro?.etiquetas ?? []).map((etiqueta) => (
              <View key={etiqueta.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: etiqueta.color, fontWeight: '800' }}>{etiqueta.name}</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Pressable onPress={() => { setEtiquetaEdit(etiqueta); setNomeEtiqueta(etiqueta.name); setCorEtiqueta(etiqueta.color); }}>
                    <Text style={{ color: theme.cadastroAction }}>Editar</Text>
                  </Pressable>
                  {canDeleteRecords ? (
                    <Pressable onPress={() => void excluirEtiquetaConfec(etiqueta.id).then(() => qc.invalidateQueries({ queryKey: ['confec_kanban'] }))}>
                      <Text style={{ color: theme.error }}>Excluir</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
            <FormInput value={nomeEtiqueta} onChangeText={setNomeEtiqueta} placeholder="Nome da etiqueta" />
            <SeletorCor cor={corEtiqueta} onChange={setCorEtiqueta} />
            {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}
            <PrimaryButton
              label={etiquetaEdit ? 'Salvar etiqueta' : 'Criar etiqueta'}
              onPress={() => {
                const cor = normalizarCor(corEtiqueta);
                if (!cor) {
                  setErro('Escolha uma cor no formato #RRGGBB.');
                  return;
                }
                void salvarEtiquetaConfec({ id: etiquetaEdit?.id, name: nomeEtiqueta, color: cor })
                  .then(() => {
                    setNomeEtiqueta('');
                    setEtiquetaEdit(null);
                    setCorEtiqueta(cor);
                    setErro(null);
                    void qc.invalidateQueries({ queryKey: ['confec_kanban'] });
                  })
                  .catch((e) => setErro(e instanceof Error ? e.message : 'Erro na etiqueta'));
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={novaLista || colunaEdit != null} animationType="fade" transparent onRequestClose={() => { setNovaLista(false); setColunaEdit(null); }}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setNovaLista(false); setColunaEdit(null); }} />
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, width: '100%', maxWidth: 420 }]}>
            <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 18 }}>{colunaEdit ? 'Editar lista' : 'Nova lista'}</Text>
            <FormInput value={nomeLista} onChangeText={setNomeLista} placeholder="Nome" />
            <SeletorCor cor={corLista} onChange={setCorLista} />
            {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}
            <PrimaryButton
              label="Salvar lista"
              onPress={() => {
                const cor = normalizarCor(corLista);
                if (!cor) {
                  setErro('Escolha uma cor no formato #RRGGBB.');
                  return;
                }
                const acao = colunaEdit ? atualizarColunaConfec(colunaEdit.id, nomeLista, cor) : criarColunaConfec(nomeLista, cor);
                void acao
                  .then(() => {
                    setNovaLista(false);
                    setColunaEdit(null);
                    void qc.invalidateQueries({ queryKey: ['confec_kanban'] });
                  })
                  .catch((e) => setErro(e instanceof Error ? e.message : 'Erro na lista'));
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={pdfAberto} animationType="fade" transparent onRequestClose={() => setPdfAberto(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPdfAberto(false)} />
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, width: '100%', maxWidth: 420 }]}>
            <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 18 }}>PDF concluídos</Text>
            <FormField label="De">
              <FormDateInput value={pdfDe} onChange={setPdfDe} />
            </FormField>
            <FormField label="Até">
              <FormDateInput value={pdfAte} onChange={setPdfAte} />
            </FormField>
            <PrimaryButton
              label="Abrir PDF"
              onPress={() => {
                const lista = (quadro?.cards ?? []).filter((card) => {
                  if (!conclusao || card.status !== conclusao.slug) return false;
                  const dia = dataCalendarioBrasil(card.completed_at) ?? '';
                  if (pdfDe && dia < pdfDe) return false;
                  if (pdfAte && dia > pdfAte) return false;
                  return true;
                });
                abrirPdfConcluidosConfec(lista, pdfDe || dataHojeBrasil(), pdfAte || dataHojeBrasil());
                setPdfAberto(false);
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={imagemAberta != null} animationType="fade" transparent onRequestClose={() => setImagemAberta(null)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setImagemAberta(null)} />
          {imagemAberta ? <Image source={{ uri: imagemAberta }} style={styles.lightbox} resizeMode="contain" /> : null}
        </View>
      </Modal>

      <Modal visible={comentarioEdit != null} animationType="fade" transparent onRequestClose={() => setComentarioEdit(null)}>
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, width: '100%', maxWidth: 420 }]}>
            <FormInput value={comentarioEdit?.texto ?? ''} onChangeText={(texto) => setComentarioEdit((atual) => (atual ? { ...atual, texto } : atual))} />
            <PrimaryButton
              label="Salvar comentário"
              onPress={() => {
                if (!comentarioEdit) return;
                void editarComentarioConfec(comentarioEdit.id, comentarioEdit.texto)
                  .then(() => {
                    setComentarioEdit(null);
                    void qc.invalidateQueries({ queryKey: ['confec_kanban'] });
                  })
                  .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao editar comentário'));
              }}
            />
          </View>
        </View>
      </Modal>

      <View ref={fantasmaRef} pointerEvents="none" style={[styles.fantasma, { backgroundColor: theme.surface, borderColor: theme.cadastroAction }]}>
        <Text style={{ color: theme.headerText, fontWeight: '800' }}>{rotulo}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  filtros: { flexGrow: 0, flexShrink: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 10 },
  barraTopo: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  titulo: { fontWeight: '900', fontSize: 20, letterSpacing: -0.3 },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  barraFiltros: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  busca: { flexGrow: 1, flexShrink: 1, minWidth: 220, maxWidth: 420 },
  filtro: { width: 190, flexGrow: 0 },
  etiquetasFiltro: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quadro: { flex: 1, minHeight: 0 },
  btn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecundario: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  btnPrimario: {
    borderWidth: 0,
    shadowColor: '#F07167',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  btnTexto: { fontWeight: '800', fontSize: 13 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  coluna: { width: 300, minHeight: 420, height: '100%', borderWidth: 1, borderTopWidth: 4, borderRadius: 12, padding: 10 },
  miniatura: { width: 72, height: 52, borderRadius: 8, backgroundColor: '#111' },
  lightbox: { width: '92%', height: '82%' },
  colunaTopo: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 2 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modal: { width: '100%', maxWidth: 560, maxHeight: '90%' },
  modalCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  area: { minHeight: 88, height: 88, textAlignVertical: 'top', paddingTop: 10 },
  fantasma: { position: 'absolute', opacity: 0, borderWidth: 1, borderRadius: 10, padding: 8, maxWidth: 220 },
});
