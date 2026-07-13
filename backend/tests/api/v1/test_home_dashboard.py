"""Integration tests for /api/v1/users/me/home-dashboard.

Mirrors the reports dashboard-config suite (`test_reports.py`), plus the
home-specific bits: role-aware defaults and `mobileOrder` validation.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import Organization, User, UserRole


@pytest.fixture
async def owned_cleanup() -> AsyncIterator[dict[str, list]]:
    tracked: dict[str, list] = {"orgs": [], "emails": []}
    yield tracked
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        if tracked["emails"]:
            await session.execute(delete(User).where(User.email.in_(tracked["emails"])))
        if tracked["orgs"]:
            await session.execute(delete(Organization).where(Organization.id.in_(tracked["orgs"])))
        await session.commit()


async def _make_org(
    session: AsyncSession,
    owned_cleanup: dict[str, list],
    *,
    show_leaderboard: bool = False,
) -> Organization:
    org = Organization(
        name=f"Org-{uuid.uuid4().hex[:6]}",
        show_leaderboard_to_salespeople=show_leaderboard,
    )
    session.add(org)
    await session.commit()
    await session.refresh(org)
    owned_cleanup["orgs"].append(org.id)
    return org


async def _make_user(
    session: AsyncSession,
    owned_cleanup: dict[str, list],
    org: Organization,
    *,
    role: UserRole,
    can_invite: bool = False,
) -> User:
    email = f"u-{uuid.uuid4().hex[:8]}@ex.cz"
    owned_cleanup["emails"].append(email)
    user = User(
        email=email,
        name="U",
        role=role,
        organization_id=org.id,
        can_invite=can_invite,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.organization_id, user.role)}"
    }


_URL = "/api/v1/users/me/home-dashboard"


# ---------------------------------------------------------------------------
# Roundtrip GET / PUT / DELETE
# ---------------------------------------------------------------------------


async def test_home_dashboard_returns_default_for_first_visit(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Empty `{}` (column-default) → API returns the role-aware default."""
    org = await _make_org(db_session, owned_cleanup)
    admin = await _make_user(db_session, owned_cleanup, org, role=UserRole.admin)

    resp = await client.get(_URL, headers=_auth(admin))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["version"] == 1
    types = [w["config"]["type"] for w in body["widgets"]]
    # First row is the 4 KPI tiles in a stable order.
    assert types[:4] == [
        "kpi_open_deals",
        "kpi_pipeline_value",
        "kpi_won_month",
        "kpi_revenue_month",
    ]
    assert "action_new_deal" in types
    # Admin gets the invite card + team analytics.
    assert "invite_teammates" in types
    assert "sales_leaderboard" in types
    assert "velocity" in types
    # mobileOrder mirrors the widget id sequence.
    ids = [w["id"] for w in body["widgets"]]
    assert body["mobileOrder"] == ids


async def test_home_dashboard_put_persists_then_get_returns_persisted(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """PUT a custom layout, then GET returns exactly what was saved."""
    org = await _make_org(db_session, owned_cleanup)
    user = await _make_user(db_session, owned_cleanup, org, role=UserRole.manager)

    payload = {
        "version": 1,
        "widgets": [
            {
                "id": "wid_kpi",
                "position": {"x": 0, "y": 0, "w": 3, "h": 2},
                "config": {"type": "kpi_revenue_month"},
            },
            {
                "id": "wid_action",
                "position": {"x": 3, "y": 0, "w": 3, "h": 1},
                "config": {"type": "action_new_company"},
            },
        ],
        "mobileOrder": ["wid_action", "wid_kpi"],
    }
    put_resp = await client.put(_URL, headers=_auth(user), json=payload)
    assert put_resp.status_code == 200, put_resp.text

    get_resp = await client.get(_URL, headers=_auth(user))
    assert get_resp.status_code == 200
    body = get_resp.json()
    assert len(body["widgets"]) == 2
    assert [w["config"]["type"] for w in body["widgets"]] == [
        "kpi_revenue_month",
        "action_new_company",
    ]
    # Mobile order is preserved independently of desktop order.
    assert body["mobileOrder"] == ["wid_action", "wid_kpi"]


async def test_home_dashboard_delete_resets_to_default(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _make_org(db_session, owned_cleanup)
    admin = await _make_user(db_session, owned_cleanup, org, role=UserRole.admin)

    await client.put(
        _URL,
        headers=_auth(admin),
        json={
            "version": 1,
            "widgets": [
                {
                    "id": "only",
                    "position": {"x": 0, "y": 0, "w": 3, "h": 2},
                    "config": {"type": "kpi_open_deals"},
                }
            ],
            "mobileOrder": ["only"],
        },
    )
    del_resp = await client.delete(_URL, headers=_auth(admin))
    assert del_resp.status_code == 204

    get_resp = await client.get(_URL, headers=_auth(admin))
    assert get_resp.status_code == 200
    types = [w["config"]["type"] for w in get_resp.json()["widgets"]]
    # Back to the admin default, which includes the KPI tiles + invite card.
    assert types[:4] == [
        "kpi_open_deals",
        "kpi_pipeline_value",
        "kpi_won_month",
        "kpi_revenue_month",
    ]
    assert "invite_teammates" in types


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


async def test_home_dashboard_rejects_unknown_widget_type(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _make_org(db_session, owned_cleanup)
    user = await _make_user(db_session, owned_cleanup, org, role=UserRole.admin)
    resp = await client.put(
        _URL,
        headers=_auth(user),
        json={
            "version": 1,
            "widgets": [
                {
                    "id": "x",
                    "position": {"x": 0, "y": 0, "w": 3, "h": 2},
                    "config": {"type": "nonsense"},
                }
            ],
        },
    )
    assert resp.status_code == 422


async def test_home_dashboard_rejects_overlapping_widgets(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _make_org(db_session, owned_cleanup)
    user = await _make_user(db_session, owned_cleanup, org, role=UserRole.admin)
    resp = await client.put(
        _URL,
        headers=_auth(user),
        json={
            "version": 1,
            "widgets": [
                {
                    "id": "a",
                    "position": {"x": 0, "y": 0, "w": 6, "h": 2},
                    "config": {"type": "kpi_open_deals"},
                },
                {
                    "id": "b",
                    "position": {"x": 3, "y": 0, "w": 6, "h": 2},
                    "config": {"type": "kpi_won_month"},
                },
            ],
        },
    )
    assert resp.status_code == 422
    assert "overlapping" in resp.text.lower()


async def test_home_dashboard_rejects_too_many_widgets(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _make_org(db_session, owned_cleanup)
    user = await _make_user(db_session, owned_cleanup, org, role=UserRole.admin)
    # 21 1×1 widgets stacked vertically — overlap-free, but over the cap.
    widgets = [
        {
            "id": f"w{i}",
            "position": {"x": 0, "y": i, "w": 1, "h": 1},
            "config": {"type": "kpi_open_deals"},
        }
        for i in range(21)
    ]
    resp = await client.put(_URL, headers=_auth(user), json={"version": 1, "widgets": widgets})
    assert resp.status_code == 422


async def test_home_dashboard_rejects_bad_mobile_order(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _make_org(db_session, owned_cleanup)
    user = await _make_user(db_session, owned_cleanup, org, role=UserRole.admin)
    base_widget = {
        "id": "a",
        "position": {"x": 0, "y": 0, "w": 3, "h": 2},
        "config": {"type": "kpi_open_deals"},
    }
    # Unknown id in mobileOrder → 422.
    unknown = await client.put(
        _URL,
        headers=_auth(user),
        json={"version": 1, "widgets": [base_widget], "mobileOrder": ["a", "ghost"]},
    )
    assert unknown.status_code == 422
    # Duplicate id in mobileOrder → 422.
    dup = await client.put(
        _URL,
        headers=_auth(user),
        json={"version": 1, "widgets": [base_widget], "mobileOrder": ["a", "a"]},
    )
    assert dup.status_code == 422


async def test_home_dashboard_accepts_date_preset_on_report_widget(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """A report widget config may carry a per-widget `date_preset`."""
    org = await _make_org(db_session, owned_cleanup)
    user = await _make_user(db_session, owned_cleanup, org, role=UserRole.admin)
    payload = {
        "version": 1,
        "widgets": [
            {
                "id": "w1",
                "position": {"x": 0, "y": 0, "w": 6, "h": 4},
                "config": {"type": "pipeline_value", "date_preset": "last_7_days"},
            }
        ],
        "mobileOrder": ["w1"],
    }
    put_resp = await client.put(_URL, headers=_auth(user), json=payload)
    assert put_resp.status_code == 200, put_resp.text

    get_resp = await client.get(_URL, headers=_auth(user))
    assert get_resp.status_code == 200
    cfg = get_resp.json()["widgets"][0]["config"]
    assert cfg["type"] == "pipeline_value"
    assert cfg["date_preset"] == "last_7_days"


async def test_home_dashboard_rejects_bad_date_preset(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _make_org(db_session, owned_cleanup)
    user = await _make_user(db_session, owned_cleanup, org, role=UserRole.admin)
    resp = await client.put(
        _URL,
        headers=_auth(user),
        json={
            "version": 1,
            "widgets": [
                {
                    "id": "w1",
                    "position": {"x": 0, "y": 0, "w": 6, "h": 4},
                    # "custom" is not among the allowed per-widget presets.
                    "config": {"type": "pipeline_value", "date_preset": "custom"},
                }
            ],
        },
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Role-aware defaults
# ---------------------------------------------------------------------------


async def test_default_salesperson_without_flags(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    """Plain salesperson: KPIs + new-deal action only, no invite/leaderboard."""
    org = await _make_org(db_session, owned_cleanup, show_leaderboard=False)
    user = await _make_user(db_session, owned_cleanup, org, role=UserRole.salesperson)
    body = (await client.get(_URL, headers=_auth(user))).json()
    types = [w["config"]["type"] for w in body["widgets"]]
    assert "invite_teammates" not in types
    assert "sales_leaderboard" not in types
    assert "velocity" not in types
    assert types == [
        "kpi_open_deals",
        "kpi_pipeline_value",
        "kpi_won_month",
        "kpi_revenue_month",
        "action_new_deal",
    ]


async def test_default_salesperson_with_can_invite_gets_invite_card(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _make_org(db_session, owned_cleanup, show_leaderboard=False)
    user = await _make_user(
        db_session, owned_cleanup, org, role=UserRole.salesperson, can_invite=True
    )
    body = (await client.get(_URL, headers=_auth(user))).json()
    types = [w["config"]["type"] for w in body["widgets"]]
    assert "invite_teammates" in types
    # Still no team analytics for a salesperson without the org flag.
    assert "sales_leaderboard" not in types
    assert "velocity" not in types


async def test_default_salesperson_with_org_leaderboard_flag(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _make_org(db_session, owned_cleanup, show_leaderboard=True)
    user = await _make_user(db_session, owned_cleanup, org, role=UserRole.salesperson)
    body = (await client.get(_URL, headers=_auth(user))).json()
    types = [w["config"]["type"] for w in body["widgets"]]
    assert "sales_leaderboard" in types
    assert "velocity" in types
    # No invite card without can_invite.
    assert "invite_teammates" not in types


async def test_default_manager_gets_team_analytics_no_invite(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _make_org(db_session, owned_cleanup, show_leaderboard=False)
    user = await _make_user(db_session, owned_cleanup, org, role=UserRole.manager)
    body = (await client.get(_URL, headers=_auth(user))).json()
    types = [w["config"]["type"] for w in body["widgets"]]
    assert "sales_leaderboard" in types
    assert "velocity" in types
    # Manager without can_invite doesn't get the invite card.
    assert "invite_teammates" not in types


async def test_default_admin_gets_everything(
    client: AsyncClient, db_session: AsyncSession, owned_cleanup: dict[str, list]
) -> None:
    org = await _make_org(db_session, owned_cleanup, show_leaderboard=False)
    user = await _make_user(db_session, owned_cleanup, org, role=UserRole.admin)
    body = (await client.get(_URL, headers=_auth(user))).json()
    types = [w["config"]["type"] for w in body["widgets"]]
    assert "invite_teammates" in types
    assert "sales_leaderboard" in types
    assert "velocity" in types
