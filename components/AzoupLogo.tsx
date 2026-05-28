import { Image, type ImageStyle, StyleSheet, View, type ViewStyle } from 'react-native';

const logoSource = require('@/favicon-512.png');

type AzoupLogoProps = {
  size?: number;
  style?: ViewStyle;
  imageStyle?: ImageStyle;
};

/** Logo Azoup (favicon-512) para login, cabeçalhos e telas do painel. */
export function AzoupLogo({ size = 72, style, imageStyle }: AzoupLogoProps) {
  return (
    <View style={[styles.wrap, style]}>
      <Image
        source={logoSource}
        style={[styles.img, { width: size, height: size }, imageStyle]}
        accessibilityLabel="Logo Azoup"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  img: { resizeMode: 'contain' },
});
