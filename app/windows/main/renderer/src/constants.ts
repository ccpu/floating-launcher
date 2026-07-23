import type { LauncherSettings } from '@internal/ipc';

export const DEFAULT_SETTINGS: LauncherSettings = {
  orientation: 'vertical',
  size: 'md',
  display: 'icon',
  startOnStartup: true,
  dockEdge: 'none',
  dockVisibility: 'auto-hide',
  dockAnimationSpeed: 'normal',
  dockOffset: 0,
  showDragHandle: true,
  alwaysShowAddButton: false,
};
