from __future__ import annotations

import logging
import traceback
from datetime import datetime, timezone
from typing import Any

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .auth import AuthUser, verify_bearer
from .config import settings
from .parse_docx import build_preview, parse_placeholders, suggest_prefixes
from .pipeline import GenerationInput, docx_bytes_to_pdf_bytes, run, soffice_available
from .storage import download, get_supabase


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("server")

app = FastAPI(title="Report Generator Worker", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# Models
# =========================
class ParseRequest(BaseModel):
    report_id: str


class PlaceholderOut(BaseModel):
    key: str
    type: str
    required: bool
    section: str = ""
    context: str = ""
    position: int = 0


class ParseResponse(BaseModel):
    placeholders: list[PlaceholderOut]
    suggested_prefixes: list[str] = []


class GenerateRequest(BaseModel):
    report_id: str


class GenerateResponse(BaseModel):
    generation_id: str


class PreviewRequest(BaseModel):
    report_id: str


class PreviewTagOut(BaseModel):
    start: int
    end: int
    key: str
    type: str


class PreviewParagraphOut(BaseModel):
    index: int
    text: str
    style: str | None = None
    heading_level: int | None = None
    section_path: str = ""
    tags: list[PreviewTagOut] = []


class PreviewResponse(BaseModel):
    paragraphs: list[PreviewParagraphOut]


class PreviewPdfRequest(BaseModel):
    report_id: str
    force: bool = False


class PreviewPdfResponse(BaseModel):
    path: str
    signed_url: str
    regenerated: bool


class TemplatePreviewPdfRequest(BaseModel):
    template_id: str
    force: bool = False


# =========================
# Helpers
# =========================
def _own_report(report_id: str, user: AuthUser) -> dict[str, Any]:
    sb = get_supabase()
    res = (
        sb.table("reports")
        .select("*")
        .eq("id", report_id)
        .eq("owner_id", user.id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Report not found")
    return res.data


def _own_template(template_id: str, user: AuthUser) -> dict[str, Any]:
    sb = get_supabase()
    res = (
        sb.table("templates")
        .select("*")
        .eq("id", template_id)
        .eq("owner_id", user.id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Template not found")
    return res.data


# =========================
# Routes
# =========================
@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "soffice_available": soffice_available(),
        "now": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/parse", response_model=ParseResponse)
def parse(req: ParseRequest, user: AuthUser = Depends(verify_bearer)) -> ParseResponse:
    report = _own_report(req.report_id, user)
    docx_path = report.get("docx_path")
    if not docx_path:
        raise HTTPException(status_code=400, detail="No docx uploaded for this report")
    convention = report.get("tag_convention") or "jinja"
    tag_prefix = report.get("tag_prefix") or "li_"
    raw = download("templates", docx_path)
    items = parse_placeholders(raw, convention=convention, prefix=tag_prefix)
    suggestions = suggest_prefixes(raw)
    return ParseResponse(
        placeholders=[
            PlaceholderOut(
                key=p.key,
                type=p.type,
                required=p.required,
                section=p.section,
                context=p.context,
                position=p.position,
            )
            for p in items
        ],
        suggested_prefixes=suggestions,
    )


@app.post("/preview", response_model=PreviewResponse)
def preview(req: PreviewRequest, user: AuthUser = Depends(verify_bearer)) -> PreviewResponse:
    report = _own_report(req.report_id, user)
    docx_path = report.get("docx_path")
    if not docx_path:
        raise HTTPException(status_code=400, detail="No docx uploaded for this report")
    convention = report.get("tag_convention") or "jinja"
    tag_prefix = report.get("tag_prefix") or "li_"
    raw = download("templates", docx_path)
    paragraphs = build_preview(raw, convention=convention, prefix=tag_prefix)
    return PreviewResponse(
        paragraphs=[
            PreviewParagraphOut(
                index=p.index,
                text=p.text,
                style=p.style,
                heading_level=p.heading_level,
                section_path=p.section_path,
                tags=[
                    PreviewTagOut(start=t.start, end=t.end, key=t.key, type=t.type)
                    for t in p.tags
                ],
            )
            for p in paragraphs
        ]
    )


@app.post("/preview-pdf", response_model=PreviewPdfResponse)
def preview_pdf(
    req: PreviewPdfRequest, user: AuthUser = Depends(verify_bearer)
) -> PreviewPdfResponse:
    if not soffice_available():
        raise HTTPException(
            status_code=503,
            detail="LibreOffice n'est pas installé sur le worker — impossible de générer l'aperçu PDF.",
        )

    report = _own_report(req.report_id, user)
    docx_path = report.get("docx_path")
    if not docx_path:
        raise HTTPException(status_code=400, detail="No docx uploaded for this report")

    preview_path = f"{user.id}/{req.report_id}.pdf"
    sb = get_supabase()

    regenerate = bool(req.force)
    if not regenerate:
        regenerate = _preview_is_stale(user.id, req.report_id, docx_path)

    if regenerate:
        raw = download("templates", docx_path)
        pdf_bytes = docx_bytes_to_pdf_bytes(raw)
        sb.storage.from_("previews").upload(
            preview_path,
            pdf_bytes,
            file_options={"content-type": "application/pdf", "upsert": "true"},
        )

    signed = sb.storage.from_("previews").create_signed_url(preview_path, 3600)
    signed_url = signed.get("signedURL") or signed.get("signed_url") or ""
    return PreviewPdfResponse(
        path=preview_path, signed_url=signed_url, regenerated=regenerate
    )


@app.post("/template-preview-pdf", response_model=PreviewPdfResponse)
def template_preview_pdf(
    req: TemplatePreviewPdfRequest, user: AuthUser = Depends(verify_bearer)
) -> PreviewPdfResponse:
    """Convertit le DOCX d'un template en PDF (sans rendu des données) pour
    l'aperçu du workspace. Régénère à chaque appel : le bouton côté UI est un
    relancement explicite du traitement."""
    if not soffice_available():
        raise HTTPException(
            status_code=503,
            detail="LibreOffice n'est pas installé sur le worker — impossible de générer l'aperçu PDF.",
        )

    tpl = _own_template(req.template_id, user)
    docx_path = tpl.get("docx_path")
    if not docx_path:
        raise HTTPException(status_code=400, detail="No docx uploaded for this template")

    preview_path = f"{user.id}/tpl-{req.template_id}.pdf"
    sb = get_supabase()
    raw = download("templates", docx_path)
    pdf_bytes = docx_bytes_to_pdf_bytes(raw)
    sb.storage.from_("previews").upload(
        preview_path,
        pdf_bytes,
        file_options={"content-type": "application/pdf", "upsert": "true"},
    )
    signed = sb.storage.from_("previews").create_signed_url(preview_path, 3600)
    signed_url = signed.get("signedURL") or signed.get("signed_url") or ""
    return PreviewPdfResponse(path=preview_path, signed_url=signed_url, regenerated=True)


def _preview_is_stale(owner_id: str, report_id: str, docx_path: str) -> bool:
    """Vrai si l'aperçu cacheé n'existe pas ou est plus ancien que la source."""
    sb = get_supabase()

    # docx metadata
    folder = "/".join(docx_path.split("/")[:-1])
    name = docx_path.split("/")[-1]
    try:
        docx_listing = sb.storage.from_("templates").list(folder)
    except Exception:
        return True
    docx_meta = next((f for f in (docx_listing or []) if f.get("name") == name), None)
    if not docx_meta:
        return True
    docx_ts = docx_meta.get("updated_at") or docx_meta.get("created_at") or ""

    # preview metadata
    try:
        preview_listing = sb.storage.from_("previews").list(owner_id)
    except Exception:
        return True
    preview_name = f"{report_id}.pdf"
    preview_meta = next(
        (f for f in (preview_listing or []) if f.get("name") == preview_name), None
    )
    if not preview_meta:
        return True
    preview_ts = preview_meta.get("updated_at") or preview_meta.get("created_at") or ""

    return preview_ts < docx_ts


@app.post("/generate", response_model=GenerateResponse)
def generate(
    req: GenerateRequest,
    bg: BackgroundTasks,
    user: AuthUser = Depends(verify_bearer),
) -> GenerateResponse:
    report = _own_report(req.report_id, user)
    docx_path = report.get("docx_path")
    if not docx_path:
        raise HTTPException(status_code=400, detail="No docx uploaded for this report")

    sb = get_supabase()
    # Récupération du JSON + des slots
    ds_rows = (
        sb.table("datasources").select("*").eq("report_id", req.report_id).execute().data or []
    )
    json_payload: dict[str, Any] = {}
    pdf_slots: dict[str, str] = {}
    pdfdir_slots: dict[str, str] = {}
    for ds in ds_rows:
        if ds["kind"] == "json":
            json_payload = ds.get("json_payload") or {}
        elif ds["kind"] == "pdf" and ds.get("storage_path"):
            pdf_slots[ds["key"]] = ds["storage_path"]
        elif ds["kind"] == "pdfdir" and ds.get("storage_path"):
            pdfdir_slots[ds["key"]] = ds["storage_path"]

    # Création de la génération en DB
    gen_res = (
        sb.table("generations")
        .insert(
            {
                "report_id": req.report_id,
                "owner_id": user.id,
                "status": "pending",
            }
        )
        .execute()
    )
    if not gen_res.data:
        raise HTTPException(status_code=500, detail="Failed to create generation")
    generation_id = gen_res.data[0]["id"]

    sb.table("reports").update({"status": "generating"}).eq("id", req.report_id).execute()

    bg.add_task(
        _run_generation_bg,
        GenerationInput(
            owner_id=user.id,
            report_id=req.report_id,
            generation_id=generation_id,
            docx_path=docx_path,
            json_payload=json_payload,
            pdf_slots=pdf_slots,
            pdfdir_slots=pdfdir_slots,
            convention=report.get("tag_convention") or "jinja",
            tag_prefix=report.get("tag_prefix") or "li_",
        ),
    )

    return GenerateResponse(generation_id=generation_id)


def _run_generation_bg(input: GenerationInput) -> None:
    sb = get_supabase()
    sb.table("generations").update({"status": "running"}).eq("id", input.generation_id).execute()
    try:
        result = run(input)
        sb.table("generations").update(
            {
                "status": "done",
                "output_path": result.output_path,
                "finished_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", input.generation_id).execute()
        sb.table("reports").update({"status": "done"}).eq("id", input.report_id).execute()
    except Exception as e:  # noqa: BLE001
        log.error("generation failed: %s\n%s", e, traceback.format_exc())
        sb.table("generations").update(
            {
                "status": "failed",
                "error": str(e),
                "finished_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", input.generation_id).execute()
        sb.table("reports").update({"status": "failed"}).eq("id", input.report_id).execute()
