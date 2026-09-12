import { StyleSheet } from 'react-native';
import type { Source } from 'react-native-next-image';
import DemoTile from '../components/DemoTile';
import ModeTile from '../components/ModeTile';
import Screen from '../components/Screen';
import Section from '../components/Section';
import { RAINBOW_DATA_URI } from '../assets/dataUri';
import { colors } from '../theme';
import { INDIGO_PNG_URI, largeUri } from '../urls';

const LOGO = require('../assets/logo.png');
const PLACEHOLDER = require('../assets/placeholder.png');
const DATA_SOURCE: Source = { uri: RAINBOW_DATA_URI };

export default function LocalScreen() {
  return (
    <Screen>
      <Section
        title="Bundled asset"
        description="source={require('../assets/logo.png')}. Metro serves it in development and the app bundle in release; it skips the URL policy and the viewport gate."
      >
        <DemoTile source={LOGO} resizeMode="contain" style={styles.logo} />
      </Section>

      <Section
        title="Bundled placeholder"
        description="A 2000x1333 photo with placeholder={require('../assets/placeholder.png')}. Load with reload to watch the placeholder again after the photo is cached."
      >
        <ModeTile
          uri={largeUri(1018)}
          modes={['immutable', 'reload']}
          placeholder={PLACEHOLDER}
          resizeMode="cover"
        />
      </Section>

      <Section
        title="Remote placeholder"
        description="placeholder is an https uri (an indigo PNG). It is validated like any source and shown until the photo arrives."
      >
        <ModeTile
          uri={largeUri(1025)}
          modes={['immutable', 'reload']}
          placeholder={INDIGO_PNG_URI}
          resizeMode="cover"
        />
      </Section>

      <Section
        title="data: uri"
        description="A 32x32 PNG inlined as base64. Works because App calls NextImage.configure({ allowDataUri: true }); with the default config this would fail with DATA_URI_NOT_ALLOWED."
      >
        <DemoTile
          source={DATA_SOURCE}
          resizeMode="contain"
          style={styles.dataUri}
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 128,
    height: 128,
    backgroundColor: colors.imageBackground,
  },
  dataUri: {
    width: 96,
    height: 96,
    backgroundColor: colors.imageBackground,
  },
});
