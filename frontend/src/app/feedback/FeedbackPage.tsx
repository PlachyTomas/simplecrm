/**
 * Feedback form. Authenticated users pick bug vs. improvement, write
 * a one-line caption + free-text body, optionally attach up to five
 * screenshots, and submit. The backend forwards the payload (with the
 * user's email set as Reply-To) to `podpora@simplecrm.cz`.
 *
 * Attachment limits mirror the server: 5 files, 5 MB each, 15 MB total,
 * PNG/JPEG/WebP only. We surface size violations before hitting the
 * network so the user gets fast feedback.
 */

import type { ParseKeys } from "i18next";
import { useMutation } from "@tanstack/react-query";
import { Bug, Check, Lightbulb, Paperclip, Send, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/auth/useAuth";
import { ApiError, apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";
import type { components } from "@/types/api.generated";

type FeedbackKind = components["schemas"]["FeedbackKind"];
type FeedbackAccepted = components["schemas"]["FeedbackAccepted"];

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_ATTACHMENTS = 5;
const MAX_BYTES_PER_FILE = 5 * 1024 * 1024;
const MAX_BYTES_TOTAL = 15 * 1024 * 1024;

interface KindOption {
  value: FeedbackKind;
  labelKey: ParseKeys<"common">;
  descriptionKey: ParseKeys<"common">;
  icon: typeof Bug;
}

const KIND_OPTIONS: KindOption[] = [
  {
    value: "bug",
    labelKey: "feedback.kinds.bug.label",
    descriptionKey: "feedback.kinds.bug.description",
    icon: Bug,
  },
  {
    value: "improvement",
    labelKey: "feedback.kinds.improvement.label",
    descriptionKey: "feedback.kinds.improvement.description",
    icon: Lightbulb,
  },
];

export function FeedbackPage() {
  const { t } = useTranslation("common");
  usePageTitle(t("feedback.pageTitle"));
  const { accessToken } = useAuth();
  const toast = useToast();

  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [caption, setCaption] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const mutation = useMutation<FeedbackAccepted, Error, FormData>({
    mutationFn: (formData) =>
      apiFetch<FeedbackAccepted>("/api/v1/feedback", {
        method: "POST",
        token: accessToken,
        body: formData,
      }),
  });

  function addFiles(incoming: FileList | File[]) {
    setAttachmentError(null);
    const next: File[] = [...files];
    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_ATTACHMENTS) {
        setAttachmentError(t("feedback.errors.tooManyFiles", { max: MAX_ATTACHMENTS }));
        break;
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        setAttachmentError(t("feedback.errors.unsupportedType", { name: file.name }));
        continue;
      }
      if (file.size > MAX_BYTES_PER_FILE) {
        setAttachmentError(t("feedback.errors.fileTooLarge", { name: file.name }));
        continue;
      }
      next.push(file);
    }
    const total = next.reduce((sum, f) => sum + f.size, 0);
    if (total > MAX_BYTES_TOTAL) {
      setAttachmentError(t("feedback.errors.totalTooLarge"));
      return;
    }
    setFiles(next);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setAttachmentError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!caption.trim() || !body.trim()) return;

    const formData = new FormData();
    formData.append("kind", kind);
    formData.append("caption", caption.trim());
    formData.append("body", body.trim());
    for (const file of files) {
      formData.append("attachments", file, file.name);
    }

    try {
      await mutation.mutateAsync(formData);
      toast.success(t("feedback.toastSuccess"));
      setCaption("");
      setBody("");
      setFiles([]);
      setAttachmentError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = (err.body as { detail?: unknown })?.detail;
        const message = typeof detail === "string" ? detail : t("feedback.errors.submitFailedGeneric");
        toast.error(message);
      } else {
        toast.error(t("feedback.errors.submitFailedRetry"));
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t("feedback.pageTitle")}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t("feedback.intro")}</p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-lg border border-border bg-surface p-6"
      >
        <fieldset>
          <legend className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            {t("feedback.kindLegend")}
          </legend>
          <div role="radiogroup" className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {KIND_OPTIONS.map(({ value, labelKey, descriptionKey, icon: Icon }) => {
              const selected = kind === value;
              return (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-md border-2 p-4 transition-colors duration-fast",
                    selected
                      ? "border-accent bg-accent-subtle"
                      : "border-border bg-surface-overlay hover:border-text-tertiary",
                  )}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={value}
                    checked={selected}
                    onChange={() => setKind(value)}
                    className="sr-only"
                  />
                  <Icon
                    size={20}
                    strokeWidth={1.75}
                    aria-hidden
                    className={selected ? "text-accent" : "text-text-secondary"}
                  />
                  <div>
                    <p className="text-sm font-medium text-text-primary">{t(labelKey)}</p>
                    <p className="mt-0.5 text-xs text-text-tertiary">{t(descriptionKey)}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            {t("feedback.captionLabel")}
          </span>
          <input
            type="text"
            required
            maxLength={200}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={t("feedback.captionPlaceholder")}
            className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            {t("feedback.bodyLabel")}
          </span>
          <textarea
            required
            rows={6}
            maxLength={10_000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("feedback.bodyPlaceholder")}
            className="mt-2 block w-full rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
        </label>

        <fieldset>
          <legend className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            {t("feedback.attachmentsLegend")}
          </legend>
          <p className="mt-1 text-xs text-text-tertiary">
            {t("feedback.attachmentsHint", { max: MAX_ATTACHMENTS })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-overlay px-3 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary">
              <Paperclip size={14} strokeWidth={1.75} aria-hidden />
              {t("feedback.addScreenshot")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {files.length > 0 ? (
              <span className="text-xs text-text-tertiary">
                {files.length} / {MAX_ATTACHMENTS}
              </span>
            ) : null}
          </div>
          {files.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-overlay px-3 py-2 text-sm"
                >
                  <Paperclip
                    size={14}
                    strokeWidth={1.75}
                    aria-hidden
                    className="shrink-0 text-text-tertiary"
                  />
                  <span className="min-w-0 flex-1 truncate text-text-primary">{file.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-text-tertiary">
                    {(file.size / 1024).toFixed(0)} kB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    aria-label={t("feedback.removeFileAriaLabel", { name: file.name })}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-text-tertiary transition-colors duration-fast hover:bg-danger-subtle hover:text-danger"
                  >
                    <X size={14} strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {attachmentError ? (
            <p
              role="alert"
              className="mt-3 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {attachmentError}
            </p>
          ) : null}
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-5">
          <p className="text-xs text-text-tertiary">
            {t("feedback.supportEmailPrefix")}{" "}
            <code className="font-mono text-text-secondary">podpora@simplecrm.cz</code>{" "}
            {t("feedback.supportEmailSuffix")}
          </p>
          <button
            type="submit"
            disabled={mutation.isPending || !caption.trim() || !body.trim()}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutation.isSuccess ? (
              <Check size={16} strokeWidth={2} aria-hidden />
            ) : (
              <Send size={16} strokeWidth={1.75} aria-hidden />
            )}
            {mutation.isPending ? t("feedback.submitting") : t("feedback.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
