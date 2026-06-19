import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenCard } from '@/components/ui/ScreenCard';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { useTheme } from '@/src/contexts/ThemeContext';
import type { SuporteVideoRow } from '@/src/types/azoup';
import { extrairYoutubeVideoId, youtubeThumbnailUrl } from '@/src/utils/youtube';

type Props = {
  video: SuporteVideoRow;
  onExcluir?: () => void;
  excluindo?: boolean;
};

export function SuporteVideoCard({ video, onExcluir, excluindo }: Props) {
  const { theme } = useTheme();
  const videoId = extrairYoutubeVideoId(video.youtube_url);

  const abrirYoutube = () => {
    void Linking.openURL(video.youtube_url);
  };

  return (
    <ScreenCard style={{ gap: 10 }}>
      {videoId ? (
        <Pressable onPress={abrirYoutube}>
          <Image source={{ uri: youtubeThumbnailUrl(videoId) }} style={styles.thumb} resizeMode="cover" />
        </Pressable>
      ) : null}

      <View style={styles.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: theme.headerText }}>{video.titulo}</Text>
          <View style={[styles.badge, { backgroundColor: `${theme.cadastroAction}18` }]}>
            <Text style={{ color: theme.cadastroAction, fontWeight: '700', fontSize: 12 }}>{video.categoria}</Text>
          </View>
        </View>
        <Pressable onPress={abrirYoutube} accessibilityLabel="Abrir no YouTube">
          <FontAwesome name="youtube-play" size={28} color={theme.error} />
        </Pressable>
      </View>

      <Text style={{ color: theme.textMuted, fontSize: 13 }} numberOfLines={2}>
        {video.youtube_url}
      </Text>

      {onExcluir ? (
        <SecondaryButton label={excluindo ? 'Removendo…' : 'Remover vídeo'} disabled={excluindo} onPress={onExcluir} />
      ) : null}
    </ScreenCard>
  );
}

const styles = StyleSheet.create({
  thumb: { width: '100%', height: 160, borderRadius: 8, backgroundColor: '#111' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  badge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
});
