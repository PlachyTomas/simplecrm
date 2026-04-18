import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import {
  type StageOut,
  useCreateStage,
  useDeleteStage,
  usePipeline,
  useReorderStages,
  useUpdateStage,
} from "@/app/settings/usePipelineSettings";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { ApiError } from "@/lib/api";

type StageType = "open" | "won" | "lost";

const STAGE_TYPE_LABEL: Record<StageType, string> = {
  open: "Otevřená",
  won: "Výhra",
  lost: "Prohra",
};

interface StageFormState {
  name: string;
  default_probability: number;
  color: string;
  stage_type: StageType;
}

const EMPTY_FORM: StageFormState = {
  name: "",
  default_probability: 0,
  color: "#3D5AFE",
  stage_type: "open",
};

function StageForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
}: {
  initial: StageFormState;
  submitLabel: string;
  onSubmit: (values: StageFormState) => Promise<void>;
  onCancel?: () => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<StageFormState>(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(String((err.body as { detail?: unknown })?.detail ?? err.message));
      } else {
        setError(err instanceof Error ? err.message : "Neznámá chyba.");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-12">
      <label className="sm:col-span-5 text-xs font-medium text-text-tertiary">
        Název
        <input
          type="text"
          required
          maxLength={80}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
        />
      </label>
      <label className="sm:col-span-2 text-xs font-medium text-text-tertiary">
        Pravděp. (%)
        <input
          type="number"
          min={0}
          max={100}
          value={form.default_probability}
          onChange={(e) =>
            setForm((f) => ({ ...f, default_probability: Number(e.target.value) }))
          }
          className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary tabular-nums"
        />
      </label>
      <label className="sm:col-span-2 text-xs font-medium text-text-tertiary">
        Barva
        <input
          type="color"
          value={form.color}
          onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
          className="mt-1 block h-[34px] w-full rounded-md border border-border bg-surface"
        />
      </label>
      <label className="sm:col-span-3 text-xs font-medium text-text-tertiary">
        Typ
        <select
          value={form.stage_type}
          onChange={(e) =>
            setForm((f) => ({ ...f, stage_type: e.target.value as StageType }))
          }
          className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
        >
          <option value="open">Otevřená</option>
          <option value="won">Výhra</option>
          <option value="lost">Prohra</option>
        </select>
      </label>
      {error ? (
        <p className="sm:col-span-12 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="sm:col-span-12 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            Zrušit
          </button>
        ) : null}
      </div>
    </form>
  );
}

function StageRow({
  stage,
  canMoveUp,
  canMoveDown,
  onMove,
  onEdit,
  onDelete,
}: {
  stage: StageOut;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-border-subtle py-3 last:border-0">
      <span
        aria-hidden
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: stage.color }}
      />
      <div className="flex-1">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-medium text-text-primary">{stage.name}</span>
          <span className="text-xs text-text-tertiary">
            {STAGE_TYPE_LABEL[stage.stage_type as StageType]} · {stage.default_probability}%
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Posunout nahoru"
          disabled={!canMoveUp}
          onClick={() => onMove(-1)}
          className="rounded p-1.5 text-text-secondary hover:bg-surface-elevated hover:text-text-primary disabled:opacity-30"
        >
          <ArrowUp size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Posunout dolů"
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
          className="rounded p-1.5 text-text-secondary hover:bg-surface-elevated hover:text-text-primary disabled:opacity-30"
        >
          <ArrowDown size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Upravit"
          onClick={onEdit}
          className="rounded p-1.5 text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
        >
          <Pencil size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Smazat"
          onClick={onDelete}
          className="rounded p-1.5 text-text-secondary hover:bg-danger-subtle hover:text-danger"
        >
          <Trash2 size={16} strokeWidth={1.75} />
        </button>
      </div>
    </li>
  );
}

export function SettingsPage() {
  const { data: user } = useCurrentUser();
  const { data: pipeline, isPending, isError } = usePipeline();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const reorder = useReorderStages();

  const [addingOpen, setAddingOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání…
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold">Nastavení</h1>
        <p className="mt-3 text-sm text-text-secondary">
          Úpravy pipeline může provádět pouze administrátor.
        </p>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání pipeline…
      </div>
    );
  }
  if (isError || !pipeline) {
    return (
      <div className="m-4 rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger md:m-8">
        Pipeline se nepodařilo načíst.
      </div>
    );
  }

  const stages = [...pipeline.stages].sort((a, b) => a.position - b.position);

  async function handleMove(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= stages.length) return;
    const newOrder = stages.map((s) => s.id);
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    setGlobalError(null);
    try {
      await reorder.mutateAsync(newOrder);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Přesun se nezdařil.");
    }
  }

  async function handleDelete(stage: StageOut) {
    if (!window.confirm(`Smazat fázi "${stage.name}"?`)) return;
    setGlobalError(null);
    try {
      await deleteStage.mutateAsync(stage.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setGlobalError(String((err.body as { detail?: unknown })?.detail ?? err.message));
      } else {
        setGlobalError(err instanceof Error ? err.message : "Smazání se nezdařilo.");
      }
    }
  }

  const editing = editingId ? stages.find((s) => s.id === editingId) ?? null : null;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Nastavení pipeline</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Spravujte fáze pipeline, jejich pořadí a pravděpodobnosti.
        </p>
      </header>

      {globalError ? (
        <div
          className="mb-4 rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {globalError}
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Fáze</h2>
          {!addingOpen ? (
            <button
              type="button"
              onClick={() => setAddingOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
            >
              <Plus size={16} strokeWidth={1.75} /> Přidat fázi
            </button>
          ) : null}
        </div>

        {addingOpen ? (
          <div className="mt-4 rounded-md border border-border-subtle p-4">
            <StageForm
              initial={EMPTY_FORM}
              submitLabel="Vytvořit"
              busy={createStage.isPending}
              onCancel={() => setAddingOpen(false)}
              onSubmit={async (values) => {
                await createStage.mutateAsync(values);
                setAddingOpen(false);
              }}
            />
          </div>
        ) : null}

        <ol className="mt-4">
          {stages.map((stage, idx) => {
            const isEditing = editing && editing.id === stage.id;
            if (isEditing && editing) {
              return (
                <li
                  key={stage.id}
                  className="border-b border-border-subtle py-3 last:border-0"
                >
                  <StageForm
                    initial={{
                      name: editing.name,
                      default_probability: editing.default_probability,
                      color: editing.color,
                      stage_type: editing.stage_type as StageType,
                    }}
                    submitLabel="Uložit"
                    busy={updateStage.isPending}
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (values) => {
                      await updateStage.mutateAsync({ id: editing.id, patch: values });
                      setEditingId(null);
                    }}
                  />
                </li>
              );
            }
            return (
              <StageRow
                key={stage.id}
                stage={stage}
                canMoveUp={idx > 0}
                canMoveDown={idx < stages.length - 1}
                onMove={(dir) => void handleMove(idx, dir)}
                onEdit={() => setEditingId(stage.id)}
                onDelete={() => void handleDelete(stage)}
              />
            );
          })}
        </ol>
      </section>
    </div>
  );
}
