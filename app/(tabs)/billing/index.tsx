import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link } from 'expo-router';
import { Pressable } from 'react-native';

import { PageHeader } from '@/components/ui/PageHeader';
import { Screen } from '@/components/ui/Screen';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { Text } from '@/components/Themed';
import { useTheme } from '@/src/contexts/ThemeContext';

const LINKS = [
  {
    href: '/billing/trial' as const,
    title: 'Período de teste padrão',
    body: 'Define admin_billing_settings.trial_dias_padrao sem precisar de deploy.',
    icon: 'clock-o' as const,
  },
  {
    href: '/billing/coupons' as const,
    title: 'Cupons do Stripe',
    body: 'Cria cupom e promotion code no Stripe e registra em admin_coupons.',
    icon: 'ticket' as const,
  },
  {
    href: '/billing/plans' as const,
    title: 'Planos de assinatura',
    body: 'Visualização dos planos sincronizados com o núcleo do Azoup.',
    icon: 'list-alt' as const,
  },
];

export default function BillingHubScreen() {
  const { theme } = useTheme();

  return (
    <Screen scroll>
      <PageHeader title="Cobrança" subtitle="Gerencie período de teste, cupons no Stripe e planos disponíveis." />

      {LINKS.map((item) => (
        <Link key={item.href} href={item.href} asChild>
          <Pressable>
            <ScreenCard style={{ gap: 8 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: theme.headerText }}>
                <FontAwesome name={item.icon} size={16} color={theme.cadastroAction} /> {item.title}
              </Text>
              <Text style={{ color: theme.textMuted, lineHeight: 20 }}>{item.body}</Text>
            </ScreenCard>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
