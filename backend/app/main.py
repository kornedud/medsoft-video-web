from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import check_db_connection, get_db
from app.routers.auth import router as auth_router
from app.routers.rooms import router as rooms_router
from app.routers.ws_presence import router as ws_presence_router
from app.routers.ws_signaling import router as ws_signaling_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    await check_db_connection()
    yield


app = FastAPI(title="Teleconsultation API", version="0.1.0", lifespan=lifespan)

_origins = [o.strip() for o in settings.frontend_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(rooms_router)
app.include_router(ws_signaling_router)
app.include_router(ws_presence_router)


@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    await db.execute(text("SELECT 1"))
    return {"status": "ok"}

