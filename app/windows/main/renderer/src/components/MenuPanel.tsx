import { MenuButton } from './ui/MenuButton';

interface MenuPanelProps {
  onAdd: () => void;
  onSettings: () => void;
  onQuit: () => void;
  onClose: () => void;
}

/** App-wide context menu opened by right-clicking an empty part of the bar. */
export function MenuPanel({
  onAdd,
  onSettings,
  onQuit,
  onClose,
}: MenuPanelProps): React.JSX.Element {
  return (
    <div className="w-44 rounded-2xl border border-white/10 bg-neutral-900/95 p-1.5 text-sm text-neutral-100 shadow-xl backdrop-blur-md">
      <MenuButton label="Add shortcut" onClick={onAdd} />
      <MenuButton label="Settings" onClick={onSettings} />
      <MenuButton label="Close menu" onClick={onClose} />
      <div className="my-1 h-px bg-white/10" />
      <MenuButton label="Quit" onClick={onQuit} danger />
    </div>
  );
}
