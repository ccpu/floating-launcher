interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onSelect: (value: T) => void;
  disabled?: boolean;
}

/** A small pill-style single-choice control used inside the settings panel. */
export function Segmented<T extends string>({
  options,
  value,
  onSelect,
  disabled = false,
}: SegmentedProps<T>): React.JSX.Element {
  return (
    <div
      className={`flex gap-1 rounded-lg border border-white/10 bg-black/30 p-1 ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(option.value)}
          className={`flex-1 rounded-md px-2 py-1 text-xs transition-colors ${
            option.value === value
              ? 'bg-white/90 font-medium text-neutral-900'
              : `text-neutral-300 ${disabled ? '' : 'hover:bg-white/10'}` //
          } ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
