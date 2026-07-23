import { useId } from 'react';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A labeled checkbox row matching the settings panel's card styling. */
export function Toggle({ label, checked, onChange }: ToggleProps): React.JSX.Element {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-neutral-200 hover:bg-white/5"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-white"
      />
      {label}
    </label>
  );
}
