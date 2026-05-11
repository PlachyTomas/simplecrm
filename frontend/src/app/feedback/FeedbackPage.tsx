/**
 * Feedback form. Authenticated users pick bug vs. improvement, write
 * a one-line caption + free-text body, optionally attach up to five
 * screenshots, and submit. The backend forwards the payload (with the
 * user's email set as Reply-To) to `simplecrm@seznam.cz`.
 *
 * Attachment limits mirror the server: 5 files, 5 MB each, 15 MB total,
 * PNG/JPEG/WebP only. We surface size violations before hitting the
 * network so the user gets fast feedback.
 */

import { useMutation } from "@tanstack/react-query";
import { Bug, Check, Lightbulb, Paperclip, Send, X } from "lucide-react";
import { type FormEvent, useState } from "react";

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
  label: string;
  description: string;
  icon: typeof Bug;
}

const KIND_OPTIONS: KindOption[] = [
  {
    value: "bug",
    label: "Nahlásit chybu",
    description: "Něco nefunguje, jak má.",
    icon: Bug,
  },
  {
    value: "improvement",
    label: "Návrh na vylepšení",
    description: "Nápad, co by usnadnilo práci.",
    icon: Lightbulb,
  },
];

export function FeedbackPage() {
  usePageTitle("Zpětná vazba");
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
        setAttachmentError(`Najednou lze přiložit nejvýše ${MAX_ATTACHMENTS} souborů.`);
        break;
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        setAttachmentError(`Soubor „${file.name}" není podporovaný (PNG, JPEG, WebP).`);
        continue;
      }
      if (file.size > MAX_BYTES_PER_FILE) {
        setAttachmentError(`Soubor „${file.name}" přesahuje 5 MB.`);
        continue;
      }
      next.push(file);
    }
    const total = next.reduce((sum, f) => sum + f.size, 0);
    if (total > MAX_BYTES_TOTAL) {
      setAttachmentError("Souhrnná velikost příloh přesahuje 15 MB.");
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
      toast.success("Zpráva odeslána. Děkujeme!");
      setCaption("");
      setBody("");
      setFiles([]);
      setAttachmentError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = (err.body as { detail?: unknown })?.detail;
        const message = typeof detail === "string" ? detail : "Odeslání se nezdařilo.";
        toast.error(message);
      } else {
        toast.error("Odeslání se nezdařilo. Zkuste to prosím znovu.");
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Zpětná vazba</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Něco nefunguje, nebo vám něco chybí? Napište nám — čteme každou zprávu.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-lg border border-border bg-surface p-6"
      >
        <fieldset>
          <legend className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Co chcete nahlásit?
          </legend>
          <div role="radiogroup" className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {KIND_OPTIONS.map(({ value, label, description, icon: Icon }) => {
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
                    <p className="text-sm font-medium text-text-primary">{label}</p>
                    <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Stručný popis
          </span>
          <input
            type="text"
            required
            maxLength={200}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Např. Po kliknutí na šipku karta v kanbanu zmizí."
            className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Detail
          </span>
          <textarea
            required
            rows={6}
            maxLength={10_000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Popište, co jste dělali, co jste čekali a co se místo toho stalo."
            className="mt-2 block w-full rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
        </label>

        <fieldset>
          <legend className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Snímky obrazovky (volitelné)
          </legend>
          <p className="mt-1 text-xs text-text-tertiary">
            Až {MAX_ATTACHMENTS} souborů, PNG/JPEG/WebP, max. 5 MB každý.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-overlay px-3 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary">
              <Paperclip size={14} strokeWidth={1.75} aria-hidden />
              Přidat snímek
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
                    aria-label={`Odebrat ${file.name}`}
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
            Zpráva půjde na{" "}
            <code className="font-mono text-text-secondary">simplecrm@seznam.cz</code> a odpovíme
            vám na váš e-mail.
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
            {mutation.isPending ? "Odesílám…" : "Odeslat zpětnou vazbu"}
          </button>
        </div>
      </form>
    </div>
  );
}
