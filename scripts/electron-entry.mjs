import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

function getDevServerEnvVarName(folderName) {
  return `VITE_DEV_SERVER_URL_${folderName.toUpperCase().replace(/-/gu, '_')}`;
}

async function loadBrowserWindowOptions(optionsPath) {
  try {
    if (!fs.existsSync(optionsPath)) {
      return {};
    }

    const optionsModule = await import(pathToFileURL(optionsPath).href);
    return optionsModule.default || optionsModule || {};
  } catch (error) {
    console.warn(`Failed to load browser window options from ${optionsPath}:`, error);
    return {};
  }
}

async function buildWindowsConfig(windowsPath) {
  const windowsFolders = fs
    .readdirSync(windowsPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  const windowConfigs = await Promise.all(
    windowsFolders.map(async (folder) => {
      const isMain = folder === 'main';
      let renderer;

      if (process.env.MODE === 'development') {
        const devServerUrl = isMain
          ? process.env.VITE_DEV_SERVER_URL
          : process.env[getDevServerEnvVarName(folder)];

        renderer = devServerUrl
          ? new URL(devServerUrl)
          : {
              path: fileURLToPath(
                pathToFileURL(
                  path.resolve(windowsPath, `${folder}/renderer/dist/index.html`),
                ),
              ),
            };
      } else {
        renderer = {
          path: fileURLToPath(
            pathToFileURL(
              path.resolve(windowsPath, `${folder}/renderer/dist/index.html`),
            ),
          ),
        };
      }

      const browserWindowOptionsPath = path.resolve(
        windowsPath,
        `${folder}/browser-window-options.mjs`,
      );
      const options = await loadBrowserWindowOptions(browserWindowOptionsPath);

      return {
        folder,
        config: {
          renderer,
          preload: {
            path: fileURLToPath(
              pathToFileURL(
                path.resolve(windowsPath, `${folder}/preload/dist/exposed.mjs`),
              ),
            ),
          },
          options,
        },
      };
    }),
  );

  const windows = {};
  for (const { folder, config } of windowConfigs) {
    windows[folder] = config;
  }

  return {
    windows,
    renderer: windows.main.renderer,
    preload: windows.main.preload,
  };
}

(async () => {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const windowsPath = path.resolve(scriptDir, '../app/windows');
  const config = await buildWindowsConfig(windowsPath);

  const mainDist = await import('../app/main/dist/index.js');
  const { initApp } = mainDist;
  initApp(config);
})();

if (
  process.env.NODE_ENV === 'development' ||
  process.env.PLAYWRIGHT_TEST === 'true' ||
  Boolean(process.env.CI)
) {
  function showAndExit(...args) {
    console.error(...args);
    process.exit(1);
  }

  process.on('uncaughtException', showAndExit);
  process.on('unhandledRejection', showAndExit);
}
