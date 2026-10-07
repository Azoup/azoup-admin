import { useMemo } from 'react';
import { Linking, Text, View } from 'react-native';

import { parseDescricaoAgenda } from '@/src/utils/agenda-html';

export function DescricaoAgenda({
  html,
  color,
  muted,
  link,
}: {
  html?: string | null;
  color: string;
  muted: string;
  link: string;
}) {
  const blocos = useMemo(() => parseDescricaoAgenda(html), [html]);
  if (!blocos.length) return null;

  return (
    <View style={{ gap: 8 }}>
      {blocos.map((bloco, indice) => (
        <View key={indice} style={bloco.tipo === 'item' ? { flexDirection: 'row', gap: 8, paddingLeft: 4 } : undefined}>
          {bloco.tipo === 'item' ? <Text style={{ color: muted, fontSize: 13, lineHeight: 20 }}>•</Text> : null}
          <Text style={{ color, fontSize: 13, lineHeight: 20, flex: 1 }}>
            {bloco.trechos.map((trecho, i) => (
              <Text
                key={i}
                style={{
                  color: trecho.href ? link : color,
                  fontWeight: trecho.bold ? '800' : '500',
                  textDecorationLine: trecho.href ? 'underline' : 'none',
                }}
                onPress={
                  trecho.href
                    ? () => {
                        void Linking.openURL(trecho.href!);
                      }
                    : undefined
                }
              >
                {trecho.text}
              </Text>
            ))}
          </Text>
        </View>
      ))}
    </View>
  );
}
