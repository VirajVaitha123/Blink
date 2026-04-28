"""FastAPI application entry point."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from blink_shared.config import settings
from blink_shared.database import async_engine

from routers import health


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events."""
    yield
    await async_engine.dispose()


app = FastAPI(
    title="Blink API",
    description="Backend for Blink - blink-driven AAC with live observer mode",
    version="0.1.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

# CORS: localhost in development, deployed frontend URL in production.
allow_origins: list[str] = []
if settings.environment == "development":
    allow_origins = ["http://localhost:3000", "http://localhost:3001"]
if settings.frontend_url:
    allow_origins.append(settings.frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(health.router, prefix="/api/v1/health")


@app.get("/", tags=["Root"])
async def root():
    return {
        "service": "Blink API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/api/v1/health",
    }
