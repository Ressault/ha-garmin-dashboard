"""
Code d'accès de l'interface.

Sans code défini (variable ACCESS_CODE vide), l'API reste ouverte : c'est le cas du PC, où elle
n'écoute que sur 127.0.0.1. Avec un code (option « access_code » de l'add-on Home Assistant), chaque
appareil le saisit une fois ; il reçoit un cookie valable un an, signé avec un secret propre à
l'installation. Changer le code déconnecte tous les appareils.
"""

import hashlib
import hmac
import os
import secrets
import time

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

import db

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE = "gd_session"
MAX_AGE = 365 * 24 * 3600
OPEN_PATHS = ("/api/health", "/api/auth/")  # joignables sans code (chien de garde, écran de saisie)

# Essais ratés par adresse : 8 essais par quart d'heure, puis refus
_FAILS: dict[str, list[float]] = {}
MAX_FAILS, FAIL_WINDOW = 8, 15 * 60


def access_code() -> str:
    return (os.getenv("ACCESS_CODE") or "").strip()


def _secret() -> str:
    with db.connect() as conn:
        s = db.get_setting(conn, "auth_secret")
        if not s:
            s = secrets.token_hex(32)
            db.set_setting(conn, "auth_secret", s)
            conn.commit()
    return s


def _token(code: str) -> str:
    return hmac.new(_secret().encode(), f"v1:{code}".encode(), hashlib.sha256).hexdigest()


def is_authorized(request: Request) -> bool:
    code = access_code()
    if not code:
        return True
    got = request.cookies.get(COOKIE) or ""
    return bool(got) and hmac.compare_digest(got, _token(code))


def needs_auth(path: str) -> bool:
    return path.startswith("/api/") and not any(path == p or path.startswith(p) for p in OPEN_PATHS)


def _client(request: Request) -> str:
    return (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()


class LoginIn(BaseModel):
    code: str


@router.get("/status")
def status(request: Request) -> dict:
    return {"required": bool(access_code()), "ok": is_authorized(request)}


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response) -> dict:
    code = access_code()
    if not code:
        return {"ok": True, "required": False}
    who, now = _client(request), time.time()
    fails = [t for t in _FAILS.get(who, []) if now - t < FAIL_WINDOW]
    if len(fails) >= MAX_FAILS:
        raise HTTPException(429, "Trop d'essais. Réessaie dans un quart d'heure.")
    if not hmac.compare_digest(body.code.strip().encode(), code.encode()):
        fails.append(now)
        _FAILS[who] = fails
        time.sleep(0.6)
        raise HTTPException(401, "Code incorrect.")
    _FAILS.pop(who, None)
    secure = (request.headers.get("x-forwarded-proto") or request.url.scheme) == "https"
    response.set_cookie(COOKIE, _token(code), max_age=MAX_AGE, httponly=True, samesite="lax", secure=secure, path="/")
    return {"ok": True, "required": True}


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}
