// Launcher domain types shared between the main process and the renderer.

/**
 * A single configured shortcut shown as an icon in the floating bar.
 */
export interface Launcher {
  /** Stable unique id, generated when the launcher is created. */
  id: string;
  /** Human-readable label, shown as a tooltip. */
  label: string;
  /**
   * The command to execute when the icon is clicked, e.g.
   * `chrome.exe --profile-directory="Profile 2" https://github.com`.
   */
  command: string;
  /** Optional icon, stored as a `data:` URL so the config stays self-contained. */
  icon?: string;
}

/** The editable fields of a launcher (everything except the generated id). */
export type LauncherInput = Omit<Launcher, 'id'>;

/** Which way the floating bar lays out its icons. */
export type Orientation = 'vertical' | 'horizontal';

/** Icon size preset for the floating bar. */
export type LauncherSize = 'xs' | 'sm' | 'md' | 'lg';

/**
 * What each launcher button shows: its icon, its label, both, or the icon with
 * the label's first letter as a badge ('icon-initial').
 */
export type LauncherDisplay = 'icon' | 'icon-label' | 'icon-initial' | 'label';

/** Which screen edge the bar is docked to; 'none' means free-floating. */
export type DockEdge = 'none' | 'left' | 'right' | 'top' | 'bottom';

/** Whether a docked bar slides off-screen when idle or stays fully visible. */
export type DockVisibility = 'auto-hide' | 'always-visible';

/** How fast a docked bar slides in and out ('off' disables the animation). */
export type DockAnimationSpeed = 'off' | 'fast' | 'normal' | 'slow';

/** Persisted, launcher-independent preferences for the floating bar. */
export interface LauncherSettings {
  orientation: Orientation;
  size: LauncherSize;
  display: LauncherDisplay;
  /** Whether the app registers itself to launch automatically at Windows login. */
  startOnStartup: boolean;
  /** Screen edge the bar docks to; 'none' keeps the free-floating behavior. */
  dockEdge: DockEdge;
  /** Only meaningful while docked; ignored when `dockEdge` is 'none'. */
  dockVisibility: DockVisibility;
  /** Slide in/out animation speed while docked with auto-hide. */
  dockAnimationSpeed: DockAnimationSpeed;
  /**
   * Whether the dedicated drag grip is rendered. The whole bar is draggable by
   * its empty areas regardless; this only toggles the explicit grip affordance.
   */
  showDragHandle: boolean;
  /**
   * Whether the "add shortcut" button stays visible once launchers exist. When
   * there are no launchers the button always shows (so the bar is never empty
   * with no way to add one), independent of this preference.
   */
  alwaysShowAddButton: boolean;
  /**
   * Position along the docked edge's movable axis (y for left/right, x for
   * top/bottom), relative to the dock display's work-area origin. While docked
   * this replaces absolute x/y persistence.
   */
  dockOffset: number;
  /** The display the bar was last docked to, so restarts land on the same monitor. */
  dockDisplayId?: number;
}

/** Result returned by mutating launcher handlers, carrying the updated list. */
export interface LauncherMutationResult {
  success: boolean;
  launchers: Launcher[];
  message?: string;
}

/** Result of attempting to run a launcher command. */
export interface RunResult {
  success: boolean;
  message: string;
}

/** Result of the "pick an icon file" flow. */
export interface PickIconResult {
  success: boolean;
  canceled?: boolean;
  /** The chosen image encoded as a `data:` URL. */
  dataUrl?: string;
  message?: string;
}
