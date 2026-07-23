// Part 5: Your API definition

import type {
  Launcher,
  LauncherInput,
  LauncherMutationResult,
  LauncherSettings,
  PickIconResult,
  RunResult,
} from './launchers';
import { createIpcSchema, defineHandler } from 'electron-ipc-typesafe';

export const appApi = createIpcSchema({
  apiKey: 'appApi',
  handlers: {
    'show-notification': defineHandler<
      [title: string, body: string],
      { success: true; message: string }
    >(),
    'notify-message': defineHandler<
      [message: string],
      { success: true; message: string }
    >(),
    'notify-info': defineHandler<[info: string], { success: true; message: string }>(),
    'open-window': defineHandler<
      [windowName: string, options?: Electron.BrowserWindowConstructorOptions],
      { success: boolean; message: string }
    >(),

    // Floating launcher bar
    'list-launchers': defineHandler<[], Launcher[]>(),
    'add-launcher': defineHandler<[input: LauncherInput], LauncherMutationResult>(),
    'update-launcher': defineHandler<
      [id: string, input: LauncherInput],
      LauncherMutationResult
    >(),
    'remove-launcher': defineHandler<[id: string], LauncherMutationResult>(),
    // Persist a new launcher order. Takes the full list of launcher ids in the
    // desired order; the main process reorders its stored list to match.
    'reorder-launchers': defineHandler<[ids: string[]], LauncherMutationResult>(),
    'run-launcher': defineHandler<[id: string], RunResult>(),
    'pick-icon': defineHandler<[], PickIconResult>(),
    'resize-bar': defineHandler<[width: number, height: number], { success: boolean }>(),
    // Renderer-driven window drag: moves the bar by a screen-pixel delta. Done
    // in JS (rather than a CSS `-webkit-app-region: drag` region) so the bar's
    // buttons and right-click context menu keep receiving mouse events.
    'move-bar': defineHandler<[dx: number, dy: number], { success: boolean }>(),
    // The bar reports whether a panel (menu/settings/form) is open so a docked
    // auto-hiding bar never slides away mid-interaction.
    'set-dock-panel-open': defineHandler<[open: boolean], { success: boolean }>(),
    'get-settings': defineHandler<[], LauncherSettings>(),
    'update-settings': defineHandler<
      [patch: Partial<LauncherSettings>],
      LauncherSettings
    >(),
    'quit-app': defineHandler<[], { success: boolean }>(),
  },
});
