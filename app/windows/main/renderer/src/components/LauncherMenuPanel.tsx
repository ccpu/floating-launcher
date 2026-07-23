import type { Launcher } from '@internal/ipc';
import { LauncherIcon } from './LauncherIcon';
import { MenuButton } from './ui/MenuButton';

interface LauncherMenuPanelProps {
  launcher: Launcher;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAdd: () => void;
  onSettings: () => void;
  onQuit: () => void;
  onClose: () => void;
}

/**
 * Context menu opened by right-clicking a launcher icon. It shows actions for
 * the clicked launcher (run / edit / delete) followed by the app-wide menu
 * (add shortcut, settings, quit).
 */
export function LauncherMenuPanel({
  launcher,
  onRun,
  onEdit,
  onDelete,
  onAdd,
  onSettings,
  onQuit,
  onClose,
}: LauncherMenuPanelProps): React.JSX.Element {
  return (
    <div className="w-44 rounded-2xl border border-white/10 bg-neutral-900/95 p-1.5 text-sm text-neutral-100 shadow-xl backdrop-blur-md">
      <div className="flex items-center gap-2 px-3 pb-2 pt-1.5">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-[10px] font-semibold text-neutral-300">
          <LauncherIcon launcher={launcher} size="sm" display="icon" />
        </div>
        <span className="truncate text-xs font-medium text-neutral-400">
          {launcher.label || launcher.command}
        </span>
      </div>

      {/* Subtle line separating header from actions */}
      <MenuButton label="Run" onClick={onRun} />
      <MenuButton label="Edit" onClick={onEdit} />
      <MenuButton label="Delete" onClick={onDelete} danger />
      <div className="my-1 h-px bg-white/10" />
      <MenuButton label="Add shortcut" onClick={onAdd} />
      <MenuButton label="Settings" onClick={onSettings} />
      <MenuButton label="Close menu" onClick={onClose} />
      <div className="my-1 h-px bg-white/10" />
      <MenuButton label="Quit" onClick={onQuit} danger />
    </div>
  );
}
