import { Link } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { ui } from '@/src/theme/ui';

export default function BillingHubScreen() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Cobrança</Text>
      <Text style={styles.sub}>Gerencie período de teste, cupons no Stripe e planos disponíveis.</Text>

      <Link href="/billing/trial" asChild>
        <Pressable style={styles.card}>
          <Text style={styles.cardTitle}>Período de teste padrão</Text>
          <Text style={styles.cardBody}>Define `admin_billing_settings.trial_dias_padrao` sem precisar de deploy.</Text>
        </Pressable>
      </Link>

      <Link href="/billing/coupons" asChild>
        <Pressable style={styles.card}>
          <Text style={styles.cardTitle}>Cupons do Stripe</Text>
          <Text style={styles.cardBody}>Cria cupom e promotion code no Stripe e registra em `admin_coupons`.</Text>
        </Pressable>
      </Link>

      <Link href="/billing/plans" asChild>
        <Pressable style={styles.card}>
          <Text style={styles.cardTitle}>Planos de assinatura</Text>
          <Text style={styles.cardBody}>Visualização dos planos sincronizados com o núcleo do Azoup.</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, gap: 12, backgroundColor: ui.bg },
  title: { fontSize: 24, fontWeight: '800', color: ui.navy },
  sub: { color: ui.muted, marginBottom: 8 },
  card: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 16,
    padding: 14,
    gap: 6,
    backgroundColor: ui.card,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: ui.navySoft },
  cardBody: { color: ui.muted, lineHeight: 20 },
});
