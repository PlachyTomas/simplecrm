from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.db.models.enums import StageType
from app.schemas.deal import DealOut


class StageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pipeline_id: uuid.UUID
    name: str
    default_probability: int
    color: str
    position: int
    stage_type: StageType


class BoardStage(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    position: int
    stage_type: StageType
    default_probability: int
    deal_count: int
    total_value: Decimal
    currency: str
    deals: list[DealOut]


class PipelineBoard(BaseModel):
    id: uuid.UUID
    name: str
    is_default: bool
    currency: str
    stages: list[BoardStage]


class PipelineSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    is_default: bool
    stages: list[StageOut]
