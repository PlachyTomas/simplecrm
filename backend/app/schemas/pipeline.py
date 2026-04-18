from __future__ import annotations

import re
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.db.models.enums import StageType
from app.schemas.deal import DealOut

_HEX_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


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


class StageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    default_probability: int = Field(ge=0, le=100, default=0)
    color: str = Field(default="#3D5AFE")
    stage_type: StageType = StageType.open

    @field_validator("color")
    @classmethod
    def _check_color(cls, value: str) -> str:
        if not _HEX_COLOR.match(value):
            raise ValueError("color must be a hex string like #RRGGBB")
        return value


class StageUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    default_probability: int | None = Field(default=None, ge=0, le=100)
    color: str | None = None
    stage_type: StageType | None = None

    @field_validator("color")
    @classmethod
    def _check_color(cls, value: str | None) -> str | None:
        if value is not None and not _HEX_COLOR.match(value):
            raise ValueError("color must be a hex string like #RRGGBB")
        return value


class StageReorder(BaseModel):
    stage_ids: list[uuid.UUID] = Field(min_length=1)
