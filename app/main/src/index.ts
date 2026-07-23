import type { AppInitConfig } from './types';
import { createModuleRunner } from './ModuleRunner';
import { terminateAppOnLastWindowClose } from './modules/ApplicationTerminatorOnLastWindowClose';
import { allowInternalOrigins } from './modules/BlockNotAllowdOrigins';
import { allowExternalUrls } from './modules/ExternalUrls';
import { createFloatingWindowModule } from './modules/FloatingWindow';
import { hardwareAccelerationMode } from './modules/HardwareAccelerationModule';
import { createIpcNotificationModule } from './modules/IpcNotification';
import { createLauncherManagerModule } from './modules/LauncherManager';
import { disallowMultipleAppInstance } from './modules/SingleInstanceApp';
import { createWindowManagerModule } from './modules/WindowManager';

export async function initApp(initConfig: AppInitConfig): Promise<void> {
  // Never auto-open DevTools: docked DevTools fights the tiny frameless bar's
  // resize-to-content. Open it manually (detached) via the FloatingWindow
  // module in dev if you need it.
  const windowManagerModule = createWindowManagerModule({
    initConfig,
    openDevTools: false,
  });

  const moduleRunner = createModuleRunner()
    .init(createIpcNotificationModule())
    .init(windowManagerModule)
    .init(createFloatingWindowModule())
    // The launcher manager drives docking through the window manager module
    // (position-tracking toggles and bar-window lookup).
    .init(createLauncherManagerModule({ windowManager: windowManagerModule }))
    .init(disallowMultipleAppInstance())
    .init(terminateAppOnLastWindowClose())
    .init(hardwareAccelerationMode({ enable: false }))

    // Install DevTools extension if needed
    // .init(chromeDevToolsExtension({extension: 'VUEJS3_DEVTOOLS'}))

    // Security
    .init(
      allowInternalOrigins(
        new Set(initConfig.renderer instanceof URL ? [initConfig.renderer.origin] : []),
      ),
    )
    .init(
      allowExternalUrls(
        new Set(
          initConfig.renderer instanceof URL
            ? ['https://vite.dev', 'https://react.dev']
            : [],
        ),
      ),
    );

  await moduleRunner;
}
