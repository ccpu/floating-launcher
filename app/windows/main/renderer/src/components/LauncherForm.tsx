/* eslint-disable no-void */
/* eslint-disable jsx-a11y/label-has-associated-control */
import type { Launcher, LauncherInput } from '@internal/ipc';
import { appApi } from '@internal/ipc';
import { useState } from 'react';

interface LauncherFormProps {
  initial?: Launcher;
  onSave: (input: LauncherInput) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Add / edit form for a launcher. Grows the window while open (the parent sizes
 * the window to this content).
 */
export function LauncherForm({
  initial,
  onSave,
  onDelete,
  onCancel,
}: LauncherFormProps): React.JSX.Element {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [command, setCommand] = useState(initial?.command ?? '');
  const [icon, setIcon] = useState<string | undefined>(initial?.icon);

  const pickIcon = async (): Promise<void> => {
    const result = await appApi.invoke.pickIcon();
    if (result.success && result.dataUrl != null) {
      setIcon(result.dataUrl);
    }
  };

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (!command.trim()) return;
    // eslint-disable-next-line ts/no-floating-promises
    onSave({ label: label.trim(), command: command.trim(), icon });
  };

  return (
    <form
      onSubmit={submit}
      className="w-72 rounded-2xl border border-white/10 bg-neutral-900/95 p-3 text-neutral-100 shadow-xl backdrop-blur-md"
    >
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void pickIcon()}
          title="Choose an icon image"
          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5 text-xs text-neutral-400 transition-colors hover:bg-white/10"
        >
          {icon != null ? (
            <img src={icon} alt="" className="h-9 w-9 object-contain" draggable={false} />
          ) : (
            'Icon'
          )}
        </button>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            {initial ? 'Edit shortcut' : 'Add shortcut'}
          </span>
          {icon != null ? (
            <button
              type="button"
              onClick={() => setIcon(undefined)}
              className="w-fit text-xs text-neutral-400 hover:text-neutral-200"
            >
              Remove icon
            </button>
          ) : (
            <span className="text-xs text-neutral-500">Optional image</span>
          )}
        </div>
      </div>

      <label className="mb-2 block">
        <span className="mb-1 block text-xs text-neutral-400">Label</span>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="GitHub (secure)"
          className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm outline-none focus:border-white/30"
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 block text-xs text-neutral-400">Command</span>
        <textarea
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          rows={3}
          placeholder={'chrome.exe --profile-directory="Profile 2" https://github.com'}
          className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 font-mono text-xs outline-none focus:border-white/30"
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!command.trim()}
          className="flex-1 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:bg-white/10"
        >
          Cancel
        </button>
        {onDelete ? (
          <button
            type="button"
            onClick={() => void onDelete()}
            className="rounded-lg px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/15 hover:text-red-300"
          >
            Delete
          </button>
        ) : null}
      </div>
    </form>
  );
}
