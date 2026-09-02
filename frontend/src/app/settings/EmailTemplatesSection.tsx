import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { MergeFieldHint } from "@/app/emails/EmailTemplatePicker";
import {
  type EmailTemplateOut,
  useCreateEmailTemplate,
  useDeleteEmailTemplate,
  useEmailTemplates,
  useUpdateEmailTemplate,
} from "@/app/emails/useEmailTemplates";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";

const inputClass =
  "mt-1 block w-full rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent focus:outline-none";

/** Create/edit dialog. `template` null = create. */
function TemplateEditor({
  template,
  onClose,
}: {
  template: EmailTemplateOut | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("settings");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose);
  const create = useCreateEmailTemplate();
  const update = useUpdateEmailTemplate();
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [error, setError] = useState<string | null>(null);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Which field a merge chip should drop its token into. Body by default —
  // clicking a chip blurs the field, so we remember the last focused one.
  const lastFocused = useRef<"subject" | "body">("body");

  const insertToken = (token: string) => {
    const el = lastFocused.current === "subject" ? subjectRef.current : bodyRef.current;
    const setValue = lastFocused.current === "subject" ? setSubject : setBody;
    const current = lastFocused.current === "subject" ? subject : body;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
    setValue(next);
    // Restore the caret behind the inserted token once React has painted.
    window.requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const pending = create.isPending || update.isPending;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload = { name: name.trim(), subject: subject.trim(), body };
    if (!payload.name || !payload.subject) {
      setError(t("emailTemplates.errors.required"));
      return;
    }
    try {
      if (template) await update.mutateAsync({ id: template.id, body: payload });
      else await create.mutateAsync(payload);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? t("emailTemplates.errors.duplicate")
          : t("emailTemplates.errors.generic"),
      );
    }
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-template-editor-title"
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-bg/80 px-4 py-6 backdrop-blur-sm sm:py-10"
    >
      <form
        onSubmit={onSubmit}
        className="my-auto w-full max-w-xl rounded-lg border border-border bg-surface p-6 shadow-lg"
      >
        <h3 id="email-template-editor-title" className="text-lg font-semibold text-text-primary">
          {template ? t("emailTemplates.editor.editTitle") : t("emailTemplates.editor.newTitle")}
        </h3>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              {t("emailTemplates.editor.nameLabel")}
            </span>
            <input
              className={inputClass}
              value={name}
              data-testid={testIds.settings.emailTemplates.nameInput}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder={t("emailTemplates.editor.namePlaceholder")}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              {t("emailTemplates.editor.subjectLabel")}
            </span>
            <input
              ref={subjectRef}
              className={inputClass}
              value={subject}
              data-testid={testIds.settings.emailTemplates.subjectInput}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={() => (lastFocused.current = "subject")}
              maxLength={300}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              {t("emailTemplates.editor.bodyLabel")}
            </span>
            <textarea
              ref={bodyRef}
              className={`${inputClass} min-h-[180px] resize-y`}
              value={body}
              data-testid={testIds.settings.emailTemplates.bodyInput}
              onChange={(e) => setBody(e.target.value)}
              onFocus={() => (lastFocused.current = "body")}
              maxLength={20000}
            />
          </label>
          <MergeFieldHint onInsert={insertToken} />
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-danger-subtle bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            data-testid={testIds.settings.emailTemplates.cancel}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("emailTemplates.editor.cancel")}
          </button>
          <button
            type="submit"
            disabled={pending}
            data-testid={testIds.settings.emailTemplates.save}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? t("emailTemplates.editor.saving") : t("emailTemplates.editor.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

export function EmailTemplatesSection() {
  const { t } = useTranslation("settings");
  const locale = useLocale();
  const { data: user } = useCurrentUser();
  const list = useEmailTemplates();
  const del = useDeleteEmailTemplate();
  // Matches the backend gate (`require_role(UserRole.manager)`): everyone
  // reads, admins and managers write.
  const canManage = user?.role === "admin" || user?.role === "manager";
  const [editing, setEditing] = useState<EmailTemplateOut | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<EmailTemplateOut | null>(null);

  const items = list.data ?? [];

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("emailTemplates.title")}</h2>
          <p className="mt-1 text-sm text-text-tertiary">{t("emailTemplates.subtitle")}</p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            data-testid={testIds.settings.emailTemplates.add}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:bg-accent-hover"
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            {t("emailTemplates.addButton")}
          </button>
        ) : (
          <p className="text-xs text-text-tertiary">{t("emailTemplates.readOnlyNote")}</p>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {list.isPending ? (
          <p className="text-sm text-text-tertiary">{t("emailTemplates.loading")}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("emailTemplates.empty")}</p>
        ) : (
          items.map((tpl) => (
            <div
              key={tpl.id}
              data-testid={testIds.settings.emailTemplates.row(tpl.id)}
              className="flex items-start justify-between gap-3 rounded-md border border-border-subtle bg-surface-overlay px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{tpl.name}</p>
                <p className="truncate text-xs text-text-secondary">{tpl.subject}</p>
                <p className="mt-0.5 text-xs text-text-tertiary">
                  {t("emailTemplates.updatedAt", {
                    date: formatDate(tpl.updated_at, locale, { dateStyle: "short" }),
                  })}
                </p>
              </div>
              {canManage ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(tpl)}
                    data-testid={testIds.settings.emailTemplates.edit(tpl.id)}
                    aria-label={t("emailTemplates.editAriaLabel", { name: tpl.name })}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-elevated hover:text-text-primary"
                  >
                    <Pencil size={14} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingTemplate(tpl)}
                    data-testid={testIds.settings.emailTemplates.remove(tpl.id)}
                    aria-label={t("emailTemplates.deleteAriaLabel", { name: tpl.name })}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-danger-subtle hover:text-danger"
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {creating || editing ? (
        <TemplateEditor
          template={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deletingTemplate !== null}
        title={t("emailTemplates.deleteConfirmTitle")}
        body={
          deletingTemplate
            ? t("emailTemplates.deleteConfirm", { name: deletingTemplate.name })
            : null
        }
        confirmLabel={t("emailTemplates.deleteConfirmButton")}
        danger
        pending={del.isPending}
        onCancel={() => setDeletingTemplate(null)}
        onConfirm={() => {
          if (!deletingTemplate) return;
          del.mutate(deletingTemplate.id, { onSettled: () => setDeletingTemplate(null) });
        }}
      />
    </section>
  );
}
