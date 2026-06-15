import { Mail } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

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
        toast.success("Nastavení SMTP uloženo. Otestujte připojení.");
      },
      onError: (err) =>
        toast.error(
          err instanceof ApiError && typeof err.body === "object"
            ? "Uložení se nezdařilo — zkontrolujte zadané údaje."
            : "Uložení se nezdařilo, zkuste to prosím znovu.",
        ),
    });
  };

  const onTest = () => {
    test.mutate(undefined, {
      onSuccess: (res) => {
        if (res.ok) toast.success("Připojení k SMTP ověřeno ✓");
        else toast.error(`Test selhal: ${res.error ?? "neznámá chyba"}`);
      },
      onError: () => toast.error("Test se nezdařil, zkuste to prosím znovu."),
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
            <p className="text-sm font-medium text-text-primary">Odesílání e-mailů (SMTP)</p>
            {verified ? (
              <span className="inline-flex items-center rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
                Ověřeno
              </span>
            ) : configured ? (
              <span className="inline-flex items-center rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning">
                Neověřeno
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-text-secondary">
            Hromadné e-maily se odesílají z vaší vlastní schránky. Zadejte přihlašovací údaje ke
            svému SMTP serveru a ověřte připojení.
          </p>

          <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-text-secondary">SMTP server (host)</span>
              <input
                className={inputClass}
                value={form.host}
                onChange={(e) => set("host", e.target.value)}
                placeholder="smtp.vasefirma.cz"
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Port</span>
              <input
                className={inputClass}
                type="number"
                value={form.port}
                onChange={(e) => set("port", e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Zabezpečení</span>
              <select
                className={inputClass}
                value={form.security}
                onChange={(e) => set("security", e.target.value as Security)}
              >
                <option value="ssl">SSL/TLS (obvykle port 465)</option>
                <option value="starttls">STARTTLS (obvykle port 587)</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Uživatel</span>
              <input
                className={inputClass}
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                placeholder="jan@vasefirma.cz"
                autoComplete="off"
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Heslo</span>
              <input
                className={inputClass}
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder={
                  hasStoredPassword ? "•••••••• (beze změny)" : "heslo nebo app password"
                }
                autoComplete="new-password"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Odesílatel (e-mail)</span>
              <input
                className={inputClass}
                type="email"
                value={form.from_email}
                onChange={(e) => set("from_email", e.target.value)}
                placeholder="jan@vasefirma.cz"
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                Jméno odesílatele (volitelné)
              </span>
              <input
                className={inputClass}
                value={form.from_name}
                onChange={(e) => set("from_name", e.target.value)}
                placeholder="Jan Novák"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={save.isPending}
                className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {save.isPending ? "Ukládání…" : "Uložit"}
              </button>
              <button
                type="button"
                onClick={onTest}
                disabled={!configured || test.isPending}
                className="h-9 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {test.isPending ? "Testuji…" : "Otestovat připojení"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </li>
  );
}
