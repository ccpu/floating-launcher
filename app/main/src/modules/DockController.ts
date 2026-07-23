import type { DockAnimationSpeed, DockEdge, LauncherSettings } from '@internal/ipc';
import type { BrowserWindow } from 'electron';
import { screen } from 'electron';

/** How much of the bar stays on-screen while auto-hidden, in pixels. */
const PEEK_PX = 6;
/** Grace period after the cursor leaves before the bar slides away. */
const HIDE_DELAY_MS = 400;
/** Cursor-position polling cadence while docked with auto-hide enabled. */
const POLL_INTERVAL_MS = 150;
/** Slide animation duration per user-selected speed; 0 slides instantly. */
const ANIMATION_DURATIONS_MS: Record<DockAnimationSpeed, number> = {
  off: 0,
  fast: 80,
  normal: 160,
  slow: 320,
};
const ANIMATION_STEP_MS = 12;
/** Cubic ease-out exponent for the slide animation. */
const EASE_OUT_POWER = 3;
/**
 * A user drag is considered finished this long after its last `will-move`
 * event; Windows gives us no reliable single "drag ended" signal once every
 * OS move has been prevented and re-applied by us.
 */
const DRAG_SETTLE_MS = 250;
/** Extra pixels around the window that still count as "cursor over the bar". */
const HOVER_MARGIN_PX = 2;

interface DockControllerDeps {
  /** Live view of the persisted settings (dock edge, visibility, offset…). */
  getSettings: () => LauncherSettings;
  /** Persist a new movable-axis offset and dock display without echoing back. */
  saveDockState: (patch: { dockOffset: number; dockDisplayId: number }) => void;
  /** Toggle the WindowManager's x/y persistence for the bar window. */
  setPositionTracking: (enabled: boolean) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

/**
 * Keeps the floating bar attached to a screen edge when `dockEdge` is not
 * 'none': computes the docked position (edge-flush on the fixed axis, stored
 * offset on the movable axis), constrains drags to the movable axis, slides
 * the window mostly off-screen when idle (auto-hide) and back in when the
 * cursor touches the visible strip.
 *
 * While docked, WindowManager position tracking is disabled and this class is
 * the sole authority over the window's position; in free mode it stands down
 * entirely and re-enables tracking.
 */
export class DockController {
  #deps: DockControllerDeps;
  #window: BrowserWindow | undefined;

  /** Target state: fully visible (true) or slid out to the peek strip (false). */
  #revealed = true;
  /** Whether the renderer currently has a menu/settings/form panel open. */
  #panelOpen = false;
  /** True while the user is dragging the bar along the docked edge. */
  #dragging = false;
  /** Set around our own setPosition calls so `will-move` ignores them. */
  #programmatic = false;

  #pollTimer: NodeJS.Timeout | undefined;
  #hideTimer: NodeJS.Timeout | undefined;
  #animTimer: NodeJS.Timeout | undefined;
  #dragEndTimer: NodeJS.Timeout | undefined;
  #screenListenersInstalled = false;

  /**
   * The size the renderer last asked us to be (its ceiled content size, which
   * equals the outer size for this frameless window). Used instead of the live
   * `window.getSize()` when pinning: on fractional-DPI displays the live size
   * drifts a sub-pixel per move, and re-reading it as the "correct" size every
   * slide ratchets the window a few pixels larger each cycle. Anchoring to this
   * fixed value keeps every re-pin targeting the same size, so it can't grow.
   */
  #contentSize: { width: number; height: number } | undefined;

  constructor(deps: DockControllerDeps) {
    this.#deps = deps;
  }

  /**
   * Binds the controller to the bar window (idempotent, survives window
   * recreation) and, when docked, immediately takes over its position.
   */
  attach(window: BrowserWindow): void {
    if (this.#window === window) return;
    this.#window = window;
    window.on('will-move', this.#onWillMove);
    window.once('closed', () => {
      if (this.#window === window) this.#window = undefined;
    });
    this.applyMode();
  }

  /** Installs display-change listeners; call once the app is ready. */
  start(): void {
    if (this.#screenListenersInstalled) return;
    this.#screenListenersInstalled = true;
    screen.on('display-added', this.#onDisplaysChanged);
    screen.on('display-removed', this.#onDisplaysChanged);
    screen.on('display-metrics-changed', this.#onDisplaysChanged);
  }

  dispose(): void {
    if (this.#screenListenersInstalled) {
      screen.removeListener('display-added', this.#onDisplaysChanged);
      screen.removeListener('display-removed', this.#onDisplaysChanged);
      screen.removeListener('display-metrics-changed', this.#onDisplaysChanged);
      this.#screenListenersInstalled = false;
    }
    this.#stopPolling();
    this.#cancelHide();
    this.#cancelAnimation();
    if (this.#dragEndTimer) clearTimeout(this.#dragEndTimer);
    if (this.#window) {
      this.#window.removeListener('will-move', this.#onWillMove);
      this.#window = undefined;
    }
  }

  isDocked(): boolean {
    return this.#edge() !== 'none';
  }

  /**
   * Re-evaluates the current settings: docked mode claims the window (tracking
   * off, snap to edge, start auto-hide), free mode releases it (tracking on).
   * `previous` lets an edge *change* re-derive the offset and display from
   * wherever the bar currently sits, so docking keeps the bar near where the
   * user left it instead of jumping to the work-area origin.
   */
  onSettingsChanged(previous?: LauncherSettings): void {
    const settings = this.#deps.getSettings();

    if (settings.dockEdge === 'none') {
      this.#stopPolling();
      this.#cancelHide();
      this.#cancelAnimation();
      this.#revealed = true;
      this.#deps.setPositionTracking(true);
      return;
    }

    this.#deps.setPositionTracking(false);

    const window = this.#usableWindow();
    if (window && previous && previous.dockEdge !== settings.dockEdge) {
      // Docking (or re-docking to another edge): dock to the display the bar
      // is on right now, keeping its position along the new movable axis.
      const bounds = window.getBounds();
      const display = screen.getDisplayMatching(bounds);
      const { workArea } = display;
      const horizontal = settings.dockEdge === 'top' || settings.dockEdge === 'bottom';
      const offset = horizontal ? bounds.x - workArea.x : bounds.y - workArea.y;
      this.#deps.saveDockState({
        dockOffset: Math.max(0, offset),
        dockDisplayId: display.id,
      });
    }

    this.applyMode();
  }

  /** Applies the docked position for the current settings, if docked. */
  applyMode(): void {
    if (!this.isDocked()) {
      this.onSettingsChanged();
      return;
    }
    this.#deps.setPositionTracking(false);
    this.#revealed = true;
    this.#applyPosition({ animate: true });
    this.#startPolling();
  }

  /**
   * Re-pins the window after a content resize. Instant (no animation) so it
   * tracks the resize without lagging behind it, and state-preserving: a
   * hidden bar stays hidden at its new size. Skipped mid-drag: the stored
   * offset is only updated when the drag settles, so re-pinning here would
   * yank the window out from under the cursor back to its pre-drag spot.
   */
  onWindowResized(size?: { width: number; height: number }): void {
    if (size) this.#contentSize = size;
    if (!this.isDocked() || this.#dragging) return;
    this.#applyPosition({ animate: false });
  }

  setPanelOpen(open: boolean): void {
    this.#panelOpen = open;
    if (open && this.isDocked()) {
      this.#cancelHide();
      if (!this.#revealed) this.#reveal();
    }
  }

  #edge(): DockEdge {
    return this.#deps.getSettings().dockEdge;
  }

  #usableWindow(): BrowserWindow | undefined {
    const window = this.#window;
    return window && !window.isDestroyed() ? window : undefined;
  }

  /**
   * The size to pin at: the renderer's authoritative content size when known,
   * else the live window size. Never derived from a value we've already pinned,
   * so it can't accumulate DPI rounding drift across slides.
   */
  #size(window: BrowserWindow): { width: number; height: number } {
    if (this.#contentSize) return this.#contentSize;
    const [width = 0, height = 0] = window.getSize();
    return { width, height };
  }

  /**
   * The display the bar is docked to: the persisted one when it is still
   * connected, otherwise whichever display currently contains the bar (which
   * then becomes the persisted one).
   */
  #dockDisplay(window: BrowserWindow): Electron.Display {
    const savedId = this.#deps.getSettings().dockDisplayId;
    const saved = screen.getAllDisplays().find((display) => display.id === savedId);
    if (saved) return saved;
    const fallback = screen.getDisplayMatching(window.getBounds());
    this.#deps.saveDockState({
      dockOffset: this.#deps.getSettings().dockOffset,
      dockDisplayId: fallback.id,
    });
    return fallback;
  }

  /**
   * Where the window should sit right now, given edge, stored offset, current
   * size, and the revealed/hidden state. The movable axis is clamped so the
   * bar stays fully inside the work area.
   */
  #targetPosition(window: BrowserWindow): { x: number; y: number } | undefined {
    const edge = this.#edge();
    if (edge === 'none') return undefined;

    const { workArea } = this.#dockDisplay(window);
    const size = this.#size(window);
    const offset = this.#deps.getSettings().dockOffset;
    if (edge === 'left' || edge === 'right') {
      return {
        x: this.#fixedCoordinate(edge, workArea, size),
        y: clamp(
          workArea.y + offset,
          workArea.y,
          workArea.y + workArea.height - size.height,
        ),
      };
    }
    return {
      x: clamp(workArea.x + offset, workArea.x, workArea.x + workArea.width - size.width),
      y: this.#fixedCoordinate(edge, workArea, size),
    };
  }

  /**
   * The edge-flush coordinate on the fixed axis: exactly on the work-area edge
   * when revealed, or shifted off-screen down to the peek strip when hidden.
   */
  #fixedCoordinate(
    edge: Exclude<DockEdge, 'none'>,
    workArea: Electron.Rectangle,
    size: { width: number; height: number },
  ): number {
    if (edge === 'left') {
      return this.#revealed ? workArea.x : workArea.x - size.width + PEEK_PX;
    }
    if (edge === 'right') {
      return this.#revealed
        ? workArea.x + workArea.width - size.width
        : workArea.x + workArea.width - PEEK_PX;
    }
    if (edge === 'top') {
      return this.#revealed ? workArea.y : workArea.y - size.height + PEEK_PX;
    }
    return this.#revealed
      ? workArea.y + workArea.height - size.height
      : workArea.y + workArea.height - PEEK_PX;
  }

  #applyPosition({ animate }: { animate: boolean }): void {
    const window = this.#usableWindow();
    if (!window) return;
    const target = this.#targetPosition(window);
    if (!target) return;
    this.#moveTo(window, target.x, target.y, animate);
  }

  #moveTo(window: BrowserWindow, x: number, y: number, animate: boolean): void {
    this.#cancelAnimation();
    const [fromX = 0, fromY = 0] = window.getPosition();
    if (fromX === x && fromY === y) return;

    const speed = this.#deps.getSettings().dockAnimationSpeed;
    const duration = ANIMATION_DURATIONS_MS[speed] ?? ANIMATION_DURATIONS_MS.normal;
    if (!animate || duration === 0) {
      this.#setPosition(window, x, y);
      return;
    }

    const startedAt = Date.now();
    this.#animTimer = setInterval(() => {
      const alive = this.#usableWindow();
      if (!alive) {
        this.#cancelAnimation();
        return;
      }
      const t = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - (1 - t) ** EASE_OUT_POWER;
      this.#setPosition(
        alive,
        Math.round(fromX + (x - fromX) * eased),
        Math.round(fromY + (y - fromY) * eased),
      );
      if (t >= 1) this.#cancelAnimation();
    }, ANIMATION_STEP_MS);
  }

  /**
   * Moves the window without letting Windows corrupt its size: on displays
   * with fractional DPI scaling, `setPosition` on a non-resizable window can
   * silently grow/shrink it a pixel or two per call (the DIP↔physical
   * round-trip). Left unchecked, the drift accumulates with every auto-hide
   * slide — the window gains transparent slack and the bar appears to float
   * away from its edge. If position *or* size land off-target, re-apply once
   * via `setBounds` with resizing temporarily enabled. Crucially the target
   * size comes from `#size` (the renderer's authoritative content size), not
   * from the live window, so each slide re-pins to the same fixed dimensions
   * and the drift can't ratchet across cycles.
   */
  #setPosition(window: BrowserWindow, x: number, y: number): void {
    this.#programmatic = true;
    try {
      const { width, height } = this.#size(window);
      window.setPosition(x, y);
      const applied = window.getBounds();
      if (
        applied.x !== x ||
        applied.y !== y ||
        applied.width !== width ||
        applied.height !== height
      ) {
        const wasResizable = window.isResizable();
        window.setResizable(true);
        window.setBounds({ x, y, width, height });
        window.setResizable(wasResizable);
      }
    } finally {
      this.#programmatic = false;
    }
  }

  #cancelAnimation(): void {
    if (this.#animTimer) {
      clearInterval(this.#animTimer);
      this.#animTimer = undefined;
    }
  }

  /**
   * Axis-constrained dragging. For each OS-driven move we compute the
   * constrained position (fixed axis pinned to the edge, movable axis
   * following the cursor within the work area). When the OS's proposed bounds
   * already satisfy the constraint, the native move is allowed through — that
   * keeps the drag perfectly smooth and the cursor anchored to its grab
   * point. Only violating moves are prevented and replaced.
   */
  #onWillMove = (event: Electron.Event, newBounds: Electron.Rectangle): void => {
    if (this.#programmatic || !this.isDocked()) return;
    const window = this.#usableWindow();
    if (!window) return;

    this.#cancelAnimation();
    this.#cancelHide();
    this.#dragging = true;

    const { workArea } = this.#dockDisplay(window);
    const size = this.#size(window);
    const edge = this.#edge() as Exclude<DockEdge, 'none'>;
    const fixed = this.#fixedCoordinate(edge, workArea, size);

    let x: number;
    let y: number;
    if (edge === 'left' || edge === 'right') {
      x = fixed;
      y = clamp(newBounds.y, workArea.y, workArea.y + workArea.height - size.height);
    } else {
      x = clamp(newBounds.x, workArea.x, workArea.x + workArea.width - size.width);
      y = fixed;
    }

    if (x !== newBounds.x || y !== newBounds.y) {
      event.preventDefault();
      this.#setPosition(window, x, y);
    }

    if (this.#dragEndTimer) clearTimeout(this.#dragEndTimer);
    this.#dragEndTimer = setTimeout(() => {
      this.#dragEndTimer = undefined;
      this.#dragging = false;
      this.#saveOffsetFromPosition();
    }, DRAG_SETTLE_MS);
  };

  /**
   * Applies a renderer-driven drag delta while docked. The bar no longer uses a
   * CSS `-webkit-app-region: drag` region (that swallowed clicks and right
   * clicks), so dragging arrives here as screen-pixel deltas instead of OS
   * `will-move` events. Same constraint as `#onWillMove`: the fixed axis stays
   * pinned to the edge, the movable axis follows the cursor within the work
   * area, and the offset is persisted once the drag settles.
   */
  dragBy(dx: number, dy: number): void {
    const window = this.#usableWindow();
    if (!window || !this.isDocked()) return;

    this.#cancelAnimation();
    this.#cancelHide();
    this.#dragging = true;
    this.#revealed = true;

    const { workArea } = this.#dockDisplay(window);
    const size = this.#size(window);
    const edge = this.#edge() as Exclude<DockEdge, 'none'>;
    const fixed = this.#fixedCoordinate(edge, workArea, size);
    const [curX = 0, curY = 0] = window.getPosition();

    let x: number;
    let y: number;
    if (edge === 'left' || edge === 'right') {
      x = fixed;
      y = clamp(curY + dy, workArea.y, workArea.y + workArea.height - size.height);
    } else {
      x = clamp(curX + dx, workArea.x, workArea.x + workArea.width - size.width);
      y = fixed;
    }
    this.#setPosition(window, x, y);

    if (this.#dragEndTimer) clearTimeout(this.#dragEndTimer);
    this.#dragEndTimer = setTimeout(() => {
      this.#dragEndTimer = undefined;
      this.#dragging = false;
      this.#saveOffsetFromPosition();
    }, DRAG_SETTLE_MS);
  }

  /** Persists the movable-axis offset after a drag settles. */
  #saveOffsetFromPosition(): void {
    const window = this.#usableWindow();
    if (!window || !this.isDocked()) return;
    const display = this.#dockDisplay(window);
    const { workArea } = display;
    const bounds = window.getBounds();
    const edge = this.#edge();
    const horizontal = edge === 'top' || edge === 'bottom';
    const offset = horizontal ? bounds.x - workArea.x : bounds.y - workArea.y;
    this.#deps.saveDockState({
      dockOffset: Math.max(0, offset),
      dockDisplayId: display.id,
    });
  }

  #onDisplaysChanged = (): void => {
    if (!this.isDocked()) return;
    // Work-area or monitor layout changed under us: re-pin immediately.
    this.#applyPosition({ animate: false });
  };

  // --- Auto-hide ---------------------------------------------------------

  #startPolling(): void {
    if (this.#pollTimer) return;
    this.#pollTimer = setInterval(() => this.#tick(), POLL_INTERVAL_MS);
  }

  #stopPolling(): void {
    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = undefined;
    }
  }

  #tick(): void {
    const window = this.#usableWindow();
    if (!window || !this.isDocked()) return;

    const settings = this.#deps.getSettings();
    const busy = this.#dragging || this.#panelOpen;
    if (settings.dockVisibility !== 'auto-hide' || busy) {
      this.#cancelHide();
      if (!this.#revealed) this.#reveal();
      return;
    }

    const cursor = screen.getCursorScreenPoint();
    const bounds = window.getBounds();
    const over =
      cursor.x >= bounds.x - HOVER_MARGIN_PX &&
      cursor.x <= bounds.x + bounds.width + HOVER_MARGIN_PX &&
      cursor.y >= bounds.y - HOVER_MARGIN_PX &&
      cursor.y <= bounds.y + bounds.height + HOVER_MARGIN_PX;

    if (this.#revealed) {
      if (over) this.#cancelHide();
      else this.#scheduleHide();
    } else if (over) {
      // The visible strip is part of the (mostly off-screen) window bounds,
      // so "cursor over the bounds" is exactly "cursor on the strip".
      this.#reveal();
    }
  }

  #reveal(): void {
    this.#cancelHide();
    this.#revealed = true;
    this.#applyPosition({ animate: true });
  }

  #scheduleHide(): void {
    if (this.#hideTimer) return;
    this.#hideTimer = setTimeout(() => {
      this.#hideTimer = undefined;
      if (!this.isDocked() || this.#dragging || this.#panelOpen) return;
      if (this.#deps.getSettings().dockVisibility !== 'auto-hide') return;
      this.#revealed = false;
      this.#applyPosition({ animate: true });
    }, HIDE_DELAY_MS);
  }

  #cancelHide(): void {
    if (this.#hideTimer) {
      clearTimeout(this.#hideTimer);
      this.#hideTimer = undefined;
    }
  }
}
