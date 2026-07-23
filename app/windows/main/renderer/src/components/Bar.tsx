import type { DragEndEvent } from '@dnd-kit/core';
import type { Launcher, LauncherSettings, LauncherSize } from '@internal/ipc';
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { appApi } from '@internal/ipc';
import { MdAdd } from 'react-icons/md';
import { ICON_SIZE_CLASSES, LauncherIconButton } from './LauncherIcon';

interface BarProps {
  launchers: Launcher[];
  settings: LauncherSettings;
  onRun: (id: string) => void;
  onLauncherMenu: (launcher: Launcher) => void;
  onAdd: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onReorder: (ids: string[]) => void;
}

const PADDING_BY_SIZE: Record<LauncherSize, string> = {
  xs: 'p-0.5',
  sm: 'p-1',
  md: 'p-1.5',
  lg: 'p-2',
};

const ROUND_BY_SIZE: Record<LauncherSize, string> = {
  xs: 'rounded-lg',
  sm: 'rounded-xl',
  md: 'rounded-2xl',
  lg: 'rounded-3xl',
};

/**
 * How long the pointer must stay pressed on a launcher before a drag begins.
 * A deliberate hold (rather than an instant grab) keeps ordinary clicks — which
 * run the launcher — from ever being mistaken for the start of a reorder.
 *
 * Note: 500ms is a purposeful "press and hold" while still feeling responsive.
 * Bump this toward a few seconds if you want an even more deliberate gesture.
 */
const DRAG_ACTIVATION_DELAY_MS = 500;

/**
 * How far the pointer may drift during the hold before the press is treated as
 * a click instead of a drag. Small so a steady hold reliably arms the drag.
 */
const DRAG_ACTIVATION_TOLERANCE_PX = 6;

/** Opacity of the launcher being dragged, so the drop target reads clearly. */
const DRAGGING_OPACITY = 0.6;

/** Stacking order of the dragged launcher, to lift it above its neighbors. */
const DRAGGING_Z_INDEX = 20;

interface SortableLauncherProps {
  launcher: Launcher;
  settings: LauncherSettings;
  onRun: (id: string) => void;
  onLauncherMenu: (launcher: Launcher) => void;
}

/**
 * A launcher button wrapped so it can be dragged to reorder. The dnd-kit
 * listeners live on the wrapper; because a plain click never crosses the hold
 * threshold, `onClick`/`onContextMenu` on the inner button keep working.
 */
function SortableLauncher({
  launcher,
  settings,
  onRun,
  onLauncherMenu,
}: SortableLauncherProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: launcher.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Lift the dragged item above its neighbors and fade it slightly so the
    // drop target reads clearly.
    opacity: isDragging ? DRAGGING_OPACITY : 1,
    zIndex: isDragging ? DRAGGING_Z_INDEX : undefined,
    // While armed for dragging, hint the grab affordance.
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex touch-none"
      {...attributes}
      {...listeners}
    >
      <LauncherIconButton
        launcher={launcher}
        size={settings.size}
        display={settings.display}
        onClick={() => onRun(launcher.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          // Stop the event bubbling to the bar's context-menu handler, which
          // would otherwise open the global menu instead of this launcher's
          // own context menu.
          event.stopPropagation();
          onLauncherMenu(launcher);
        }}
      />
    </div>
  );
}

export function Bar({
  launchers,
  settings,
  onRun,
  onLauncherMenu,
  onAdd,
  onContextMenu,
  onReorder,
}: BarProps): React.JSX.Element {
  const isVertical = settings.orientation === 'vertical';
  const sizeClasses = ICON_SIZE_CLASSES[settings.size];
  // The add button stays a fixed square regardless of the display mode.
  const addButtonSize = `${sizeClasses.height} ${sizeClasses.square}`;
  const paddingClass = PADDING_BY_SIZE[settings.size];
  // Show the add button whenever the bar is empty (so there's always a way to
  // add the first launcher), otherwise honor the user's preference.
  // eslint-disable-next-line ts/no-unsafe-assignment
  const showAddButton = launchers.length === 0 || settings.alwaysShowAddButton;

  // Drag-to-reorder is only meaningful with more than one launcher. With a
  // single (or no) launcher we render plain buttons and skip dnd-kit entirely.
  const canReorder = launchers.length > 1;

  // A press-and-hold pointer sensor: a quick click runs the launcher, only a
  // deliberate hold starts a drag. dnd-kit cancels the pending drag if the
  // pointer drifts past the tolerance during the hold, so it reads as a click.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: DRAG_ACTIVATION_DELAY_MS,
        tolerance: DRAG_ACTIVATION_TOLERANCE_PX,
      },
    }),
  );

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (over == null || active.id === over.id) return;
    const oldIndex = launchers.findIndex((launcher) => launcher.id === active.id);
    const newIndex = launchers.findIndex((launcher) => launcher.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    // arrayMove without importing the helper: splice the id out and back in.
    const ids = launchers.map((launcher) => launcher.id);
    const [moved] = ids.splice(oldIndex, 1);
    if (moved == null) return;
    ids.splice(newIndex, 0, moved);
    onReorder(ids);
  };

  // Drag the window from any empty part of the bar. Done in JS (not a CSS
  // `-webkit-app-region: drag` region) because a drag region swallows the
  // clicks and right-clicks the launcher buttons and context menu need. We
  // ignore presses that land on a button and forward screen-pixel deltas to the
  // main process, which moves the window (constraining to the edge if docked).
  const onDragStart = (event: React.MouseEvent): void => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();

    let last = { x: event.screenX, y: event.screenY };
    const onMove = (moveEvent: MouseEvent): void => {
      const dx = moveEvent.screenX - last.x;
      const dy = moveEvent.screenY - last.y;
      if (dx === 0 && dy === 0) return;
      last = { x: moveEvent.screenX, y: moveEvent.screenY };
      // eslint-disable-next-line ts/no-unsafe-call, ts/no-unsafe-member-access
      appApi.invoke.moveBar(dx, dy).catch(() => undefined);
    };
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const launcherButtons = launchers.map((launcher) =>
    canReorder ? (
      <SortableLauncher
        key={launcher.id}
        launcher={launcher}
        settings={settings}
        onRun={onRun}
        onLauncherMenu={onLauncherMenu}
      />
    ) : (
      <LauncherIconButton
        key={launcher.id}
        launcher={launcher}
        size={settings.size}
        display={settings.display}
        onClick={() => onRun(launcher.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          // Stop the event bubbling to the bar's context-menu handler, which
          // would otherwise open the global menu instead of this launcher's
          // own context menu.
          event.stopPropagation();
          onLauncherMenu(launcher);
        }}
      />
    ),
  );

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- drag surface for moving the OS window; no keyboard equivalent applies
    <div
      onContextMenu={onContextMenu}
      onMouseDown={onDragStart}
      // The whole bar drags from its empty areas; the buttons below stay
      // clickable because `onDragStart` ignores presses that land on a button.
      // The bar stacks the drag grip and the icons: in vertical mode the grip
      // sits along the top edge, in horizontal mode down the right edge.
      className={`flex overflow-hidden ${isVertical ? 'flex-col' : 'flex-row'} ${ROUND_BY_SIZE[settings.size]} border border-white/10 bg-neutral-900/85 shadow-lg backdrop-blur-md`}
    >
      {/* An explicit grip affordance on the top (vertical) or right (horizontal)
          edge, rendered first so it lands on the leading edge. Optional — the
          whole bar drags regardless — so it can be hidden from settings. */}
      {Boolean(settings.showDragHandle) && (
        <div
          title="Drag to move"
          className={`z-10 flex items-center justify-center bg-white/5 hover:bg-white/10 ${
            isVertical ? 'order-first h-2.5 w-full' : 'order-last w-2.5'
          }`}
        >
          <div
            className={`rounded-full bg-white/25 ${
              isVertical ? 'h-0.5 w-8' : 'h-8 w-0.5'
            }`}
          />
        </div>
      )}

      <div
        className={`flex items-center gap-1.5 ${paddingClass} ${isVertical ? 'flex-col' : 'flex-row'}`}
      >
        {canReorder ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            // Keep the drag on the bar's axis (vertical layout → vertical drag,
            // horizontal layout → horizontal drag) and clamp it to the bar.
            modifiers={[
              isVertical ? restrictToVerticalAxis : restrictToHorizontalAxis,
              restrictToParentElement,
            ]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={launchers.map((launcher) => launcher.id)}
              strategy={
                isVertical ? verticalListSortingStrategy : horizontalListSortingStrategy
              }
            >
              {launcherButtons}
            </SortableContext>
          </DndContext>
        ) : (
          launcherButtons
        )}

        {Boolean(showAddButton) && (
          <button
            type="button"
            title="Add shortcut"
            onClick={onAdd}
            className={`flex items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-white/10 hover:text-white ${addButtonSize}`}
          >
            <MdAdd className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
