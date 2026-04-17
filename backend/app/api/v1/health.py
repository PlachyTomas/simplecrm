from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db

router = APIRouter()


class HealthResponse(BaseModel):
    status: str


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/healthz/db", response_model=HealthResponse)
async def healthz_db(session: AsyncSession = Depends(get_db)) -> HealthResponse:
    try:
        result = await session.execute(text("SELECT 1"))
        if result.scalar() != 1:
            raise RuntimeError("unexpected SELECT 1 result")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="database unreachable",
        ) from exc
    return HealthResponse(status="ok")
