import type {
  DockAnimationSpeed,
  DockEdge,
  DockVisibility,
  LauncherDisplay,
  LauncherSettings,
  LauncherSize,
  Orientation,
} from '@internal/ipc';
import { Segmented } from './ui/Segmented';
import { Toggle } from './ui/Toggle';

interface SettingsPanelProps {
  settings: LauncherSettings;
  onChange: (patch: Partial<LauncherSettings>) => void;
  onClose: () => void;
}

const ORIENTATION_OPTIONS: { value: Orientation; label: string }[] = [
  { value: 'vertical', label: 'Vertical' },
  { value: 'horizontal', label: 'Horizontal' },
];

const SIZE_OPTIONS: { value: LauncherSize; label: string }[] = [
  { value: 'xs', label: 'Extra Small' },
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
];

const DISPLAY_OPTIONS: { value: LauncherDisplay; label: string }[] = [
  { value: 'icon', label: 'Icon' },
  { value: 'icon-label', label: 'Icon + label' },
  { value: 'icon-initial', label: 'Icon + Initial' },
  { value: 'label', label: 'Label' },
];

const DOCK_EDGE_OPTIONS: { value: DockEdge; label: string }[] = [
  { value: 'none', label: 'Free' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
];

const DOCK_VISIBILITY_OPTIONS: { value: DockVisibility; label: string }[] = [
  { value: 'auto-hide', label: 'Auto-hide' },
  { value: 'always-visible', label: 'Always visible' },
];

const DOCK_ANIMATION_OPTIONS: { value: DockAnimationSpeed; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'fast', label: 'Fast' },
  { value: 'normal', label: 'Normal' },
  { value: 'slow', label: 'Slow' },
];

export function SettingsPanel({
  settings,
  onChange,
  onClose,
}: SettingsPanelProps): React.JSX.Element {
  const isDocked = settings.dockEdge !== 'none';
  return (
    <div className="w-89 rounded-2xl border border-white/10 bg-neutral-900/95 p-3 text-neutral-100 shadow-xl backdrop-blur-md">
      <div className="mb-3 text-sm font-medium">Settings</div>

      <div className="mb-1 text-xs text-neutral-400">
        Layout
        {isDocked && <span className="text-neutral-500"> (set by docking)</span>}
      </div>
      <Segmented
        options={ORIENTATION_OPTIONS}
        value={settings.orientation}
        onSelect={(orientation) => onChange({ orientation })}
        // A vertical edge forces vertical layout, a horizontal edge forces
        // horizontal; the choice only belongs to the user while free-floating.
        disabled={isDocked}
      />

      <div className="mb-1 mt-3 text-xs text-neutral-400">Size</div>
      <Segmented
        options={SIZE_OPTIONS}
        value={settings.size}
        onSelect={(size) => onChange({ size })}
      />

      <div className="mb-1 mt-3 text-xs text-neutral-400">Show</div>
      <Segmented
        options={DISPLAY_OPTIONS}
        value={settings.display}
        onSelect={(display) => onChange({ display })}
      />

      <div className="mb-1 mt-3 text-xs text-neutral-400">Bar</div>
      <div className="flex flex-col gap-1.5">
        <Toggle
          label="Show drag handle"
          checked={settings.showDragHandle}
          onChange={(showDragHandle) => onChange({ showDragHandle })}
        />
        <Toggle
          label="Always show add button"
          checked={settings.alwaysShowAddButton}
          onChange={(alwaysShowAddButton) => onChange({ alwaysShowAddButton })}
        />
      </div>

      <div className="mb-1 mt-3 text-xs text-neutral-400">Docking</div>
      <Segmented
        options={DOCK_EDGE_OPTIONS}
        value={settings.dockEdge}
        onSelect={(dockEdge) => onChange({ dockEdge })}
      />

      {isDocked && (
        <>
          <div className="mb-1 mt-3 text-xs text-neutral-400">Visibility</div>
          <Segmented
            options={DOCK_VISIBILITY_OPTIONS}
            value={settings.dockVisibility}
            onSelect={(dockVisibility) => onChange({ dockVisibility })}
          />

          <div className="mb-1 mt-3 text-xs text-neutral-400">Animation</div>
          <Segmented
            options={DOCK_ANIMATION_OPTIONS}
            value={settings.dockAnimationSpeed}
            onSelect={(dockAnimationSpeed) => onChange({ dockAnimationSpeed })}
          />
        </>
      )}

      <div className="mb-1 mt-3 text-xs text-neutral-400">Startup</div>
      <Toggle
        label="Start automatically when Windows starts"
        checked={settings.startOnStartup}
        onChange={(startOnStartup) => onChange({ startOnStartup })}
      />

      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
      >
        Done
      </button>
    </div>
  );
}
