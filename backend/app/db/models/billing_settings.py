from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BillingSettings(Base):
    """Singleton row holding seller-side billing/DPH configuration.

    Enforced as a singleton via the `id = 1` check constraint. The first
    migration seeds the row; subsequent reads/writes target id=1.
    """

    __tablename__ = "billing_settings"
    __table_args__ = (CheckConstraint("id = 1", name="ck_billing_settings_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)

    # Flips the DPH-aware display in <PriceDisplay>. False until SimpleCRM
    # (the seller) crosses the 2 M Kč obrat threshold.
    is_vat_payer: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Stored as Numeric so the rate is exact when accountants need it.
    vat_rate_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("21.00"), nullable=False
    )

    seller_iban: Mapped[str | None] = mapped_column(String(34))
    seller_ico: Mapped[str | None] = mapped_column(String(8))
    contact_email: Mapped[str] = mapped_column(
        String(120), default="podpora@simplecrm.cz", nullable=False
    )

    # ----------------------------------------------------------------------- #
    # Issuer fields — copied into each tax-invoice's frozen snapshot at
    # issuance time so future BillingSettings changes don't retroactively
    # rewrite already-issued invoices. Empty defaults so the singleton row
    # remains valid post-migration; the founder fills them in via the
    # super-admin UI before the first invoice is issued.
    # ----------------------------------------------------------------------- #
    issuer_name: Mapped[str] = mapped_column(
        String(200), default="", server_default="", nullable=False
    )
    issuer_address_street: Mapped[str] = mapped_column(
        String(200), default="", server_default="", nullable=False
    )
    issuer_address_city: Mapped[str] = mapped_column(
        String(100), default="", server_default="", nullable=False
    )
    issuer_address_zip: Mapped[str] = mapped_column(
        String(10), default="", server_default="", nullable=False
    )
    # Multi-line; e.g. "Zapsán v živnostenském rejstříku, vedeném Úřadem
    # městské části Praha 4". For an s.r.o. this'd be the obchodní rejstřík
    # spisová značka.
    issuer_register_text: Mapped[str] = mapped_column(
        Text, default="", server_default="", nullable=False
    )
    # Domestic Czech bank account in `číslo/kód` format (e.g. "123456789/0100").
    # Optional — IBAN already covers the bank-transfer case; this is a UX
    # nicety for customers whose accountants prefer the domestic format.
    issuer_account_domestic: Mapped[str | None] = mapped_column(String(32))

    # Default splatnost (datum splatnosti = issued + this many days).
    # Per Czech B2B convention, 14 days is standard for SaaS.
    default_payment_term_days: Mapped[int] = mapped_column(
        Integer, default=14, server_default="14", nullable=False
    )

    # Jinja2 templates rendered by InvoiceMailer (commit #5). Variables
    # available: number, due_date, customer_name, period_start, period_end,
    # total_display, issuer_iban, variable_symbol. The defaults are deliberate
    # plain-text Czech so an unfamiliar founder gets a reasonable email out
    # of the box; they're meant to be edited via the admin UI.
    invoice_email_subject_template: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        default="Faktura č. {{ number }} — SimpleCRM, splatnost {{ due_date }}",
        server_default=("Faktura č. {{ number }} — SimpleCRM, splatnost {{ due_date }}"),
    )
    invoice_email_body_template: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default=(
            "Dobrý den, {{ customer_name }},\n\n"
            "posíláme Vám fakturu **č. {{ number }}** za období "
            "{{ period_start }} – {{ period_end }}.\n\n"
            "**Celkem k úhradě:** {{ total_display }}\n"
            "**Splatnost:** {{ due_date }}\n\n"
            "Platbu prosím zašlete převodem:\n\n"
            "- IBAN: {{ issuer_iban }}\n"
            "- Variabilní symbol: {{ variable_symbol }}\n\n"
            "Nejjednodušší je zaplatit naskenováním QR kódu, který najdete "
            "přímo na faktuře.\n\n"
            "Fakturu v PDF najdete v příloze. Pro zobrazení v aplikaci se "
            "přihlaste na simplecrm.cz.\n\n"
            "S přátelským pozdravem,\nSimpleCRM\n"
        ),
        server_default=(
            "Dobrý den, {{ customer_name }},\n\n"
            "posíláme Vám fakturu **č. {{ number }}** za období "
            "{{ period_start }} – {{ period_end }}.\n\n"
            "**Celkem k úhradě:** {{ total_display }}\n"
            "**Splatnost:** {{ due_date }}\n\n"
            "Platbu prosím zašlete převodem:\n\n"
            "- IBAN: {{ issuer_iban }}\n"
            "- Variabilní symbol: {{ variable_symbol }}\n\n"
            "Nejjednodušší je zaplatit naskenováním QR kódu, který najdete "
            "přímo na faktuře.\n\n"
            "Fakturu v PDF najdete v příloze. Pro zobrazení v aplikaci se "
            "přihlaste na simplecrm.cz.\n\n"
            "S přátelským pozdravem,\nSimpleCRM\n"
        ),
    )

    # English counterparts of the two templates above, rendered by
    # InvoiceMailer when the customer org's locale resolves to "en"
    # (`language_for_locale(org.locale)`). Same `{{ }}` vars as the cs
    # templates; kept as separate NOT NULL columns (not a lang-keyed JSON
    # blob) so the super-admin edit form stays two plain textareas per
    # language, mirroring the cs columns above.
    invoice_email_subject_template_en: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        default="Invoice {{ number }} — SimpleCRM, due {{ due_date }}",
        server_default=("Invoice {{ number }} — SimpleCRM, due {{ due_date }}"),
    )
    invoice_email_body_template_en: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default=(
            "Hello {{ customer_name }},\n\n"
            "we are sending you invoice **No. {{ number }}** for the period "
            "{{ period_start }} – {{ period_end }}.\n\n"
            "**Total due:** {{ total_display }}\n"
            "**Due date:** {{ due_date }}\n\n"
            "Please send payment by bank transfer:\n\n"
            "- IBAN: {{ issuer_iban }}\n"
            "- Variable symbol: {{ variable_symbol }}\n\n"
            "The easiest way to pay is by scanning the QR code found "
            "directly on the invoice.\n\n"
            "You'll find the invoice PDF attached. To view it in the app, "
            "sign in at simplecrm.cz.\n\n"
            "Best regards,\nSimpleCRM\n"
        ),
        server_default=(
            "Hello {{ customer_name }},\n\n"
            "we are sending you invoice **No. {{ number }}** for the period "
            "{{ period_start }} – {{ period_end }}.\n\n"
            "**Total due:** {{ total_display }}\n"
            "**Due date:** {{ due_date }}\n\n"
            "Please send payment by bank transfer:\n\n"
            "- IBAN: {{ issuer_iban }}\n"
            "- Variable symbol: {{ variable_symbol }}\n\n"
            "The easiest way to pay is by scanning the QR code found "
            "directly on the invoice.\n\n"
            "You'll find the invoice PDF attached. To view it in the app, "
            "sign in at simplecrm.cz.\n\n"
            "Best regards,\nSimpleCRM\n"
        ),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
