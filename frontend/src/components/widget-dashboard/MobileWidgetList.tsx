import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { testIds } from "@/lib/testids";
import { cn } from "@/lib/utils";

import { deriveMobileOrder, type MobileWidgetItem } from "./mobileOrder";

export type { MobileWidgetItem } from "./mobileOrder";

interface MobileWidgetListProps {
  items: MobileWidgetItem[];
  /** Persisted mobile order of ids. */
  order: string[];
  /** Called with the complete next order after any reorder. */
  onReorder: (next: string[]) => void;
  isEditMode: boolean;
}

/**
 * The <768px rendering of a widget dashboard: a vertical stack ordered
 * by `order`. In edit mode it becomes a dnd-kit sortable list — long-press
 * (~250ms) drag so a scroll gesture doesn't turn into an accidental drag —
 * plus per-item up/down buttons for keyboard/assistive access. Reordering
 * only ever emits a new id order; it never touches desktop positions.
 */
export function MobileWidgetList({ items, order, onReorder, isEditMode }: MobileWidgetListProps) {
  const ordered = useMemo(() => deriveMobileOrder(items, order), [items, order]);
  const orderedIds = useMemo(() => ordered.map((i) => i.id), [ordered]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const moveBy = (id: string, dir: -1 | 1) => {
    const from = orderedIds.indexOf(id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= orderedIds.length) return;
    onReorder(arrayMove(orderedIds, from, to));
  };

  if (!isEditMode) {
    return (
      <div className="space-y-4">
        {ordered.map((item) => (
          <div key={item.id} className="min-h-[200px]">
            {item.node}
          </div>
        ))}
      </div>
    );
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = orderedIds.indexOf(String(active.id));
    const to = orderedIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(orderedIds, from, to));
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
        <ul className="space-y-4">
          {ordered.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              isFirst={index === 0}
              isLast={index === ordered.length - 1}
              onMove={moveBy}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  item,
  isFirst,
  isLast,
  onMove,
}: {
  item: MobileWidgetItem;
  isFirst: boolean;
  isLast: boolean;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  const { t } = useTranslation("widgets");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn("rounded-lg", isDragging && "opacity-60 shadow-lg")}
    >
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("mobileList.dragHandle")}
          data-testid={testIds.widgets.mobileList.dragHandle(item.id)}
          className="inline-flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-text-tertiary hover:bg-surface-overlay active:cursor-grabbing"
        >
          <GripVertical size={18} strokeWidth={1.75} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onMove(item.id, -1)}
          disabled={isFirst}
          aria-label={t("mobileList.moveUp")}
          data-testid={testIds.widgets.mobileList.moveUp(item.id)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-overlay disabled:opacity-30"
        >
          <ChevronUp size={18} strokeWidth={1.75} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onMove(item.id, 1)}
          disabled={isLast}
          aria-label={t("mobileList.moveDown")}
          data-testid={testIds.widgets.mobileList.moveDown(item.id)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-overlay disabled:opacity-30"
        >
          <ChevronDown size={18} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <div className="min-h-[200px]">{item.node}</div>
    </li>
  );
}
