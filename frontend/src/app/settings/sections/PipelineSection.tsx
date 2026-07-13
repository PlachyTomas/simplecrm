import type { ParseKeys } from "i18next";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type StageOut,
  useCreateStage,
  useDeleteStage,
  usePipeline,
  useReorderStages,
  useUpdateStage,
} from "@/app/settings/usePipelineSettings";
import { ApiError } from "@/lib/api";

type StageType = "open" | "won" | "lost";

const STAGE_TYPE_LABEL_KEY: Record<StageType, ParseKeys<"settings">> = {
  open: "pipeline.stageTypes.open",
  won: "pipeline.stageTypes.won",
  lost: "pipeline.stageTypes.lost",
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
  const { t } = useTranslation("settings");
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
        setError(err instanceof Error ? err.message : t("pipeline.form.errorUnknown"));
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-12">
      <label className="text-xs font-medium text-text-tertiary sm:col-span-5">
        {t("pipeline.form.nameLabel")}
        <input
          type="text"
          required
          maxLength={80}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
        />
      </label>
      <label className="text-xs font-medium text-text-tertiary sm:col-span-2">
        {t("pipeline.form.probabilityLabel")}
        <input
          type="number"
          min={0}
          max={100}
          value={form.default_probability}
          onChange={(e) => setForm((f) => ({ ...f, default_probability: Number(e.target.value) }))}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm tabular-nums text-text-primary"
        />
      </label>
      <label className="text-xs font-medium text-text-tertiary sm:col-span-2">
        {t("pipeline.form.colorLabel")}
        <input
          type="color"
          value={form.color}
          onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
          className="mt-1 block h-[34px] w-full rounded-md border border-border bg-surface"
        />
      </label>
      <label className="text-xs font-medium text-text-tertiary sm:col-span-3">
        {t("pipeline.form.typeLabel")}
        <select
          value={form.stage_type}
          onChange={(e) => setForm((f) => ({ ...f, stage_type: e.target.value as StageType }))}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
        >
          <option value="open">{t(STAGE_TYPE_LABEL_KEY.open)}</option>
          <option value="won">{t(STAGE_TYPE_LABEL_KEY.won)}</option>
          <option value="lost">{t(STAGE_TYPE_LABEL_KEY.lost)}</option>
        </select>
      </label>
      {error ? (
        <p className="text-sm text-danger sm:col-span-12" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2 sm:col-span-12">
        <button
          type="submit"
          disabled={busy}
          className="text-accent-foreground rounded-md bg-accent px-3 py-1.5 text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
        >
          {submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            {t("pipeline.form.cancel")}
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
  const { t } = useTranslation("settings");
  return (
    <li className="flex items-center gap-3 border-b border-border-subtle py-3 last:border-0">
      <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
      <div className="flex-1">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-medium text-text-primary">{stage.name}</span>
          <span className="text-xs text-text-tertiary">
            {t(STAGE_TYPE_LABEL_KEY[stage.stage_type as StageType])} · {stage.default_probability}%
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t("pipeline.row.moveUpAriaLabel")}
          disabled={!canMoveUp}
          onClick={() => onMove(-1)}
          className="rounded p-1.5 text-text-secondary hover:bg-surface-elevated hover:text-text-primary disabled:opacity-30"
        >
          <ArrowUp size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={t("pipeline.row.moveDownAriaLabel")}
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
          className="rounded p-1.5 text-text-secondary hover:bg-surface-elevated hover:text-text-primary disabled:opacity-30"
        >
          <ArrowDown size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={t("pipeline.row.editAriaLabel")}
          onClick={onEdit}
          className="rounded p-1.5 text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
        >
          <Pencil size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={t("pipeline.row.deleteAriaLabel")}
          onClick={onDelete}
          className="rounded p-1.5 text-text-secondary hover:bg-danger-subtle hover:text-danger"
        >
          <Trash2 size={16} strokeWidth={1.75} />
        </button>
      </div>
    </li>
  );
}

export function PipelineSection() {
  const { t } = useTranslation("settings");
  const { data: pipeline, isPending, isError } = usePipeline();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const reorder = useReorderStages();
  const [addingOpen, setAddingOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const stagesReady = !isPending && !isError && pipeline;
  const stages = stagesReady ? [...pipeline.stages].sort((a, b) => a.position - b.position) : [];

  async function handleMove(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= stages.length) return;
    const newOrder = stages.map((s) => s.id);
    // Both indices are within range (caller checks); the non-null assertions
    // satisfy noUncheckedIndexedAccess on the tuple-swap shorthand.
    [newOrder[idx], newOrder[target]] = [newOrder[target]!, newOrder[idx]!];
    setGlobalError(null);
    try {
      await reorder.mutateAsync(newOrder);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : t("pipeline.moveError"));
    }
  }

  async function handleDelete(stage: StageOut) {
    if (!window.confirm(t("pipeline.deleteConfirm", { name: stage.name }))) return;
    setGlobalError(null);
    try {
      await deleteStage.mutateAsync(stage.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setGlobalError(String((err.body as { detail?: unknown })?.detail ?? err.message));
      } else {
        setGlobalError(err instanceof Error ? err.message : t("pipeline.deleteError"));
      }
    }
  }

  const editing = editingId ? (stages.find((s) => s.id === editingId) ?? null) : null;

  return (
    <>
      {globalError ? (
        <div
          className="mb-4 rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {globalError}
        </div>
      ) : null}
      {isPending ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-tertiary">
          {t("pipeline.loading")}
        </div>
      ) : isError || !pipeline ? (
        <div className="rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger">
          {t("pipeline.errorLoad")}
        </div>
      ) : (
        <section className="rounded-lg border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("pipeline.title")}</h2>
            {!addingOpen ? (
              <button
                type="button"
                onClick={() => setAddingOpen(true)}
                className="text-accent-foreground inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium hover:bg-accent-hover"
              >
                <Plus size={16} strokeWidth={1.75} /> {t("pipeline.addButton")}
              </button>
            ) : null}
          </div>

          {addingOpen ? (
            <div className="mt-4 rounded-md border border-border-subtle p-4">
              <StageForm
                initial={EMPTY_FORM}
                submitLabel={t("pipeline.form.createSubmit")}
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
                  <li key={stage.id} className="border-b border-border-subtle py-3 last:border-0">
                    <StageForm
                      initial={{
                        name: editing.name,
                        default_probability: editing.default_probability,
                        color: editing.color,
                        stage_type: editing.stage_type as StageType,
                      }}
                      submitLabel={t("pipeline.form.saveSubmit")}
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
      )}
    </>
  );
}
