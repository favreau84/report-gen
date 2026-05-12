from __future__ import annotations

from supabase import Client, create_client

from .config import settings


_client: Client | None = None


def get_supabase() -> Client:
    """Client Supabase avec secret key (RLS bypassée)."""
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_secret_key)
    return _client


def download(bucket: str, path: str) -> bytes:
    sb = get_supabase()
    return sb.storage.from_(bucket).download(path)


def upload(bucket: str, path: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    sb = get_supabase()
    sb.storage.from_(bucket).upload(
        path,
        data,
        file_options={"content-type": content_type, "upsert": "true"},
    )


def list_folder(bucket: str, prefix: str) -> list[str]:
    sb = get_supabase()
    rows = sb.storage.from_(bucket).list(prefix)
    return sorted(r["name"] for r in rows if not r["name"].startswith("."))
