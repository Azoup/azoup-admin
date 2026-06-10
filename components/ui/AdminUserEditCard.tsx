import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/Themed';
import { AdminScreenAccessPicker } from '@/components/ui/AdminScreenAccessPicker';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { FormField } from '@/components/ui/FormField';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { type AdminScreenKey, telasPadraoPorPapel } from '@/src/constants/admin-screens';
import { useTheme } from '@/src/contexts/ThemeContext';
import { atualizarAdminViaFunction } from '@/src/services/stripe-admin-api';
import type { AdminPapel } from '@/src/types/azoup';
import { normalizarTelasAcesso, rotularTelasAcesso, validarTelasParaCriacao } from '@/src/utils/admin-permissions';

type AdminRow = {
  id: string;
  email?: string | null;
  role?: AdminPapel | string | null;
  active?: boolean | null;
  telas_acesso?: unknown;
};

type Props = {
  admin: AdminRow;
  expanded: boolean;
  onToggleEdit: () => void;
  onSaved: () => void;
};

function telasIniciais(raw: unknown, role: AdminPapel): AdminScreenKey[] {
  const custom = normalizarTelasAcesso(raw);
  return custom.length > 0 ? custom : telasPadraoPorPapel(role);
}

export function AdminUserEditCard({ admin, expanded, onToggleEdit, onSaved }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(), []);

  const roleInicial = (`${admin.role ?? 'viewer'}` as AdminPapel);
  const [role, setRole] = useState<AdminPapel>(roleInicial);
  const [telas, setTelas] = useState<AdminScreenKey[]>(() => telasIniciais(admin.telas_acesso, roleInicial));
  const [active, setActive] = useState(admin.active !== false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const telasErr = validarTelasParaCriacao(telas, role);
      if (telasErr) throw new Error(telasErr);
      return atualizarAdminViaFunction({
        id: admin.id,
        role,
        active,
        telas_acesso: telas,
      });
    },
    onSuccess: () => {
      onSaved();
      onToggleEdit();
    },
  });

  const resetForm = () => {
    const r = (`${admin.role ?? 'viewer'}` as AdminPapel);
    setRole(r);
    setTelas(telasIniciais(admin.telas_acesso, r));
    setActive(admin.active !== false);
  };

  return (
    <ScreenCard style={{ marginTop: 8, gap: 10 }}>
      <Text style={{ color: theme.headerText, fontWeight: '800' }}>{`${admin.email ?? ''}`}</Text>
      <Text style={{ color: theme.textMuted, fontSize: 13 }}>
        Perfil: {`${admin.role ?? '-'}`} · Ativo: {admin.active ? 'Sim' : 'Não'}
      </Text>
      <Text style={{ color: theme.textMuted, fontSize: 12 }}>
        Telas: {rotularTelasAcesso(admin.telas_acesso, roleInicial)}
      </Text>

      {!expanded ? (
        <SecondaryButton label="Editar perfil e telas" onPress={onToggleEdit} style={{ alignSelf: 'flex-start' }} />
      ) : (
        <View style={{ gap: 12, marginTop: 4 }}>
          <FormField label="Perfil">
            <ChipSelect
              options={['owner', 'manager', 'viewer'] as const}
              value={role}
              onChange={(next) => {
                setRole(next);
                setTelas(telasPadraoPorPapel(next));
              }}
            />
          </FormField>
          <FormField label="Telas liberadas" required>
            <AdminScreenAccessPicker value={telas} onChange={setTelas} role={role} />
          </FormField>
          <View style={styles.rowBetween}>
            <Text style={{ color: theme.textMuted }}>Acesso ativo</Text>
            <Switch value={active} onValueChange={setActive} trackColor={{ true: theme.cadastroAction }} />
          </View>
          <View style={styles.actions}>
            <PrimaryButton
              label={saveMutation.isPending ? 'Salvando…' : 'Salvar alterações'}
              loading={saveMutation.isPending}
              onPress={() => saveMutation.mutate()}
              style={{ flex: 1 }}
            />
            <SecondaryButton
              label="Cancelar"
              onPress={() => {
                resetForm();
                onToggleEdit();
              }}
              style={{ flex: 1 }}
            />
          </View>
          {saveMutation.error ? (
            <Text style={{ color: theme.error, fontWeight: '700' }}>{(saveMutation.error as Error).message}</Text>
          ) : null}
        </View>
      )}
    </ScreenCard>
  );
}

function getStyles() {
  return StyleSheet.create({
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    actions: { flexDirection: 'row', gap: 8 },
  });
}
