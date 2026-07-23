import type { WindowConfig } from 'electron-window-toolkit';

import type { AppInitConfig, AppModule, ModuleContext } from '../types';

import { appApi } from '@internal/ipc';
import { ipcMain, Menu, MenuItem, shell } from 'electron';
import { WindowManager as WindowManagerHelper } from 'electron-window-toolkit';

/**
 * The expected shape of the initConfig object for the WindowManager.
 */
interface WindowManagerInitConfig extends AppInitConfig {
  windows: Record<string, WindowConfig>;
}

class WindowManager implements AppModule {
  readonly #windowManager: WindowManagerHelper;

  constructor({
    initConfig,
    openDevTools = false,
  }: {
    initConfig: WindowManagerInitConfig;
    openDevTools?: boolean;
  }) {
    this.#windowManager = new WindowManagerHelper({ initConfig, openDevTools });
  }

  async enable({ app }: ModuleContext): Promise<void> {
    const mainWindow = await this.#windowManager.init({ app });
    this.#windowManager.setWindowsPositionTracking('main', false);
    appApi.registerHandler('open-window', async (_event, windowName, options) => {
      try {
        await this.#windowManager.createWindow(windowName, options);
        return { success: true, message: `Window "${windowName}" opened successfully.` };
      } catch (error) {
        console.error(`Failed to open window "${windowName}":`, error);
        return {
          success: false,
          message: `Failed to open window "${windowName}": ${error}`,
        };
      }
    });

    appApi.registerMainHandlers(ipcMain);

    this.createMenus(mainWindow);
  }

  /** Looks up an already-created window by its config name (e.g. 'main'). */
  async getWindow(windowName: string): Promise<Electron.BrowserWindow | undefined> {
    return this.#windowManager.getWindow(windowName);
  }

  /**
   * Enables or disables x/y persistence for one window. The docking system
   * turns this off while the bar is docked (the dock computes the position
   * itself) and back on in free mode.
   */
  setWindowsPositionTracking(windowName: string, enabled: boolean): void {
    this.#windowManager.setWindowsPositionTracking(windowName, enabled);
  }

  private async createWindow(
    windowName: string,
    options?: Electron.BrowserWindowConstructorOptions,
  ): Promise<void> {
    const browserWindow = await this.#windowManager.createWindow(windowName, options);
    this.createMenus(browserWindow);
  }

  private createMenus(window: Electron.BrowserWindow): void {
    // Create and set the application menu
    const menu = Menu.buildFromTemplate(this.createMenuTemplate());
    Menu.setApplicationMenu(menu);

    window.webContents.on('context-menu', (_event, params) => {
      const contextMenu = new Menu();
      const { editFlags, isEditable, selectionText } = params;
      const hasSelection = selectionText.trim().length > 0;

      // Standard editing actions. Roles let Electron handle enablement and
      // platform accelerators, but we also honour the params' edit flags so
      // items are greyed out when the action isn't available.
      if (isEditable || hasSelection) {
        contextMenu.append(new MenuItem({ role: 'cut', enabled: editFlags.canCut }));
        contextMenu.append(new MenuItem({ role: 'copy', enabled: editFlags.canCopy }));
        if (isEditable) {
          contextMenu.append(
            new MenuItem({ role: 'paste', enabled: editFlags.canPaste }),
          );
          contextMenu.append(
            new MenuItem({ role: 'selectAll', enabled: editFlags.canSelectAll }),
          );
        }
      }

      // Only expose the developer-facing "Inspect Element" action in dev builds.
      if (import.meta.env.DEV) {
        if (contextMenu.items.length > 0) {
          contextMenu.append(new MenuItem({ type: 'separator' }));
        }
        contextMenu.append(
          new MenuItem({
            label: 'Inspect Element',
            click: () => {
              window.webContents.inspectElement(params.x, params.y);
            },
          }),
        );
      }

      // Nothing worth showing (e.g. right-click on empty area in production).
      if (contextMenu.items.length === 0) {
        return;
      }

      contextMenu.popup({ window });
    });
  }

  /**
   * Creates the menu template for the application.
   */
  private createMenuTemplate(): Electron.MenuItemConstructorOptions[] {
    return [
      {
        label: 'File',
        submenu: [
          {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              this.createWindow('settings');
            },
          },
          { type: 'separator' },
          {
            label: 'Quit',
            role: 'quit',
          },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          ...this.#windowManager.getZoomMenuItems(),
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Window',
        submenu: [{ role: 'minimize' }, { role: 'close' }],
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Learn More',
            click: () => {
              shell.openExternal('https://example.com');
            },
          },
        ],
      },
    ];
  }
}

export type WindowManagerModule = WindowManager;

export function createWindowManagerModule(
  ...args: ConstructorParameters<typeof WindowManager>
): WindowManager {
  return new WindowManager(...args);
}
