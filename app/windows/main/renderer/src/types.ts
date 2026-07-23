import type { Launcher } from '@internal/ipc';

/**
 * Which overlay (if any) is currently rendered in place of the bar. `null`
 * means the bar itself is showing.
 */
export type Panel =
  | { mode: 'add' }
  | { mode: 'edit'; launcher: Launcher }
  | { mode: 'launcher-menu'; launcher: Launcher }
  | { mode: 'menu' }
  | { mode: 'settings' }
  | null;
