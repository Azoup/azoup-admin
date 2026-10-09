import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { gerarTodosResumosReunioes } from '@/src/services/google-calendar-api';

/** Enquanto o painel está aberto, gera o registro da IA das reuniões que já terminaram. */
export function GeradorResumosAutomatico() {
  const { adminProfile, session } = useAdminAuth();
  const qc = useQueryClient();
  const email = adminProfile?.email ?? session?.user?.email ?? null;

  useQuery({
    queryKey: ['resumos_ia_automaticos', email],
    queryFn: async () => {
      const resultado = await gerarTodosResumosReunioes(email);
      if (resultado.gerados) {
        void qc.invalidateQueries({ queryKey: ['admin_cliente_reunioes'] });
        void qc.invalidateQueries({ queryKey: ['reunioes_sem_registro'] });
        void qc.invalidateQueries({ queryKey: ['pendencias_abertas'] });
        void qc.invalidateQueries({ queryKey: ['google_agenda_cliente'] });
      }
      return resultado;
    },
    staleTime: 60_000,
    refetchInterval: 3 * 60_000,
    retry: false,
  });

  return null;
}
