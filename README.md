# Floating Launcher for Windows

Floating Launcher is a small Electron app that keeps a compact, always-on-top
shortcut bar on screen. It lets you run saved launchers, add new ones, edit or
remove existing ones, reorder them by dragging, dock the bar to a screen edge,
and adjust how it looks — all from a frameless window that resizes itself to fit
its contents.

## Features

### Launchers

- **Run a shortcut** — click a launcher icon to execute its command. Commands
  run through Windows' `start` so app names like `chrome.exe` resolve even when
  they aren't on `PATH`, and quoted arguments (e.g.
  `--profile-directory="Profile 2"`) are passed through as-is.
- **Add / edit / delete** — manage launchers from the add/edit form or a
  launcher's right-click menu. Each launcher has a label (shown as a tooltip), a
  command, and an optional icon.
- **Custom icons** — pick an image file (PNG, JPG, GIF, WebP, BMP, SVG, ICO) to
  use as a launcher's icon. It's stored inline as a `data:` URL so the config
  stays self-contained. With no icon, the launcher falls back to the first
  letter of its label.
- **Drag to reorder** — when there is more than one launcher, **press and hold**
  an icon (~0.5s) to pick it up, then drag to reposition it. The drag is
  constrained to the bar's axis — vertical when the bar is vertical, horizontal
  when it's horizontal — and the new order is saved. A quick click still just
  runs the launcher, so ordinary clicks are never mistaken for a drag.

### The bar

- **Move the bar** — drag the bar by any empty area, or by the optional grip
  handle, to reposition the window. When docked, dragging is constrained to the
  docked edge.
- **Orientation** — lay the bar out vertically or horizontally.
- **Size** — four icon-size presets: Extra Small, Small, Medium, Large.
- **Display mode** — show each launcher as an icon, a label, or both.
- **Auto-resize** — the frameless window automatically resizes to fit the bar or
  whichever panel (form / menu / settings) is open.
- **Optional affordances** — toggle the dedicated drag grip and choose whether
  the "add shortcut" button stays visible once launchers exist (it always shows
  while the bar is empty).

### Docking

- **Dock to an edge** — pin the bar to the left, right, top, or bottom of a
  screen (or keep it free-floating). A vertical edge forces vertical layout and a
  horizontal edge forces horizontal layout.
- **Visibility** — a docked bar can stay always visible or auto-hide, sliding
  off-screen when idle and back in on hover. It stays put while a panel is open.
- **Animation speed** — off, fast, normal, or slow slide animation for
  auto-hide.
- **Multi-monitor aware** — the bar remembers which display it was docked to and
  its offset along that edge, so it returns to the same spot after a restart.

### System

- **Start on startup** — optionally register the app to launch automatically at
  Windows login (packaged builds only).
- **Context menu** — right-click the bar for quick actions: Add shortcut,
  Settings, and Quit.
- **Persistent config** — launchers and settings are saved to a single
  `launchers.json` file in the app's user-data directory. A legacy bare-array
  format is still read for backward compatibility.

## How it works

The main UI lives in
[app/windows/main/renderer/src/App.tsx](app/windows/main/renderer/src/App.tsx).
That component loads launcher data and settings over IPC, renders the bar, and
switches between the launcher list, the add/edit form, the launcher menu, the
global menu, and the settings panel.

- The bar and drag-to-reorder behavior live in
  [Bar.tsx](app/windows/main/renderer/src/components/Bar.tsx), which uses
  [dnd-kit](https://dndkit.com) with a press-and-hold pointer sensor and an
  orientation-aware sorting strategy.
- The main process owns the config and command execution in
  [LauncherManager.ts](app/main/src/modules/LauncherManager.ts), and the typed
  IPC contract is defined in
  [packages/ipc/src/app-api.ts](packages/ipc/src/app-api.ts).

## Scripts

- `pnpm start` to run the app in development.
- `pnpm test` to run the workspace tests.
- `pnpm build` to build all packages.

## Requirements

- Node.js 22+
- pnpm 9.6+
