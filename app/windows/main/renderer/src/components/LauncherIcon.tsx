import type { Launcher, LauncherDisplay, LauncherSize } from '@internal/ipc';

/**
 * Tailwind classes for each icon size preset. Exported so the "add" button in
 * the bar can match the launcher icons' footprint.
 */
export const ICON_SIZE_CLASSES: Record<
  LauncherSize,
  {
    height: string;
    square: string;
    image: string;
    glyph: string;
    label: string;
    round: string;
    /** The circular first-letter badge shown for the 'icon-initial' display. */
    badge: string;
  }
> = {
  xs: {
    round: 'rounded-md',
    height: 'h-6',
    square: 'w-6',
    image: 'h-4 w-4',
    glyph: 'text-xs',
    label: 'text-[0.625rem]',
    badge: 'h-2.5 w-2.5 text-[0.5rem]',
  },
  sm: {
    round: 'rounded-lg',
    height: 'h-8',
    square: 'w-8',
    image: 'h-5 w-5',
    glyph: 'text-sm',
    label: 'text-xs',
    badge: 'h-3.5 w-3.5 text-[0.55rem]',
  },
  md: {
    round: 'rounded-2xl',
    height: 'h-10',
    square: 'w-10',
    image: 'h-7 w-7',
    glyph: 'text-base',
    label: 'text-sm',
    badge: 'h-4 w-4 text-[0.625rem]',
  },
  lg: {
    round: 'rounded-3xl',
    height: 'h-14',
    square: 'w-14',
    image: 'h-10 w-10',
    glyph: 'text-xl',
    label: 'text-base',
    badge: 'h-5 w-5 text-xs',
  },
};

interface LauncherIconProps {
  launcher: Launcher;
  size: LauncherSize;
  display: LauncherDisplay;
  showLabel?: boolean;
}

interface LauncherIconButtonProps {
  launcher: Launcher;
  size: LauncherSize;
  display: LauncherDisplay;
  onClick: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

function LauncherIcon({
  launcher,
  size,
  display,
  showLabel = false,
}: LauncherIconProps): React.JSX.Element | null {
  const classes = ICON_SIZE_CLASSES[size];
  const showIcon =
    display === 'icon' || display === 'icon-label' || display === 'icon-initial';

  if (!showIcon || (launcher.icon == null && showLabel)) {
    return null;
  }

  if (launcher.icon != null) {
    const image = (
      <img
        src={launcher.icon}
        alt={launcher.label}
        draggable={false}
        className={`shrink-0 object-contain ${classes.image}`}
      />
    );

    // For 'icon-initial', overlay the label's first letter as a black circle
    // badge on the bottom-right of the icon.
    if (display === 'icon-initial') {
      return (
        <span className="relative inline-flex shrink-0">
          {image}
          <span
            className={`absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-black font-semibold leading-none text-white ${classes.badge}`}
          >
            {(launcher.label || '?').charAt(0).toUpperCase()}
          </span>
        </span>
      );
    }

    return image;
  }

  return (
    <span className={`shrink-0 font-semibold text-neutral-200 ${classes.glyph}`}>
      {(launcher.label || '?').charAt(0).toUpperCase()}
    </span>
  );
}

LauncherIcon.displayName = 'LauncherIcon';

export { LauncherIcon };

/**
 * A single launcher button. Depending on `display` it shows the icon, the
 * label, or both. When showing the icon with no configured image it falls back
 * to the first letter of the label.
 */
export function LauncherIconButton({
  launcher,
  size,
  display,
  onClick,
  onContextMenu,
}: LauncherIconButtonProps): React.JSX.Element {
  const classes = ICON_SIZE_CLASSES[size];
  const showLabel = display === 'label' || display === 'icon-label';
  const labelText = launcher.label || launcher.command;

  const iconOnly = display === 'icon' || display === 'icon-initial';
  return (
    <button
      type="button"
      title={launcher.label || launcher.command}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`flex items-center justify-center overflow-hidden ${classes.round} transition-colors hover:bg-white/10 ${
        classes.height
      } ${iconOnly ? classes.square : 'gap-2 px-2.5'}`}
    >
      <LauncherIcon
        launcher={launcher}
        size={size}
        display={display}
        showLabel={showLabel}
      />
      {showLabel && (
        <span className={`max-w-[12rem] truncate text-neutral-100 ${classes.label}`}>
          {labelText}
        </span>
      )}
    </button>
  );
}
