import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Source } from 'react-native-next-image';
import Button from '../components/Button';
import DemoTile from '../components/DemoTile';
import Screen from '../components/Screen';
import Section from '../components/Section';
import { useCycle } from '../hooks/useCycle';
import { colors, shared } from '../theme';
import { idUri } from '../urls';

const SOURCE: Source = { uri: idUri(1050) };

type Tint = { label: string; value: string | undefined };
const TINTS: readonly [Tint, ...Tint[]] = [
  { label: 'none', value: undefined },
  { label: 'indigo', value: '#6366f1' },
  { label: 'rose', value: '#f43f5e' },
];

export default function EffectsScreen() {
  const [borderRadius, nextRadius] = useCycle([0, 12, 32]);
  const [blurRadius, nextBlur] = useCycle([0, 5, 15, 40]);
  const [tint, nextTint] = useCycle(TINTS);
  const [isCircle, setIsCircle] = useState(false);
  const [grayscale, setGrayscale] = useState(false);
  const [downsample, setDownsample] = useState(true);

  // Rounding through style only, to prove the prop is optional.
  const styleRounded = useMemo(
    () => [styles.square, { borderRadius }],
    [borderRadius]
  );

  return (
    <Screen>
      <Section
        title="Controls"
        description="Every button cycles one prop. Both images use resizeMode contain on a 3:2 photo, so the indigo container background is visible at the corners."
      >
        <View style={shared.wrapRow}>
          <Button
            title={`borderRadius: ${borderRadius}`}
            onPress={nextRadius}
          />
          <Button
            title={`isCircle: ${isCircle ? 'on' : 'off'}`}
            onPress={() => setIsCircle((value) => !value)}
          />
          <Button
            title={`grayscale: ${grayscale ? 'on' : 'off'}`}
            onPress={() => setGrayscale((value) => !value)}
          />
          <Button title={`blurRadius: ${blurRadius}`} onPress={nextBlur} />
          <Button title={`tintColor: ${tint.label}`} onPress={nextTint} />
          <Button
            title={`downsample: ${downsample ? 'on' : 'off'}`}
            onPress={() => setDownsample((value) => !value)}
          />
        </View>
      </Section>

      <Section
        title="Prop driven"
        description="borderRadius, isCircle, grayscale, blurRadius, tintColor and downsample passed as props."
      >
        <DemoTile
          source={SOURCE}
          resizeMode="contain"
          borderRadius={borderRadius}
          isCircle={isCircle}
          grayscale={grayscale}
          blurRadius={blurRadius}
          tintColor={tint.value}
          downsample={downsample}
          style={styles.square}
        />
      </Section>

      <Section
        title="Style driven"
        description="Only style.borderRadius, no borderRadius prop. The image and its container must round identically to the tile above when isCircle is off."
      >
        <DemoTile source={SOURCE} resizeMode="contain" style={styleRounded} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  square: {
    width: 200,
    height: 200,
    backgroundColor: colors.accentSoft,
  },
});
