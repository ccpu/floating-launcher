import type { Launcher, LauncherInput, LauncherSettings } from '@internal/ipc';
import type { Panel } from './types';
import { appApi } from '@internal/ipc';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bar } from './components/Bar';
import { LauncherForm } from './components/LauncherForm';
import { LauncherMenuPanel } from './components/LauncherMenuPanel';
import { MenuPanel } from './components/MenuPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { DEFAULT_SETTINGS } from './constants';
import { useResizeToContent } from './hooks/useResizeToContent';

function App(): React.JSX.Element {
  const [launchers, setLaunchers] = useState<Launcher[]>([]);
  const [settings, setSettings] = useState<LauncherSettings>(DEFAULT_SETTINGS);
  const [panel, setPanel] = useState<Panel>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useResizeToContent(contentRef, [launchers, settings, panel]);

  // Tell the main process when a panel is open so a docked auto-hiding bar
  // stays fully visible for the whole interaction.
  useEffect(() => {
    appApi.invoke.setDockPanelOpen(panel !== null).catch(() => undefined);
  }, [panel]);

  useEffect(() => {
    appApi.invoke
      .listLaunchers()
      .then(setLaunchers)
      .catch((error: unknown) => console.error('Failed to load launchers:', error));
    appApi.invoke
      .getSettings()
      .then(setSettings)
      .catch((error: unknown) => console.error('Failed to load settings:', error));
  }, []);

  const updateSettings = useCallback((patch: Partial<LauncherSettings>) => {
    // Optimistically apply, then persist; the handler returns the merged result.
    setSettings((current) => ({ ...current, ...patch }));
    appApi.invoke
      .updateSettings(patch)
      .then(setSettings)
      .catch((error: unknown) => {
        console.error('Failed to save settings:', error);
      });
  }, []);

  const run = useCallback((id: string) => {
    appApi.invoke.runLauncher(id).catch((error: unknown) => {
      console.error('Failed to run launcher:', error);
    });
  }, []);

  const save = useCallback(
    async (input: LauncherInput) => {
      const result =
        panel?.mode === 'edit'
          ? await appApi.invoke.updateLauncher(panel.launcher.id, input)
          : await appApi.invoke.addLauncher(input);
      if (result.success) {
        setLaunchers(result.launchers);
        setPanel(null);
      }
    },
    [panel],
  );

  const reorder = useCallback((ids: string[]) => {
    // Optimistically apply the new order so the drag feels instant, then
    // persist it. The handler returns the canonical list; if it rejects the
    // order (e.g. a stale id set) it echoes back the unchanged list.
    setLaunchers((current) => {
      const byId = new Map(current.map((launcher) => [launcher.id, launcher]));
      return ids
        .map((id) => byId.get(id))
        .filter((launcher): launcher is Launcher => launcher != null);
    });
    appApi.invoke
      .reorderLaunchers(ids)
      .then((result) => {
        if (result.success) setLaunchers(result.launchers);
      })
      .catch((error: unknown) => {
        console.error('Failed to reorder launchers:', error);
      });
  }, []);

  const remove = useCallback(async (id: string) => {
    const result = await appApi.invoke.removeLauncher(id);
    if (result.success) {
      setLaunchers(result.launchers);
      setPanel(null);
    }
  }, []);

  const openMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setPanel({ mode: 'menu' });
  }, []);

  const renderContent = (): React.JSX.Element => {
    if (panel?.mode === 'menu') {
      return (
        <MenuPanel
          onAdd={() => setPanel({ mode: 'add' })}
          onSettings={() => setPanel({ mode: 'settings' })}
          // eslint-disable-next-line ts/no-misused-promises
          onQuit={async () => appApi.invoke.quitApp().catch(() => undefined)}
          onClose={() => setPanel(null)}
        />
      );
    }
    if (panel?.mode === 'settings') {
      return (
        <SettingsPanel
          settings={settings}
          onChange={updateSettings}
          onClose={() => setPanel(null)}
        />
      );
    }
    if (panel?.mode === 'launcher-menu') {
      const { launcher } = panel;
      return (
        <LauncherMenuPanel
          launcher={launcher}
          onRun={() => {
            run(launcher.id);
            setPanel(null);
          }}
          onEdit={() => setPanel({ mode: 'edit', launcher })}
          // eslint-disable-next-line ts/no-misused-promises
          onDelete={async () => remove(launcher.id)}
          onAdd={() => setPanel({ mode: 'add' })}
          onSettings={() => setPanel({ mode: 'settings' })}
          // eslint-disable-next-line ts/no-misused-promises
          onQuit={async () => appApi.invoke.quitApp().catch(() => undefined)}
          onClose={() => setPanel(null)}
        />
      );
    }
    if (panel?.mode === 'add' || panel?.mode === 'edit') {
      return (
        <LauncherForm
          key={panel.mode === 'edit' ? panel.launcher.id : 'add'}
          initial={panel.mode === 'edit' ? panel.launcher : undefined}
          onSave={save}
          onDelete={
            panel.mode === 'edit' ? async () => remove(panel.launcher.id) : undefined
          }
          onCancel={() => setPanel(null)}
        />
      );
    }
    return (
      <Bar
        launchers={launchers}
        settings={settings}
        onRun={run}
        onLauncherMenu={(launcher) => setPanel({ mode: 'launcher-menu', launcher })}
        onAdd={() => setPanel({ mode: 'add' })}
        onContextMenu={openMenu}
        onReorder={reorder}
      />
    );
  };

  return (
    <div className="flex min-h-screen items-start justify-start">
      <div ref={contentRef} className="inline-flex w-fit">
        {renderContent()}
      </div>
    </div>
  );
}

export default App;
