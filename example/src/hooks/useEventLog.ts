import { useCallback, useState } from 'react';

export const MAX_LOG_LINES = 30;

/** A bounded, newest-first log for the EventLog component. */
export function useEventLog() {
  const [lines, setLines] = useState<string[]>([]);

  const log = useCallback((line: string) => {
    const stamp = new Date().toISOString().slice(11, 23);
    setLines((previous) =>
      [`${stamp}  ${line}`, ...previous].slice(0, MAX_LOG_LINES)
    );
  }, []);

  const clear = useCallback(() => setLines([]), []);

  return { lines, log, clear };
}
