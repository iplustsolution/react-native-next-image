import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { redactHeaders, redactUri } from 'react-native-next-image';
import ModeTile from '../components/ModeTile';
import Screen from '../components/Screen';
import Section from '../components/Section';
import { RAINBOW_DATA_URI } from '../assets/dataUri';
import { colors, spacing } from '../theme';
import { HTTPBIN_JPEG_URI, seedUri, signedUri } from '../urls';

const DEMO_HEADERS = {
  'X-Demo': 'next-image',
  'Authorization': 'Bearer demo-token',
};

// A CR/LF in a value and a forbidden name: both must be dropped, not sent.
const BAD_HEADERS = {
  'X-Bad': 'a\r\nb',
  'Host': 'evil.example.com',
  'X-Kept': 'yes',
};

const DEMO_EXTRAS = { headers: DEMO_HEADERS };
const BAD_EXTRAS = { headers: BAD_HEADERS };

export default function HeadersScreen() {
  const redactions = useMemo(
    () => [
      ['redactUri(signed)', redactUri(signedUri())],
      ['redactUri(data:)', redactUri(RAINBOW_DATA_URI)],
      [
        'redactUri(credentials)',
        redactUri('https://user:secret@example.com/a.jpg?sig=abc'),
      ],
      [
        'redactHeaders',
        JSON.stringify(
          redactHeaders({
            ...DEMO_HEADERS,
            'Cookie': 'session=1',
            'X-Api-Key': 'k-123',
          })
        ),
      ],
    ],
    []
  );

  return (
    <Screen>
      <Section
        title="Custom headers"
        description="X-Demo and Authorization are sent with the request. httpbin.org is slow (5 to 10 seconds), so give it time. reload sends the headers again."
      >
        <Text style={styles.mono}>{JSON.stringify(DEMO_HEADERS)}</Text>
        <ModeTile
          uri={HTTPBIN_JPEG_URI}
          modes={['immutable', 'reload']}
          sourceExtras={DEMO_EXTRAS}
        />
      </Section>

      <Section
        title="Rejected headers"
        description="X-Bad contains a CR/LF and Host is reserved. Both are dropped with a console warning in development; X-Kept still goes through and the image loads normally."
      >
        <Text style={styles.mono}>{JSON.stringify(BAD_HEADERS)}</Text>
        <ModeTile
          uri={seedUri('bad-headers')}
          modes={['immutable']}
          sourceExtras={BAD_EXTRAS}
        />
      </Section>

      <Section
        title="redactUri and redactHeaders"
        description="What the library logs and puts in onError payloads: query strings, credentials and data: bodies are stripped, and secret header values become ***."
      >
        <View style={styles.list}>
          {redactions.map(([label, value]) => (
            <View key={label} style={styles.entry}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.mono} selectable>
                {value}
              </Text>
            </View>
          ))}
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  entry: {
    gap: 2,
  },
  label: {
    color: colors.textFaint,
    fontSize: 11,
  },
  mono: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'monospace',
  },
});
