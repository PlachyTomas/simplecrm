import { Mail } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  isSmtpConfigured,
  type SmtpSettingsIn,
  useSaveSmtpSettings,
  useSmtpSettings,
  useTestSmtpSettings,
} from "@/app/settings/useSmtpSettings";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";

type Security = "ssl" | "starttls";

interface FormState {
  host: string;
  port: string;
  security: Security;
  username: string;
  password: string;
  from_email: string;
  from_name: string;
}

const EMPTY: FormState = {
  host: "",
  port: "465",
  security: "ssl",
  username: "",
  password: "",
  from_email: "",
  from_name: "",
};

const inputClass =
  "mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none";

export function SmtpSettingsCard() {
  const { t } = useTranslation("settings");
  const toast = useToast();
  const { data } = useSmtpSettings();
  const save = useSaveSmtpSettings();
  const test = useTestSmtpSettings();

  const configured = isSmtpConfigured(data);
  const verified = configured && data.verified;
  const hasStoredPassword = configured && data.has_password;

  const [form, setForm] = useState<FormState>(EMPTY);

  // Hydrate the form once settings load (or change). The password is never
  // returned, so it stays blank — submitting blank keeps the stored one.
  useEffect(() => {
    if (!isSmtpConfigured(data)) return;
    setForm({
      host: data.host,
      port: String(data.port),
      security: data.use_starttls ? "starttls" : "ssl",
      username: data.username,
      password: "",
      from_email: data.from_email,
      from_name: data.from_name ?? "",
    });
  }, [data]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body: SmtpSettingsIn = {
      host: form.host.trim(),
      port: Number(form.port),
      use_ssl: form.security === "ssl",
      use_starttls: form.security === "starttls",
      username: form.username.trim(),
      password: form.password ? form.password : null,
      from_email: form.from_email.trim(),
      from_name: form.from_name.trim() || null,
    };
    save.mutate(body, {
      onSuccess: () => {
        setForm((f) => ({ ...f, password: "" }));
        toast.success(t("smtp.saveSuccess"));
      },
      onError: (err) =>
        toast.error(
          err instanceof ApiError && typeof err.body === "object"
            ? t("smtp.saveErrorDetailed")
            : t("smtp.saveErrorGeneric"),
        ),
    });
  };

  const onTest = () => {
    test.mutate(undefined, {
      onSuccess: (res) => {
        if (res.ok) toast.success(t("smtp.testSuccess"));
        else toast.error(`${t("smtp.testFailPrefix")} ${res.error ?? t("smtp.testUnknownError")}`);
      },
      onError: () => toast.error(t("smtp.testError")),
    });
  };

  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-md bg-accent-subtle p-2 text-accent">
          <Mail size={18} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-text-primary">{t("smtp.title")}</p>
            {verified ? (
              <span className="inline-flex items-center rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
                {t("smtp.verifiedBadge")}
              </span>
            ) : configured ? (
              <span className="inline-flex items-center rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning">
                {t("smtp.unverifiedBadge")}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-text-secondary">{t("smtp.subtitle")}</p>

          <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-text-secondary">
                {t("smtp.fields.host")}
              </span>
              <input
                className={inputClass}
                value={form.host}
                onChange={(e) => set("host", e.target.value)}
                placeholder={t("smtp.placeholders.host")}
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                {t("smtp.fields.port")}
              </span>
              <input
                className={inputClass}
                type="number"
                value={form.port}
                onChange={(e) => set("port", e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                {t("smtp.fields.security")}
              </span>
              <select
                className={inputClass}
                value={form.security}
                onChange={(e) => set("security", e.target.value as Security)}
              >
                <option value="ssl">{t("smtp.securityOptions.ssl")}</option>
                <option value="starttls">{t("smtp.securityOptions.starttls")}</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                {t("smtp.fields.username")}
              </span>
              <input
                className={inputClass}
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                placeholder={t("smtp.placeholders.username")}
                autoComplete="off"
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                {t("smtp.fields.password")}
              </span>
              <input
                className={inputClass}
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder={
                  hasStoredPassword
                    ? t("smtp.placeholders.passwordStored")
                    : t("smtp.placeholders.passwordNew")
                }
                autoComplete="new-password"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                {t("smtp.fields.fromEmail")}
              </span>
              <input
                className={inputClass}
                type="email"
                value={form.from_email}
                onChange={(e) => set("from_email", e.target.value)}
                placeholder={t("smtp.placeholders.fromEmail")}
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                {t("smtp.fields.fromName")}
              </span>
              <input
                className={inputClass}
                value={form.from_name}
                onChange={(e) => set("from_name", e.target.value)}
                placeholder={t("smtp.placeholders.fromName")}
              />
            </label>

            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={save.isPending}
                className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {save.isPending ? t("smtp.saving") : t("smtp.save")}
              </button>
              <button
                type="button"
                onClick={onTest}
                disabled={!configured || test.isPending}
                className="h-9 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {test.isPending ? t("smtp.testing") : t("smtp.test")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </li>
  );
}
