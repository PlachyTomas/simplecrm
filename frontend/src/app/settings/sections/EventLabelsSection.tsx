/**
 * Settings → Štítky událostí. One screen, no wizard: the org's shared event
 * labels with inline rename and an 8-swatch recolor, mirroring
 * SalesGoalsSection's read-for-all / write-for-admin structure.
 *
 * Creation lives in `LabelPicker` (the event form) — this list only manages
 * labels that already exist.
 */

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  EVENT_LABEL_PALETTE,
  useDeleteEventLabel,
  useEventLabels,
  useUpdateEventLabel,
  type EventLabelOut,
} from "@/app/events/useEventLabels";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ApiError } from "@/lib/api";
import { testIds } from "@/lib/testids";
import { cn } from "@/lib/utils";

function LabelRow({ label, canManage }: { label: EventLabelOut; canManage: boolean }) {
  const { t } = useTranslation("settings");
  const update = useUpdateEventLabel();
  const del = useDeleteEventLabel();
  const [name, setName] = useState(label.name);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const trimmed = name.trim();
  const dirty = trimmed.length > 0 && trimmed !== label.name;

  async function saveName() {
    if (!dirty) return;
    setError(null);
    try {
      await update.mutateAsync({ labelId: label.id, patch: { name: trimmed } });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? t("eventLabels.errors.duplicate")
          : t("eventLabels.errors.generic"),
      );
    }
  }

  async function recolor(color: string) {
    if (color === label.color) return;
    setError(null);
    try {
      await update.mutateAsync({ labelId: label.id, patch: { color } });
    } catch {
      setError(t("eventLabels.errors.generic"));
    }
  }

  function confirmDelete() {
    del.mutate(label.id, { onSettled: () => setConfirmOpen(false) });
  }

  return (
    <div
      data-testid={testIds.eventLabels.row(label.id)}
      className="flex flex-wrap items-center gap-3 rounded-md border border-border-subtle bg-surface-overlay px-3 py-2.5"
    >
      {canManage ? (
        <input
          type="text"
          value={name}
          maxLength={50}
          onChange={(e) => setName(e.target.value)}
          data-testid={testIds.eventLabels.name(label.id)}
          className="w-40 rounded-md border border-border bg-surface px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
        />
      ) : (
        <span
          className="flex items-center gap-2 text-sm font-medium text-text-primary"
          data-testid={testIds.eventLabels.name(label.id)}
        >
          <span
            aria-hidden
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: label.color }}
          />
          {label.name}
        </span>
      )}

      <span className="text-xs text-text-tertiary">
        {t("eventLabels.usageCount", { count: label.usage_count })}
      </span>

      {canManage ? (
        <>
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label={t("eventLabels.swatchGroupAriaLabel")}
          >
            {EVENT_LABEL_PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => void recolor(hex)}
                disabled={update.isPending}
                aria-label={t("eventLabels.swatchAriaLabel", { color: hex })}
                aria-pressed={hex === label.color}
                data-testid={testIds.eventLabels.color(label.id, hex)}
                className={cn(
                  "h-5 w-5 shrink-0 rounded-full border-2 transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50",
                  hex === label.color
                    ? "border-text-primary"
                    : "border-transparent hover:border-border-strong",
                )}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void saveName()}
              disabled={!dirty || update.isPending}
              data-testid={testIds.eventLabels.save(label.id)}
              className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-xs font-medium text-text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("eventLabels.save")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={del.isPending}
              aria-label={t("eventLabels.deleteAriaLabel", { name: label.name })}
              data-testid={testIds.eventLabels.delete(label.id)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary hover:bg-danger-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          </div>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="w-full text-xs text-danger">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title={t("eventLabels.deleteConfirmTitle")}
        body={t("eventLabels.deleteConfirm", { name: label.name, count: label.usage_count })}
        confirmLabel={t("eventLabels.deleteConfirmAction")}
        danger
        pending={del.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function EventLabelsSection() {
  const { t } = useTranslation("settings");
  const { data: user } = useCurrentUser();
  const list = useEventLabels();
  // Matches the backend gate (PUT/DELETE `require_role(UserRole.admin)`):
  // everyone reads, only admins write.
  const canManage = user?.role === "admin";

  const items = list.data ?? [];

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div>
        <h2 className="text-lg font-semibold">{t("eventLabels.title")}</h2>
        <p className="mt-1 text-sm text-text-tertiary">{t("eventLabels.subtitle")}</p>
        {!canManage ? (
          <p className="mt-1 text-xs text-text-tertiary">{t("eventLabels.readOnlyNote")}</p>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {list.isPending ? (
          <p className="text-sm text-text-tertiary">{t("eventLabels.loading")}</p>
        ) : list.isError ? (
          <p className="text-sm text-danger" role="alert">
            {t("eventLabels.errorLoad")}
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("eventLabels.empty")}</p>
        ) : (
          items.map((label) => <LabelRow key={label.id} label={label} canManage={canManage} />)
        )}
      </div>
    </section>
  );
}
