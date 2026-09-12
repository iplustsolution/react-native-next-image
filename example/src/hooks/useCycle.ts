import { useCallback, useState } from 'react';

/** Steps through a fixed list of options, wrapping at the end. */
export function useCycle<T>(options: readonly [T, ...T[]]): [T, () => void] {
  const [index, setIndex] = useState(0);
  const next = useCallback(() => {
    setIndex((previous) => (previous + 1) % options.length);
  }, [options.length]);
  return [options[index] ?? options[0], next];
}
