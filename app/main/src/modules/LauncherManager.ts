import type { Launcher, LauncherInput, LauncherSettings } from '@internal/ipc';
import type { IpcMainInvokeEvent } from 'electron';
import type { AppModule, ModuleContext } from '../types';
import type { WindowManagerModule } from './WindowManager';

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appApi } from '@internal/ipc';
import { app, BrowserWindow, dialog, screen } from 'electron';
import { DockController } from './DockController';

const CONFIG_FILE = 'launchers.json';
/** The window-config name of the floating bar window. */
const BAR_WINDOW_NAME = 'main';

const DEFAULT_SETTINGS: LauncherSettings = {
  orientation: 'vertical',
  size: 'md',
  display: 'icon',
  startOnStartup: true,
  // Existing users keep the free-floating behavior until they opt into docking.
  dockEdge: 'none',
  dockVisibility: 'auto-hide',
  dockAnimationSpeed: 'normal',
  dockOffset: 0,
  showDragHandle: true,
  // Empty bars always show it; once populated it hides until the user opts in.
  alwaysShowAddButton: false,
};

/**
 * A docked edge dictates the bar's layout: a bar on a vertical edge
 * (left/right) must stack vertically, on a horizontal edge (top/bottom)
 * horizontally. Applied on every load and settings update so the pair can
 * never drift apart, whichever of the two fields a patch changes.
 */
function enforceDockOrientation(settings: LauncherSettings): LauncherSettings {
  if (settings.dockEdge === 'left' || settings.dockEdge === 'right') {
    return { ...settings, orientation: 'vertical' };
  }
  if (settings.dockEdge === 'top' || settings.dockEdge === 'bottom') {
    return { ...settings, orientation: 'horizontal' };
  }
  return settings;
}

/** On-disk shape. Older builds stored a bare `Launcher[]`; we still read that. */
interface PersistedConfig {
  launchers: Launcher[];
  settings: LauncherSettings;
}

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * Owns the launcher configuration (persisted as a single JSON file in the app's
 * userData directory) and the IPC handlers the floating bar uses to read it,
 * mutate it, and run the configured commands.
 */
class LauncherManager implements AppModule {
  #launchers: Launcher[] = [];
  #settings: LauncherSettings = { ...DEFAULT_SETTINGS };
  #cleanups: (() => void)[] = [];
  readonly #windowManager: WindowManagerModule;
  readonly #dock: DockController;
  /** Last content size we applied per window, to ignore no-op resize requests. */
  #lastBarSize = new WeakMap<BrowserWindow, { width: number; height: number }>();
  /**
   * The bar's "home" top-left corner — wherever the user last dropped it. When
   * a panel opens and would overflow the screen, we shift the window just enough
   * to keep it visible, and this anchor is what we return to when it shrinks
   * back. Updated on user drags, never by our own programmatic moves.
   */
  #barAnchor = new WeakMap<BrowserWindow, { x: number; y: number }>();
  /** Windows whose next `moved` event is ours (setPosition), not a user drag. */
  #programmaticMove = new WeakSet<BrowserWindow>();
  /** Windows that already have the anchor-tracking `moved` listener attached. */
  #anchorTracked = new WeakSet<BrowserWindow>();

  constructor({ windowManager }: { windowManager: WindowManagerModule }) {
    this.#windowManager = windowManager;
    this.#dock = new DockController({
      getSettings: () => this.#settings,
      saveDockState: (patch) => {
        this.#settings = { ...this.#settings, ...patch };
        this.#save().catch(() => undefined);
      },
      setPositionTracking: (enabled) => {
        this.#windowManager.setWindowsPositionTracking(BAR_WINDOW_NAME, enabled);
      },
    });
  }

  get #configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  async enable(_context: ModuleContext): Promise<void> {
    await this.#load();
    this.#syncLoginItem();

    // The bar window is created asynchronously by the WindowManager module;
    // bind the dock controller as soon as it exists. `attach` is idempotent
    // and re-runs from the resize-bar handler if the window is recreated.
    app
      .whenReady()
      .then(async () => {
        this.#dock.start();
        const barWindow = await this.#windowManager.getWindow(BAR_WINDOW_NAME);
        if (barWindow) this.#dock.attach(barWindow);
      })
      .catch(() => undefined);

    this.#cleanups.push(
      appApi.registerHandler('list-launchers', async () => this.#launchers),

      appApi.registerHandler('add-launcher', async (_event, input) => {
        const launcher: Launcher = { id: randomUUID(), ...this.#sanitize(input) };
        this.#launchers.push(launcher);
        await this.#save();
        return { success: true, launchers: this.#launchers };
      }),

      appApi.registerHandler('update-launcher', async (_event, id, input) => {
        const index = this.#launchers.findIndex((launcher) => launcher.id === id);
        if (index === -1) {
          return { success: false, launchers: this.#launchers, message: 'Not found' };
        }
        this.#launchers[index] = { id, ...this.#sanitize(input) };
        await this.#save();
        return { success: true, launchers: this.#launchers };
      }),

      appApi.registerHandler('remove-launcher', async (_event, id) => {
        this.#launchers = this.#launchers.filter((launcher) => launcher.id !== id);
        await this.#save();
        return { success: true, launchers: this.#launchers };
      }),

      appApi.registerHandler('reorder-launchers', async (_event, ids) => {
        // Rebuild the list in the requested order. Guard against a stale or
        // malformed id list: only commit when the ids are a permutation of the
        // current launchers (same set, same count), otherwise leave the order
        // untouched so we can never drop or duplicate a launcher.
        const byId = new Map(this.#launchers.map((launcher) => [launcher.id, launcher]));
        const reordered = ids
          .map((id) => byId.get(id))
          .filter((launcher): launcher is Launcher => launcher != null);
        if (
          reordered.length === this.#launchers.length &&
          new Set(ids).size === this.#launchers.length
        ) {
          this.#launchers = reordered;
          await this.#save();
        }
        return { success: true, launchers: this.#launchers };
      }),

      appApi.registerHandler('run-launcher', async (_event, id) => {
        const launcher = this.#launchers.find((entry) => entry.id === id);
        if (!launcher) {
          return { success: false, message: `Launcher "${id}" not found.` };
        }
        return this.#run(launcher.command);
      }),

      appApi.registerHandler('get-settings', async () => this.#settings),

      appApi.registerHandler('update-settings', async (_event, patch) => {
        const previous = this.#settings;
        this.#settings = enforceDockOrientation({ ...this.#settings, ...patch });
        this.#syncLoginItem();
        this.#dock.onSettingsChanged(previous);
        await this.#save();
        return this.#settings;
      }),

      appApi.registerHandler('set-dock-panel-open', async (_event, open) => {
        this.#dock.setPanelOpen(Boolean(open));
        return { success: true };
      }),

      appApi.registerHandler('pick-icon', async (event) => this.#pickIcon(event)),

      appApi.registerHandler('resize-bar', async (event, width, height) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (
          window &&
          Number.isFinite(width) &&
          Number.isFinite(height) &&
          width > 0 &&
          height > 0
        ) {
          const nextWidth = Math.max(1, Math.round(width));
          const nextHeight = Math.max(1, Math.round(height));
          // The renderer's ResizeObserver re-fires constantly while the bar is
          // dragged (sub-pixel/DPI wobble), each time requesting the *same*
          // content size. Acting on those is what broke cross-screen dragging:
          // `#keepOnScreen` would clamp the bar to whichever single display it
          // currently overlapped, snapping it back from the edge and preventing
          // it from crossing onto the next monitor. Only do real work when the
          // size actually changed — i.e. a form/menu opened or closed — so the
          // clamp runs then (its real purpose) and never during a plain drag.
          const last = this.#lastBarSize.get(window);
          if (last?.width === nextWidth && last.height === nextHeight) {
            return { success: true };
          }
          this.#lastBarSize.set(window, { width: nextWidth, height: nextHeight });
          // The bar renderer calls resize-bar on every mount, so this also
          // (re)binds the dock controller after a window recreation.
          this.#dock.attach(window);
          this.#trackAnchor(window);
          // `resizable: false` blocks user resizing but we still need to size the
          // window to its content, so briefly re-enable it around the call.
          // `setContentSize` keeps the window's top-left corner fixed, so a panel
          // normally grows down-and-right from where the bar sits without moving.
          const wasResizable = window.isResizable();
          window.setResizable(true);
          window.setContentSize(nextWidth, nextHeight);
          window.setResizable(wasResizable);
          if (this.#dock.isDocked()) {
            // Docked: the dock controller owns the position — keep the bar
            // pinned to its edge at the new size instead of anchor-fitting.
            this.#dock.onWindowResized({ width: nextWidth, height: nextHeight });
          } else {
            // Position the window at its anchor, shifted only as much as the new
            // size requires to stay inside the work area. A panel opening near the
            // bottom/right edge nudges the window up/left so it stays visible; when
            // it closes the same math lands exactly back on the anchor. The anchor
            // itself only changes on user drags, so panels never permanently move
            // the bar.
            this.#fitToAnchor(window);
          }
          return { success: true };
        }
        return { success: false };
      }),

      appApi.registerHandler('move-bar', async (event, dx, dy) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window || !Number.isFinite(dx) || !Number.isFinite(dy)) {
          return { success: false };
        }
        if (this.#dock.isDocked()) {
          // Docked: constrain the drag to the edge's movable axis.
          this.#dock.dragBy(Math.round(dx), Math.round(dy));
        } else {
          // Free-floating: move freely; the `moved` listener updates the anchor.
          const [x = 0, y = 0] = window.getPosition();
          window.setPosition(Math.round(x + dx), Math.round(y + dy));
        }
        return { success: true };
      }),

      appApi.registerHandler('quit-app', async () => {
        app.quit();
        return { success: true };
      }),
    );
  }

  async disable(): Promise<void> {
    this.#dock.dispose();
    this.#cleanups.forEach((cleanup) => cleanup());
    this.#cleanups = [];
  }

  #sanitize(input: LauncherInput): LauncherInput {
    return {
      label: (input.label ?? '').trim(),
      command: (input.command ?? '').trim(),
      icon: input.icon,
    };
  }

  async #load(): Promise<void> {
    try {
      const raw = await readFile(this.#configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        // Legacy format: a bare array of launchers, no settings.
        this.#launchers = parsed as Launcher[];
        this.#settings = { ...DEFAULT_SETTINGS };
      } else {
        const config = (parsed ?? {}) as Partial<PersistedConfig>;
        this.#launchers = Array.isArray(config.launchers) ? config.launchers : [];
        this.#settings = enforceDockOrientation({
          ...DEFAULT_SETTINGS,
          ...config.settings,
        });
      }
    } catch {
      // First run (file missing) or unreadable config — start empty.
      this.#launchers = [];
      this.#settings = { ...DEFAULT_SETTINGS };
    }
  }

  async #save(): Promise<void> {
    const config: PersistedConfig = {
      launchers: this.#launchers,
      settings: this.#settings,
    };
    try {
      await writeFile(this.#configPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (error) {
      console.error('[LauncherManager] Failed to save launchers:', error);
    }
  }

  /**
   * Registers (or unregisters) the app as a Windows login item to match
   * `#settings.startOnStartup`. Skipped outside packaged builds, since
   * `setLoginItemSettings` would otherwise point Windows at the `electron.exe`
   * dev binary rather than the built app.
   */
  #syncLoginItem(): void {
    if (!app.isPackaged) return;
    app.setLoginItemSettings({ openAtLogin: this.#settings.startOnStartup });
  }

  #run(command: string): { success: boolean; message: string } {
    const trimmed = command.trim();
    if (!trimmed) {
      return { success: false, message: 'Empty command.' };
    }
    try {
      // The command is the user's own local configuration; `shell: true` lets a
      // single string with quoted arguments (e.g. --profile-directory="Profile 2")
      // be launched as-is. Detached + unref so the launcher can outlive this app.
      //
      // We wrap it in cmd's `start` so an executable name like `chrome.exe`
      // resolves even when it is not on PATH: `start` uses ShellExecute, which
      // also consults the registry's "App Paths" (where browsers register
      // themselves) — plain `cmd /c chrome.exe` only searches PATH and fails
      // silently. The empty `""` is the window-title argument `start` requires
      // so a quoted token later in the command isn't mistaken for the title.
      const child = spawn(`start "" ${trimmed}`, {
        shell: true,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.on('error', (error) => {
        console.error('[LauncherManager] Failed to run command:', error);
      });
      child.unref();
      return { success: true, message: 'Launched.' };
    } catch (error) {
      return { success: false, message: `Failed to launch: ${error}` };
    }
  }

  /**
   * Starts tracking the bar's home position for `window` (idempotent). The
   * anchor seeds from the current position and then follows user drags via the
   * `moved` event; moves we make ourselves (`#fitToAnchor`) are flagged in
   * `#programmaticMove` so they don't overwrite it.
   */
  #trackAnchor(window: BrowserWindow): void {
    if (this.#anchorTracked.has(window)) return;
    this.#anchorTracked.add(window);

    const [x = 0, y = 0] = window.getPosition();
    this.#barAnchor.set(window, { x, y });

    window.on('moved', () => {
      if (this.#programmaticMove.delete(window)) return;
      const [nx = 0, ny = 0] = window.getPosition();
      this.#barAnchor.set(window, { x: nx, y: ny });
    });
  }

  /**
   * Places the window at its anchor, shifted up/left only as far as the current
   * size needs to fit the anchor display. With the bar's own size this is a
   * no-op at the anchor; with a panel open near the bottom/right edge it keeps
   * the panel visible, and shrinking back returns to the anchor.
   *
   * Clamps to the display's full `bounds`, not `workArea`: the bar floats at
   * the `screen-saver` always-on-top level, so it renders above the taskbar and
   * users park it there. A workArea clamp would eject a taskbar-parked bar on
   * the first resize after startup.
   */
  #fitToAnchor(window: BrowserWindow): void {
    const anchor = this.#barAnchor.get(window);
    if (!anchor) return;

    const bounds = window.getBounds();
    const { bounds: display } = screen.getDisplayMatching({ ...bounds, ...anchor });

    const maxX = display.x + display.width - bounds.width;
    const maxY = display.y + display.height - bounds.height;
    // `max(display…)` keeps the top-left visible even if the window is larger
    // than the display (clamp wins over the overflow correction).
    const x = Math.round(Math.max(display.x, Math.min(anchor.x, maxX)));
    const y = Math.round(Math.max(display.y, Math.min(anchor.y, maxY)));

    if (x !== bounds.x || y !== bounds.y) {
      this.#programmaticMove.add(window);
      window.setPosition(x, y);
    }
  }

  async #pickIcon(event: IpcMainInvokeEvent): Promise<{
    success: boolean;
    canceled?: boolean;
    dataUrl?: string;
    message?: string;
  }> {
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await (window
      ? dialog.showOpenDialog(window, this.#iconDialogOptions())
      : dialog.showOpenDialog(this.#iconDialogOptions()));

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const filePath = result.filePaths[0]!;
    try {
      const buffer = await readFile(filePath);
      const mime =
        IMAGE_MIME_TYPES[path.extname(filePath).toLowerCase()] ??
        'application/octet-stream';
      const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
      return { success: true, dataUrl };
    } catch (error) {
      return { success: false, message: `Failed to read icon: ${error}` };
    }
  }

  #iconDialogOptions(): Electron.OpenDialogOptions {
    return {
      title: 'Choose an icon',
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'],
        },
      ],
    };
  }
}

export function createLauncherManagerModule(
  ...args: ConstructorParameters<typeof LauncherManager>
): LauncherManager {
  return new LauncherManager(...args);
}
