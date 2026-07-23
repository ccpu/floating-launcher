import { appApi } from '@internal/ipc';
import { useLayoutEffect } from 'react';

/**
 * Keeps the frameless window sized to whatever is currently rendered inside
 * `ref`, so the transparent area around the bar never swallows clicks.
 */
export function useResizeToContent(
  ref: React.RefObject<HTMLElement | null>,
  deps: readonly unknown[],
): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const apply = (): void => {
      const rect = element.getBoundingClientRect();
      appApi.invoke
        .resizeBar(Math.ceil(rect.width), Math.ceil(rect.height))
        .catch(() => undefined);
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
