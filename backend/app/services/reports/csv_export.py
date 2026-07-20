"""Multi-widget CSV export.

REPORTS_TASK §R7.1: one CSV with one section per widget, separated
by a blank line and a section header. UTF-8 with BOM so Excel
renders Czech diacritics. Each section calls the widget's existing
service and renders a small table appropriate to that widget's
shape.

Widgets that compute a single number (KPI tiles) get a header row +
one value row. Charts / lists render their items as rows.
"""

from __future__ import annotations

import io
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.csv_safety import SafeCsvWriter
from app.schemas.reports import (
    AvgDealSizeConfig,
    CompaniesAtRiskConfig,
    DealsWonConfig,
    LeadToDealConversionConfig,
    LostReasonsBreakdownConfig,
    NewCompaniesConfig,
    PipelineValueConfig,
    RepActivityConfig,
    SalesCycleLengthConfig,
    SalesForecastConfig,
    SalesLeaderboardConfig,
    StaleDealsConfig,
    WeightedPipelineConfig,
    WinRateConfig,
    WonVsPaidConfig,
)
from app.services.reports.avg_deal_size import compute_avg_deal_size
from app.services.reports.companies_at_risk import compute_companies_at_risk
from app.services.reports.deals_won import compute_deals_won
from app.services.reports.lead_to_deal_conversion import (
    compute_lead_to_deal_conversion,
)
from app.services.reports.lost_reasons_breakdown import (
    compute_lost_reasons_breakdown,
)
from app.services.reports.new_companies import compute_new_companies
from app.services.reports.pipeline_value import compute_pipeline_value
from app.services.reports.rep_activity import compute_rep_activity
from app.services.reports.sales_cycle_length import compute_sales_cycle_length
from app.services.reports.sales_forecast import compute_sales_forecast
from app.services.reports.sales_leaderboard import compute_sales_leaderboard
from app.services.reports.stale_deals import compute_stale_deals
from app.services.reports.weighted_pipeline import compute_weighted_pipeline
from app.services.reports.win_rate import compute_win_rate
from app.services.reports.won_vs_paid import compute_won_vs_paid

WIDGET_LABEL = {
    "pipeline_value": "Hodnota pipeline",
    "weighted_pipeline": "Vážená hodnota pipeline",
    "sales_forecast": "Odhad prodeje",
    "won_vs_paid": "Vyhráno vs. zaplaceno",
    "new_companies": "Nové firmy",
    "deals_won": "Vyhrané obchody",
    "win_rate": "Úspěšnost",
    "avg_deal_size": "Průměrná velikost obchodu",
    "sales_cycle_length": "Délka prodejního cyklu",
    "lead_to_deal_conversion": "Konverze lead → obchod",
    "lost_reasons_breakdown": "Důvody prohraných obchodů",
    "sales_leaderboard": "Žebříček obchodníků",
    "rep_activity": "Aktivita obchodníků",
    "stale_deals": "Stagnující obchody",
    "companies_at_risk": "Firmy ohrožené uvolněním",
}


def _fmt(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return f"{value:.2f}"
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value)


async def render_widget_csv(
    session: AsyncSession,
    *,
    organization_id: UUID,
    widgets: list[dict[str, Any]],
    from_: date,
    to: date,
    team_id: UUID | None,
    owner_user_id: UUID | None,
) -> bytes:
    """Build the multi-section CSV. UTF-8 with BOM."""
    buffer = io.StringIO()
    writer = SafeCsvWriter(buffer)

    common = {
        "session": session,
        "organization_id": organization_id,
        "from_": from_,
        "to": to,
        "team_id": team_id,
        "owner_user_id": owner_user_id,
    }

    for i, widget in enumerate(widgets):
        widget_type = widget.get("type", "")
        raw_config = widget.get("config", {}) or {}
        # Spread separator between sections.
        if i > 0:
            writer.writerow([])

        label = WIDGET_LABEL.get(widget_type, widget_type)
        writer.writerow([f"# {label}"])

        try:
            await _render_section(writer, widget_type, raw_config, common)
        except Exception as exc:
            writer.writerow(["chyba", str(exc)])

    body = "﻿" + buffer.getvalue()
    return body.encode("utf-8")


async def _render_section(
    writer: Any,
    widget_type: str,
    raw_config: dict[str, Any],
    common: dict[str, Any],
) -> None:
    # Each branch binds `cfg` and `r` to a different concrete config/response
    # pair; declaring them `Any` here keeps mypy from anchoring them to the
    # first branch's types and complaining about every subsequent reassignment.
    cfg: Any
    r: Any
    if widget_type == "pipeline_value":
        cfg = PipelineValueConfig(**raw_config)
        r = await compute_pipeline_value(**common, config=cfg)
        writer.writerow(["hodnota", "měna", "delta_pct"])
        writer.writerow(
            [
                _fmt(r.value),
                r.currency,
                _fmt(r.comparison.delta_pct) if r.comparison else "",
            ]
        )

    elif widget_type == "weighted_pipeline":
        cfg = WeightedPipelineConfig(**raw_config)
        r = await compute_weighted_pipeline(**common, config=cfg)
        writer.writerow(["vážená_hodnota", "hodnota", "měna", "delta_pct"])
        writer.writerow(
            [
                _fmt(r.value),
                _fmt(r.open_value),
                r.currency,
                _fmt(r.comparison.delta_pct) if r.comparison else "",
            ]
        )

    elif widget_type == "sales_forecast":
        cfg = SalesForecastConfig(**raw_config)
        r = await compute_sales_forecast(**common, config=cfg)
        bucket_label = {"overdue": "po_termínu", "later": "později", "no_date": "bez_termínu"}
        writer.writerow(["období", "počet", "hodnota", "vážená_hodnota"])
        for bucket in r.buckets:
            writer.writerow(
                [
                    bucket.year_month or bucket_label[bucket.kind],
                    bucket.count,
                    _fmt(bucket.value),
                    _fmt(bucket.weighted_value),
                ]
            )
        writer.writerow(["celkem", "", _fmt(r.total_value), _fmt(r.total_weighted_value)])

    elif widget_type == "won_vs_paid":
        cfg = WonVsPaidConfig(**raw_config)
        r = await compute_won_vs_paid(**common, config=cfg)
        writer.writerow(
            [
                "vyhráno_počet",
                "zaplaceno_počet",
                "vyhráno_hodnota",
                "zaplaceno_hodnota",
                "nezaplaceno_hodnota",
                "zaplaceno_%",
                "měna",
            ]
        )
        writer.writerow(
            [
                r.won_count,
                r.paid_count,
                _fmt(r.won_value),
                _fmt(r.paid_value),
                _fmt(r.unpaid_value),
                _fmt(r.paid_pct),
                r.currency,
            ]
        )

    elif widget_type == "deals_won":
        cfg = DealsWonConfig(**raw_config)
        r = await compute_deals_won(**common, config=cfg)
        writer.writerow(["počet", "hodnota", "měna", "delta_pct"])
        writer.writerow(
            [
                r.count,
                _fmt(r.value),
                r.currency,
                _fmt(r.comparison.delta_pct) if r.comparison else "",
            ]
        )

    elif widget_type == "win_rate":
        r = await compute_win_rate(**common, config=WinRateConfig())
        writer.writerow(["úspěšnost_%", "vyhrané", "prohrané"])
        writer.writerow([_fmt(r.value), r.won_count, r.lost_count])

    elif widget_type == "avg_deal_size":
        cfg = AvgDealSizeConfig(**raw_config)
        r = await compute_avg_deal_size(**common, config=cfg)
        writer.writerow(["průměr", "měna", "počet_vzorek"])
        writer.writerow([_fmt(r.value), r.currency, r.sample_count])

    elif widget_type == "sales_cycle_length":
        cfg = SalesCycleLengthConfig(**raw_config)
        r = await compute_sales_cycle_length(**common, config=cfg)
        writer.writerow(["medián_dní", "průměr_dní", "počet_vzorek"])
        writer.writerow([_fmt(r.median_days), _fmt(r.mean_days), r.sample_count])

    elif widget_type == "lead_to_deal_conversion":
        cfg = LeadToDealConversionConfig(**raw_config)
        r = await compute_lead_to_deal_conversion(**common, config=cfg)
        writer.writerow(["konverze_%", "konvertováno", "celkem"])
        writer.writerow([_fmt(r.value), r.converted_count, r.total_count])

    elif widget_type == "new_companies":
        cfg = NewCompaniesConfig(**raw_config)
        r = await compute_new_companies(**common, config=cfg)
        writer.writerow(["počet"])
        writer.writerow([r.value])

    elif widget_type == "lost_reasons_breakdown":
        cfg = LostReasonsBreakdownConfig(**raw_config)
        r = await compute_lost_reasons_breakdown(**common, config=cfg)
        writer.writerow(["důvod", "počet", "hodnota"])
        for item in r.items:
            writer.writerow([item.reason, item.count, _fmt(item.value)])

    elif widget_type == "sales_leaderboard":
        cfg = SalesLeaderboardConfig(**raw_config)
        r = await compute_sales_leaderboard(**common, config=cfg)
        writer.writerow(["pořadí", "obchodník", f"hodnota_{r.metric}"])
        for i, item in enumerate(r.items, start=1):
            writer.writerow([i, item.name, _fmt(item.metric_value)])

    elif widget_type == "rep_activity":
        r = await compute_rep_activity(**common, config=RepActivityConfig())
        writer.writerow(["pořadí", "obchodník", "přidaných_obchodů"])
        for i, item in enumerate(r.items, start=1):
            writer.writerow([i, item.name, item.deals_added])

    elif widget_type == "stale_deals":
        cfg = StaleDealsConfig(**raw_config)
        r = await compute_stale_deals(**common, config=cfg)
        writer.writerow(
            [
                "obchod",
                "firma",
                "fáze",
                "hodnota",
                "měna",
                "obchodník",
                "dní_bez_pohybu",
            ]
        )
        for item in r.items:
            writer.writerow(
                [
                    item.deal_name,
                    item.company_name,
                    item.stage_name,
                    _fmt(item.value),
                    item.currency,
                    item.owner_name,
                    item.days_since_change,
                ]
            )

    elif widget_type == "companies_at_risk":
        cfg = CompaniesAtRiskConfig(**raw_config)
        r = await compute_companies_at_risk(**common, config=cfg)
        writer.writerow(["firma", "obchodník", "zbývá_dní", "poslední_aktivita"])
        for item in r.items:
            writer.writerow(
                [
                    item.company_name,
                    item.owner_name,
                    item.days_until_freeing,
                    item.last_activity_at.isoformat() if item.last_activity_at else "",
                ]
            )

    else:
        writer.writerow(["chyba", f"neznámý typ widgetu: {widget_type}"])
