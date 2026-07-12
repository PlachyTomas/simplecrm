"""Tests for per-locale email templates (Task 6).

Each `build_*_email` builder now delegates to `render_email`, which renders
a Jinja2 `.txt.j2` template per (name, lang) plus a subject looked up via
`t()`. The `test_*_cs_byte_identical_to_pre_refactor` cases pin the EXACT
subject+body strings captured from the builders before this refactor (see
plan Task 6 step 3) so a template/whitespace regression fails loudly.
"""

from __future__ import annotations

import pytest

from app.services.email import (
    Email,
    build_billing_info_reminder_email,
    build_freed_company_email,
    build_password_reset_email,
    build_subscription_pending_email,
    build_verification_email,
    render_email,
)
from app.services.invitations import _build_invite_email

# --------------------------------------------------------------------------- #
# cs byte-identical pins (captured from the pre-refactor builders)
# --------------------------------------------------------------------------- #


def test_verification_email_cs_byte_identical_to_pre_refactor() -> None:
    e = build_verification_email(
        recipient="a@b.cz", name="Tomáš", link="https://example.com/verify?token=abc"
    )
    assert e.subject == "SimpleCRM: ověřte svůj e-mail"
    assert e.body == (
        "Ahoj Tomáš,\n\n"
        "vítejte v SimpleCRM. Pro dokončení registrace prosím potvrďte svou "
        "e-mailovou adresu kliknutím na následující odkaz:\n\n"
        "https://example.com/verify?token=abc\n\n"
        "Odkaz je platný 24 hodin. Pokud jste registraci nezahájili, tento "
        "e-mail prosím ignorujte.\n"
    )


def test_password_reset_email_cs_byte_identical_to_pre_refactor() -> None:
    e = build_password_reset_email(
        recipient="a@b.cz", name="Tomáš", link="https://example.com/reset?token=abc"
    )
    assert e.subject == "SimpleCRM: obnovení hesla"
    assert e.body == (
        "Ahoj Tomáš,\n\n"
        "obdrželi jsme žádost o obnovení hesla pro váš účet. Nové heslo "
        "můžete nastavit kliknutím na následující odkaz:\n\n"
        "https://example.com/reset?token=abc\n\n"
        "Odkaz je platný 1 hodinu. Pokud jste o reset nežádali, tento "
        "e-mail prosím ignorujte — vaše heslo zůstane beze změny.\n"
    )


def test_freed_company_email_cs_byte_identical_to_pre_refactor_singular() -> None:
    e = build_freed_company_email(owner_email="a@b.cz", owner_name="Tomáš", company_names=["Acme"])
    assert e.subject == "SimpleCRM: 1 firma uvolněna"
    assert e.body == (
        "Ahoj Tomáš,\n\n"
        "tyto firmy byly uvolněny zpět do sdíleného poolu, protože u nich "
        "posledních 90 dní neproběhla žádná objednávka:\n\n"
        "• Acme\n\n"
        "Kdykoli je můžeš znovu převzít v aplikaci SimpleCRM.\n"
    )


def test_freed_company_email_cs_byte_identical_to_pre_refactor_plural() -> None:
    e = build_freed_company_email(
        owner_email="a@b.cz", owner_name="Tomáš", company_names=["Acme", "Beta"]
    )
    assert e.subject == "SimpleCRM: 2 firem uvolněno"
    assert e.body == (
        "Ahoj Tomáš,\n\n"
        "tyto firmy byly uvolněny zpět do sdíleného poolu, protože u nich "
        "posledních 90 dní neproběhla žádná objednávka:\n\n"
        "• Acme\n"
        "• Beta\n\n"
        "Kdykoli je můžeš znovu převzít v aplikaci SimpleCRM.\n"
    )


def test_subscription_pending_email_cs_byte_identical_to_pre_refactor() -> None:
    e = build_subscription_pending_email(org_name="Acme s.r.o.", plan_display="Roční")
    assert e.subject == "SimpleCRM: Acme s.r.o. si vybral plán Roční"
    assert e.body == (
        "Dobrý den,\n\n"
        "organizace Acme s.r.o. si vybrala plán Roční a čeká na aktivaci po "
        "obdržení platby.\n\n"
        "Po připsání platby aktivujte předplatné v super-admin rozhraní "
        "(/admin → detail organizace → Aktivovat předplatné).\n\n"
        "Detaily najdete v audit logu organizace.\n"
    )


def test_billing_info_reminder_email_cs_byte_identical_to_pre_refactor() -> None:
    e = build_billing_info_reminder_email(
        recipient="a@b.cz",
        name="Tomáš",
        org_name="Acme s.r.o.",
        days_remaining=5,
        settings_link="https://example.com/app/settings",
    )
    assert e.subject == "SimpleCRM: doplňte fakturační údaje (zkušebka končí za 5 dní)"
    assert e.body == (
        "Ahoj Tomáš,\n\n"
        "zkušební verze organizace Acme s.r.o. končí za 5 dní. Pro vystavení "
        "první faktury potřebujeme mít na souboru vaše fakturační údaje "
        "(IČO a sídlo). Doplňte je prosím v nastavení:\n\n"
        "https://example.com/app/settings\n\n"
        "Bez vyplněných údajů by faktura nebyla platným daňovým dokladem.\n"
    )


def test_invitation_email_cs_byte_identical_to_pre_refactor() -> None:
    e = _build_invite_email(
        to="a@b.cz", organization_name="Acme s.r.o.", link="https://example.com/invite/abc"
    )
    assert e.subject == "SimpleCRM: pozvánka do Acme s.r.o."
    assert e.body == (
        "Ahoj,\n\n"
        "byli jste pozváni do organizace Acme s.r.o. v aplikaci SimpleCRM.\n"
        "Pozvánku přijměte kliknutím na následující odkaz:\n\n"
        "https://example.com/invite/abc\n\n"
        "Odkaz vyprší za 7 dní.\n"
    )


# --------------------------------------------------------------------------- #
# lang= threads through to en + non-empty / contains ctx values
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "build, kwargs",
    [
        (
            build_verification_email,
            {"recipient": "a@b.cz", "name": "Tom", "link": "https://x.test/verify"},
        ),
        (
            build_password_reset_email,
            {"recipient": "a@b.cz", "name": "Tom", "link": "https://x.test/reset"},
        ),
        (
            build_billing_info_reminder_email,
            {
                "recipient": "a@b.cz",
                "name": "Tom",
                "org_name": "Acme Inc.",
                "days_remaining": 5,
                "settings_link": "https://x.test/app/settings",
            },
        ),
    ],
)
def test_builders_default_to_cs_and_support_en(build, kwargs) -> None:
    cs_email: Email = build(**kwargs)
    en_email: Email = build(**kwargs, lang="en")

    assert cs_email.subject and cs_email.body
    assert en_email.subject and en_email.body
    assert cs_email.subject != en_email.subject
    assert cs_email.body != en_email.body

    link = kwargs.get("link") or kwargs.get("settings_link")
    if link:
        assert link in cs_email.body
        assert link in en_email.body


def test_build_freed_company_email_en() -> None:
    e = build_freed_company_email(
        owner_email="a@b.cz", owner_name="Tom", company_names=["Acme"], lang="en"
    )
    assert e.subject == "SimpleCRM: 1 company freed"
    assert "Tom" in e.body
    assert "Acme" in e.body

    e2 = build_freed_company_email(
        owner_email="a@b.cz", owner_name="Tom", company_names=["Acme", "Beta"], lang="en"
    )
    assert e2.subject == "SimpleCRM: 2 companies freed"


def test_build_subscription_pending_email_en() -> None:
    e = build_subscription_pending_email(org_name="Acme Inc.", plan_display="Annual", lang="en")
    assert "Acme Inc." in e.subject
    assert "Annual" in e.body


def test_build_invite_email_en() -> None:
    e = _build_invite_email(
        to="a@b.cz", organization_name="Acme Inc.", link="https://x.test/invite/abc", lang="en"
    )
    assert "Acme Inc." in e.subject
    assert "https://x.test/invite/abc" in e.body


# --------------------------------------------------------------------------- #
# render_email() directly
# --------------------------------------------------------------------------- #


def test_render_email_renders_subject_and_body() -> None:
    e = render_email("verification", "cs", to="a@b.cz", name="Tomáš", link="https://x.test/v")
    assert e.to == "a@b.cz"
    assert e.subject == "SimpleCRM: ověřte svůj e-mail"
    assert "Tomáš" in e.body
    assert "https://x.test/v" in e.body


def test_render_email_en_renders_subject_and_body() -> None:
    e = render_email("verification", "en", to="a@b.cz", name="Tom", link="https://x.test/v")
    assert e.to == "a@b.cz"
    assert e.subject == "SimpleCRM: verify your email"
    assert "Tom" in e.body
    assert "https://x.test/v" in e.body
