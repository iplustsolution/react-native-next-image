import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { OnLoadEvent, Source } from 'react-native-next-image';
import Button from '../components/Button';
import DemoTile from '../components/DemoTile';
import ModeTile from '../components/ModeTile';
import Screen from '../components/Screen';
import Section from '../components/Section';
import { colors, shared } from '../theme';
import { SIGNED_CACHE_KEY, seedUri, signedUri } from '../urls';
import CacheApiSection from './CacheApiSection';

const TTL_MINUTES = 0.25;
const TTL_SECONDS = TTL_MINUTES * 60;
const TTL_SOURCE: Source = {
  uri: seedUri('ttl-demo'),
  cacheDuration: TTL_MINUTES,
};

function makeSignedSource(): Source {
  return { uri: signedUri(), cacheKey: SIGNED_CACHE_KEY };
}

function SignedUrlDemo() {
  const [source, setSource] = useState<Source>(makeSignedSource);
  return (
    <Section
      title="Signed URL with a stable cacheKey"
      description="The token in the query string changes on every re-render, but cacheKey keeps one cache entry. After the first load the badge must read memory or disk, never network."
    >
      <Text style={styles.uri} numberOfLines={1}>
        {source.uri}
      </Text>
      <Button
        title="Re-render with a new token"
        variant="primary"
        onPress={() => setSource(makeSignedSource())}
      />
      <DemoTile source={source} />
    </Section>
  );
}

function TtlDemo() {
  const [runKey, setRunKey] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The countdown starts from the network fetch, not from a cache hit.
  const onLoad = useCallback((event: OnLoadEvent) => {
    if (event.nativeEvent.cacheType === 'network') {
      const time = Date.now();
      setFetchedAt(time);
      setNow(time);
    }
  }, []);

  useEffect(() => {
    if (fetchedAt == null) {
      return undefined;
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fetchedAt]);

  const remaining =
    fetchedAt == null
      ? null
      : Math.max(0, TTL_SECONDS - Math.floor((now - fetchedAt) / 1000));

  return (
    <Section
      title="cacheDuration: 0.25 (15 seconds)"
      description="Load again inside the window and the badge reads memory or disk. Wait for the countdown to hit zero, load again, and it must read network."
    >
      <View style={shared.row}>
        <Button
          title="Load again"
          variant="primary"
          onPress={() => setRunKey((key) => key + 1)}
        />
        <Text style={styles.countdown}>
          {remaining == null
            ? 'not fetched yet'
            : remaining > 0
              ? `expires in ${remaining} s`
              : 'expired: next load should be network'}
        </Text>
      </View>
      <DemoTile key={runKey} source={TTL_SOURCE} onLoad={onLoad} />
    </Section>
  );
}

export default function CacheScreen() {
  return (
    <Screen>
      <SignedUrlDemo />
      <TtlDemo />

      <Section
        title="cache: 'cacheOnly' on a never-loaded uri"
        description="This seed is used nowhere else, so the load must fail with CACHE_MISS and no request is made."
      >
        <ModeTile uri={seedUri('cache-only-miss')} modes={['cacheOnly']} />
      </Section>

      <Section
        title="cache: 'cacheOnly' after a normal load"
        description="Load normally first, then switch to cacheOnly: it must succeed from memory or disk."
      >
        <ModeTile
          uri={seedUri('cache-only-hit')}
          modes={['immutable', 'cacheOnly']}
        />
      </Section>

      <Section
        title="cache: 'reload'"
        description="reload bypasses the cache for that request and refreshes the entry, so its badge must read network every time; immutable afterwards reads from cache again."
      >
        <ModeTile
          uri={seedUri('reload-demo')}
          modes={['immutable', 'reload']}
        />
      </Section>

      <Section
        title="cache: 'web'"
        description="Honours the server's Cache-Control and ETag instead of cacheDuration. picsum sends long max-age headers, so repeat loads should still come from cache."
      >
        <ModeTile uri={seedUri('web-demo')} modes={['web']} />
      </Section>

      <CacheApiSection />
    </Screen>
  );
}

const styles = StyleSheet.create({
  uri: {
    color: colors.textFaint,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  countdown: {
    color: colors.warning,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});
