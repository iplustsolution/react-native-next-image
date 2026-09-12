import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import NextImage, {
  type OnErrorEvent,
  type Source,
} from 'react-native-next-image';
import Button from '../components/Button';
import DemoTile from '../components/DemoTile';
import EventLog from '../components/EventLog';
import Screen from '../components/Screen';
import Section from '../components/Section';
import { useEventLog } from '../hooks/useEventLog';
import { colors, shared, spacing } from '../theme';
import {
  FTP_URI,
  INSECURE_URI,
  NOT_FOUND_URI,
  PRIVATE_HOST_URI,
  UNREACHABLE_URI,
} from '../urls';

const FALLBACK = require('../assets/fallback.png');

type ErrorCase = {
  title: string;
  uri: string;
  expected: string;
  note: string;
};

const CASES: readonly ErrorCase[] = [
  {
    title: '404',
    uri: NOT_FOUND_URI,
    expected: 'HTTP_CLIENT, status 404',
    note: 'A 4xx is final, so no retry is attempted.',
  },
  {
    title: 'Unreachable host',
    uri: UNREACHABLE_URI,
    expected: 'NETWORK',
    note: 'Retried natively with backoff: retryCount 3, retryDelay 500 ms doubling, so onError arrives after roughly 3.5 s. onLoadStart fires once per load, not per retry.',
  },
  {
    title: 'Plain http',
    uri: INSECURE_URI,
    expected: 'INSECURE_SCHEME',
    note: 'Rejected in JS before any request, because allowInsecureHttp is false.',
  },
  {
    title: 'Private host',
    uri: PRIVATE_HOST_URI,
    expected: 'PRIVATE_HOST_BLOCKED',
    note: 'Rejected in JS before any request, because blockPrivateNetworks is true.',
  },
  {
    title: 'ftp scheme',
    uri: FTP_URI,
    expected: 'SCHEME_NOT_ALLOWED',
    note: 'Only https, plus data: and file: when enabled, is allowed.',
  },
];

type TileProps = {
  item: ErrorCase;
  onError: (title: string, event: OnErrorEvent) => void;
};

function ErrorTile({ item, onError }: TileProps) {
  const [starts, setStarts] = useState(0);
  const source = useMemo<Source>(() => ({ uri: item.uri }), [item.uri]);
  const handleError = useCallback(
    (event: OnErrorEvent) => onError(item.title, event),
    [item.title, onError]
  );

  return (
    <View style={styles.case}>
      <Text style={styles.caseTitle}>{item.title}</Text>
      <Text style={shared.hint}>expect {item.expected}</Text>
      <Text style={shared.body}>{item.note}</Text>
      <DemoTile
        source={source}
        defaultSource={FALLBACK}
        resizeMode="contain"
        retryCount={3}
        retryDelay={500}
        onLoadStart={() => setStarts((count) => count + 1)}
        onError={handleError}
        style={styles.tile}
      />
      <Text style={shared.hint}>onLoadStart calls: {starts}</Text>
    </View>
  );
}

export default function ErrorsScreen() {
  const { lines, log, clear } = useEventLog();
  const [runKey, setRunKey] = useState(0);
  const config = useMemo(() => NextImage.getConfig(), []);

  const onError = useCallback(
    (title: string, event: OnErrorEvent) => {
      const { code, status, retryable, error } = event.nativeEvent;
      log(
        `[${title}] code=${code} status=${status} retryable=${retryable} ${error}`
      );
    },
    [log]
  );

  return (
    <Screen>
      <Section
        title="Failure cases"
        description="Every tile sets defaultSource to the bundled fallback, so a failed load shows the fallback image instead of an empty box."
      >
        <View style={shared.wrapRow}>
          <Button
            title="Retry all"
            variant="primary"
            onPress={() => setRunKey((key) => key + 1)}
          />
          <Button title="Clear log" onPress={clear} />
        </View>
        <Text style={styles.config}>
          allowInsecureHttp: {String(config.allowInsecureHttp)} ·
          blockPrivateNetworks: {String(config.blockPrivateNetworks)} ·
          allowDataUri: {String(config.allowDataUri)}
        </Text>
        <EventLog lines={lines} emptyText="onError events appear here." />
      </Section>

      {CASES.map((item) => (
        <ErrorTile
          key={`${item.title}-${runKey}`}
          item={item}
          onError={onError}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  case: {
    ...shared.card,
    gap: spacing.xs,
  },
  caseTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  tile: {
    width: '100%',
    height: 120,
    backgroundColor: colors.imageBackground,
  },
  config: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
  },
});
