import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useTheme } from '@/src/contexts/ThemeContext';

type Props = {
  href: string;
  label?: string;
};

export function BackLink({ href, label = 'Voltar' }: Props) {
  const { theme } = useTheme();

  return (
    <Link href={href as never} asChild>
      <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, alignSelf: 'flex-start' }}>
        <FontAwesome name="chevron-left" size={14} color={theme.cadastroAction} />
        <Text style={{ color: theme.cadastroAction, fontWeight: '700', fontSize: 14 }}>{label}</Text>
      </Pressable>
    </Link>
  );
}
