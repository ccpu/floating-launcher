import type { AppModule, ModuleContext } from '../types';
import { BrowserWindow } from 'electron';

/**
 * How often we re-assert topmost as a fallback, in milliseconds. The Windows
 * taskbar can reclaim the front of the topmost stack (e.g. a plain click on
 * empty taskbar space) without ever generating an event on our window, so
 * event-driven re-assertion alone isn't reliable — this polling is the
 * backstop that guarantees the bar can't get stuck behind it.
 */
const REASSERT_INTERVAL_MS = 1000;

/**
 * Elevates every window to the highest practical always-on-top level so the
 * floating bar stays above other windows, including most fullscreen apps and
 * the taskbar. The `alwaysOnTop: true` constructor option only yields the
 * normal level, so we re-assert it at the `screen-saver` level once each
 * window exists.
 */
class FloatingWindow implements AppModule {
  enable({ app }: ModuleContext): void {
    const elevate = (window: Electron.BrowserWindow): void => {
      // Re-assert topmost. `setAlwaysOnTop` only pins the window's topmost
      // *level*; Windows still lets other topmost windows slide above it
      // within that level (the taskbar re-raises itself on every click), so
      // `moveTop` is what actually forces our window back to the front.
      const assertOnTop = (): void => {
        if (window.isDestroyed()) return;
        window.setAlwaysOnTop(true, 'screen-saver');
        window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        window.moveTop();
      };

      assertOnTop();
      window.on('move', assertOnTop);
      window.on('blur', assertOnTop);
      window.on('show', assertOnTop);
      window.on('focus', assertOnTop);

      const interval = setInterval(assertOnTop, REASSERT_INTERVAL_MS);
      window.on('closed', () => clearInterval(interval));

      // DevTools is opt-in even in dev (set OPEN_DEVTOOLS=1): auto-opening it
      // left inspect-element mode a single hotkey away, whose size badge
      // ("W px × H px") kept flashing over the bar on every auto-hide slide.
      // When requested it opens *detached* so it lives in its own window
      // instead of docking into (and crushing) the tiny bar.
      // eslint-disable-next-line no-restricted-properties, turbo/no-undeclared-env-vars, node/prefer-global/process
      if (import.meta.env.DEV && process.env.OPEN_DEVTOOLS === '1') {
        window.webContents.openDevTools({ mode: 'detach' });
      }
    };

    // Windows created before this module runs, and any created afterwards.
    BrowserWindow.getAllWindows().forEach(elevate);
    app.on('browser-window-created', (_event, window) => elevate(window));
  }
}

export function createFloatingWindowModule(): FloatingWindow {
  return new FloatingWindow();
}
