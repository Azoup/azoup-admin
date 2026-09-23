import { useEffect, useRef, type ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

type Ponto = { x: number; y: number };

type GestureHandlers = {
  onMove: (ponto: Ponto) => void;
  onDrop: (ponto: Ponto) => void;
  onCancel: () => void;
  scrollSelector?: string;
};

/** Arraste por ponteiro no navegador. O card só muda de coluna depois de um movimento curto. */
export function useCardPointerDrag(handlers: GestureHandlers) {
  const ref = useRef<View>(null);
  const arrastou = useRef(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;

    el.style.cursor = 'grab';
    el.style.userSelect = 'none';
    el.style.touchAction = 'none';

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const alvo = event.target as HTMLElement | null;
      if (alvo?.closest?.('[data-no-drag]')) return;

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      arrastou.current = false;
      let frame = 0;
      let ultimoX = startX;
      let ativo = true;

      const parar = () => {
        if (!ativo) return;
        ativo = false;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('blur', cancel);
        window.cancelAnimationFrame(frame);
        document.body.style.cursor = '';
        el.style.opacity = '';
      };

      const rolar = () => {
        if (!ativo || !arrastou.current) return;
        const seletor = handlersRef.current.scrollSelector;
        const scroller = seletor ? document.querySelector(seletor) : null;
        if (scroller instanceof HTMLElement) {
          const rect = scroller.getBoundingClientRect();
          if (ultimoX < rect.left + 72) scroller.scrollLeft -= 18;
          else if (ultimoX > rect.right - 72) scroller.scrollLeft += 18;
        }
        if (ativo) frame = window.requestAnimationFrame(rolar);
      };

      const move = (ev: PointerEvent) => {
        if (!ativo || ev.pointerId !== pointerId) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!arrastou.current && dx * dx + dy * dy < 36) return;
        if (!arrastou.current) {
          arrastou.current = true;
          document.body.style.cursor = 'grabbing';
          frame = window.requestAnimationFrame(rolar);
        }
        el.style.opacity = '0.45';
        ultimoX = ev.clientX;
        ev.preventDefault();
        handlersRef.current.onMove({ x: ev.clientX, y: ev.clientY });
      };

      const up = (ev: PointerEvent) => {
        const soltou = arrastou.current;
        const x = ev.clientX;
        const y = ev.clientY;
        parar();
        if (soltou) handlersRef.current.onDrop({ x, y });
      };

      const cancel = () => {
        const soltou = arrastou.current;
        parar();
        if (soltou) handlersRef.current.onCancel();
      };

      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('blur', cancel);
    };

    el.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown, true);
      document.body.style.cursor = '';
    };
  }, []);

  return { ref, arrastou };
}

export function colunaSobPonto(x: number, y: number): string | null {
  if (typeof document === 'undefined') return null;
  const nos = document.elementsFromPoint(x, y);
  for (const no of nos) {
    if (!(no instanceof Element)) continue;
    const valor = no.closest('[data-kanban-col]')?.getAttribute('data-kanban-col');
    if (valor) return valor;
  }
  return null;
}

export function marcarColuna(chave: string) {
  return (node: View | null) => {
    const el = node as unknown as { setAttribute?: (nome: string, valor: string) => void } | null;
    el?.setAttribute?.('data-kanban-col', chave);
  };
}

export function marcarScrollKanban(nome: string) {
  return (node: unknown) => {
    const host = node as { getScrollableNode?: () => { setAttribute?: (nome: string, valor: string) => void } } | null;
    const el = host?.getScrollableNode?.() ?? (node as { setAttribute?: (nome: string, valor: string) => void } | null);
    el?.setAttribute?.('data-kanban-scroll', nome);
  };
}

export function posicionarFantasma(node: View | null, x: number, y: number, visivel: boolean) {
  const el = node as unknown as HTMLElement | null;
  if (!el?.style) return;
  el.style.position = 'fixed';
  el.style.left = '0px';
  el.style.top = '0px';
  el.style.zIndex = '10000';
  el.style.pointerEvents = 'none';
  el.style.display = visivel ? 'flex' : 'none';
  el.style.opacity = visivel ? '1' : '0';
  if (visivel) el.style.transform = `translate3d(${Math.round(x + 14)}px, ${Math.round(y + 16)}px, 0)`;
}

export function SemArraste({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<View>(null);
  useEffect(() => {
    const el = ref.current as unknown as { setAttribute?: (nome: string, valor: string) => void } | null;
    el?.setAttribute?.('data-no-drag', '1');
  }, []);
  return (
    <View ref={ref} style={style} collapsable={false}>
      {children}
    </View>
  );
}
