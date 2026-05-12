from __future__ import annotations

import time
from typing import Any

import httpx
from fastapi import Header, HTTPException, status
from jose import JWTError, jwt
from pydantic import BaseModel

from .config import settings


class AuthUser(BaseModel):
    id: str
    email: str | None = None


_JWKS_TTL_SECONDS = 600  # 10 min
_jwks_cache: dict[str, Any] | None = None
_jwks_fetched_at: float = 0.0


def _jwks_url() -> str:
    return f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


def _fetch_jwks() -> dict[str, Any]:
    r = httpx.get(_jwks_url(), timeout=10.0)
    r.raise_for_status()
    return r.json()


def _get_jwks(force: bool = False) -> dict[str, Any]:
    global _jwks_cache, _jwks_fetched_at
    now = time.time()
    if force or _jwks_cache is None or (now - _jwks_fetched_at) > _JWKS_TTL_SECONDS:
        _jwks_cache = _fetch_jwks()
        _jwks_fetched_at = now
    return _jwks_cache


def _find_key(kid: str | None, jwks: dict[str, Any]) -> dict[str, Any] | None:
    if not kid:
        return None
    for k in jwks.get("keys", []):
        if k.get("kid") == kid:
            return k
    return None


def verify_bearer(authorization: str | None = Header(default=None)) -> AuthUser:
    """Vérifie un JWT Supabase.

    - Si `alg` du header est asymétrique (ES256/RS256/EdDSA), on vérifie via JWKS
      (cache 10 min, refresh à la demande sur kid inconnu).
    - Si `alg` est HS256, on tombe sur le secret partagé `SUPABASE_JWT_SECRET`
      (legacy). C'est optionnel et utilisé uniquement pendant la transition.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()

    try:
        header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token header: {e}"
        ) from e

    alg = header.get("alg") or ""
    kid = header.get("kid")

    if alg == "HS256":
        secret = settings.supabase_jwt_secret
        if not secret:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Legacy HS256 token but SUPABASE_JWT_SECRET not configured",
            )
        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience="authenticated",
                options={"verify_aud": True},
            )
        except JWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}"
            ) from e
    else:
        if not alg:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing alg in token header")
        jwks = _get_jwks()
        key = _find_key(kid, jwks)
        if key is None:
            jwks = _get_jwks(force=True)
            key = _find_key(kid, jwks)
        if key is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown JWT signing key")
        try:
            payload = jwt.decode(
                token,
                key,
                algorithms=[alg],
                audience="authenticated",
                options={"verify_aud": True},
            )
        except JWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}"
            ) from e

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has no subject")
    return AuthUser(id=user_id, email=payload.get("email"))
