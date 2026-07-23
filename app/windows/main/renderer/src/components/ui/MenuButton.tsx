interface MenuButtonProps {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/** A single full-width row inside a menu/context-menu panel. */
export function MenuButton({
  label,
  onClick,
  danger,
}: MenuButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/10 ${
        danger ? 'text-red-400 hover:text-red-300' : ''
      }`}
    >
      {label}
    </button>
  );
}
