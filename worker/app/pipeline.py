from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
from docxtpl import DocxTemplate

from . import storage
from .annex import (
    AnnexItem,
    create_blank_annex_pages,
    estimate_annex_pages,
    render_annex,
)
from .config import settings
from .prefix_render import render_with_prefix
from .markers import MarkerHit, find_markers


log = logging.getLogger("pipeline")


@dataclass
class GenerationInput:
    owner_id: str
    report_id: str
    generation_id: str
    docx_path: str  # Storage path in bucket "templates"
    json_payload: dict[str, Any]
    # mapping slot -> bucket path
    pdf_slots: dict[str, str]      # @@pdf:<slot>  → storage path "inputs/..."
    pdfdir_slots: dict[str, str]   # @@pdfdir:<slot> → folder prefix "inputs/..."
    convention: str = "jinja"      # "jinja" | "li_prefix"
    tag_prefix: str = "li_"        # utilisé uniquement si convention == "li_prefix"


@dataclass
class GenerationResult:
    output_path: str  # storage path in bucket "outputs"


# =========================
# Public entry point
# =========================
def run(input: GenerationInput) -> GenerationResult:
    """Pipeline complet — renvoie le chemin du PDF final dans le bucket `outputs`."""
    with tempfile.TemporaryDirectory(prefix="reportgen_") as tmp:
        tmpdir = Path(tmp)
        # 1. Templating
        rendered_docx = _render_docx(tmpdir, input)
        # 2. docx → PDF
        body_pdf = _docx_to_pdf(tmpdir, rendered_docx)
        # 3. Open body, find markers
        body_doc = fitz.open(body_pdf)
        try:
            hits = find_markers(body_doc)
            log.info("markers found: %s", [(h.kind, h.slot, h.page_index) for h in hits])
            # 4-6. Assemble final doc + compute offsets
            final_doc, annex_items, annex_page_indices = _assemble(
                body_doc=body_doc,
                hits=hits,
                input=input,
                tmpdir=tmpdir,
            )
            # 7. Render annex pages content
            render_annex(final_doc, annex_page_indices, annex_items)
            # 8. Global pagination
            _paginate(final_doc)
            # 9. Save + upload
            out_path = tmpdir / "output.pdf"
            final_doc.save(out_path.as_posix(), deflate=True, garbage=4)
        finally:
            body_doc.close()

        output_storage_path = f"{input.owner_id}/{input.generation_id}.pdf"
        with open(out_path, "rb") as f:
            storage.upload("outputs", output_storage_path, f.read(), "application/pdf")
        return GenerationResult(output_path=output_storage_path)


# =========================
# Step 1: docx rendering
# =========================
def _render_docx(tmpdir: Path, input: GenerationInput) -> Path:
    raw = storage.download("templates", input.docx_path)
    src = tmpdir / "template.docx"
    src.write_bytes(raw)
    out = tmpdir / "rendered.docx"

    if input.convention == "li_prefix":
        render_with_prefix(src, out, input.json_payload or {}, prefix=input.tag_prefix)
    else:
        tpl = DocxTemplate(src.as_posix())
        # Le rendu Jinja substitue {{ x }} et {% for %}.
        # Les marqueurs @@... restent du texte littéral car ils n'utilisent pas la syntaxe Jinja.
        tpl.render(input.json_payload or {})
        tpl.save(out.as_posix())
    return out


# =========================
# Step 2: docx → pdf via LibreOffice headless
# =========================
def docx_bytes_to_pdf_bytes(docx_bytes: bytes) -> bytes:
    """Convertit un .docx (bytes) en PDF (bytes) via LibreOffice headless.

    Utile pour la génération du rapport ET pour produire un aperçu cacheable.
    """
    with tempfile.TemporaryDirectory(prefix="reportgen_") as tmp:
        tmpdir = Path(tmp)
        src = tmpdir / "in.docx"
        src.write_bytes(docx_bytes)
        out = _docx_to_pdf(tmpdir, src)
        return out.read_bytes()


def _docx_to_pdf(tmpdir: Path, docx: Path) -> Path:
    outdir = tmpdir / "lo_out"
    outdir.mkdir()
    # Profile temporaire pour éviter conflits si LibreOffice est déjà ouvert sur le poste
    profile = tmpdir / "lo_profile"
    profile.mkdir()
    env = os.environ.copy()
    cmd = [
        settings.soffice_bin,
        "--headless",
        "--nologo",
        "--nodefault",
        "--nofirststartwizard",
        "--norestore",
        f"-env:UserInstallation=file://{profile.as_posix()}",
        "--convert-to",
        "pdf",
        "--outdir",
        outdir.as_posix(),
        docx.as_posix(),
    ]
    log.info("running soffice: %s", " ".join(cmd))
    res = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=120)
    if res.returncode != 0:
        raise RuntimeError(f"LibreOffice convert failed: {res.stderr or res.stdout}")
    candidates = list(outdir.glob("*.pdf"))
    if not candidates:
        raise RuntimeError("LibreOffice did not produce a PDF.")
    return candidates[0]


# =========================
# Steps 3-6: assembly
# =========================
def _assemble(
    body_doc: fitz.Document,
    hits: list[MarkerHit],
    input: GenerationInput,
    tmpdir: Path,
) -> tuple[fitz.Document, list[AnnexItem], list[int]]:
    """Construit le PDF final en intercalant les PDFs externes aux marqueurs et en réservant
    les pages d'annexe. Retourne le doc final, la liste des items d'annexe (avec page_start
    en absolu) et les indices des pages réservées pour l'annexe.
    """
    final = fitz.open()

    # On garde la trace des PDFs externes insérés pour construire les items d'annexe
    annex_items: list[AnnexItem] = []
    annex_hit: MarkerHit | None = None
    pdf_inserts: list[tuple[MarkerHit, list[tuple[str, Path]]]] = []
    # Pour chaque hit pdf/pdfdir on charge tous ses PDFs externes dans le tmpdir une fois
    for h in hits:
        if h.kind == "pdf" and h.slot:
            sp = input.pdf_slots.get(h.slot)
            if not sp:
                raise RuntimeError(f"Aucune source PDF fournie pour le slot '{h.slot}'.")
            local = tmpdir / f"pdf_{uuid.uuid4().hex}.pdf"
            local.write_bytes(storage.download("inputs", sp))
            pdf_inserts.append((h, [(h.slot, local)]))
        elif h.kind == "pdfdir" and h.slot:
            prefix = input.pdfdir_slots.get(h.slot)
            if not prefix:
                raise RuntimeError(f"Aucun dossier PDF fourni pour le slot '{h.slot}'.")
            names = storage.list_folder("inputs", prefix)
            files: list[tuple[str, Path]] = []
            for name in names:
                if not name.lower().endswith(".pdf"):
                    continue
                local = tmpdir / f"pdfdir_{uuid.uuid4().hex}_{name}"
                local.write_bytes(storage.download("inputs", f"{prefix}/{name}"))
                files.append((name, local))
            if not files:
                raise RuntimeError(f"Le dossier '{h.slot}' ne contient aucun PDF.")
            pdf_inserts.append((h, files))
        elif h.kind == "annex":
            annex_hit = h

    # Construction par segments : pages du body entre les marqueurs, puis insertion des PDFs.
    # Les pages contenant un marqueur sont incluses dans le segment précédent (le marqueur
    # reste visible — c'est acceptable au MVP ; idéalement on supprimerait la ligne).
    # On découpe le body en segments [start, end] (inclusifs) par page de marqueur.
    body_total = body_doc.page_count
    # Liste des coupures (page_index): chaque marqueur pdf/pdfdir produit un split APRÈS sa page.
    insert_after_page: dict[int, list[tuple[MarkerHit, list[tuple[str, Path]]]]] = {}
    for h, files in pdf_inserts:
        insert_after_page.setdefault(h.page_index, []).append((h, files))

    # Place annex marker : on insère ses pages blanches au moment où on rencontre sa page.
    annex_after_page: int | None = annex_hit.page_index if annex_hit else None
    # Si pas de @@annex, on insère l'annexe à la toute fin.
    annex_items_pending: list[AnnexItem] = []  # collectés au fur et à mesure

    annex_page_indices: list[int] = []
    annex_pages_count = estimate_annex_pages(_count_annex_items(pdf_inserts))

    # On itère sur les pages du body, en insérant les PDFs après chaque page concernée
    cursor = 0
    while cursor < body_total:
        # On copie une page du body
        final.insert_pdf(body_doc, from_page=cursor, to_page=cursor)
        # insertions après cette page
        for h, files in insert_after_page.get(cursor, []):
            for label, path in files:
                with fitz.open(path.as_posix()) as ext:
                    page_start = final.page_count
                    final.insert_pdf(ext, from_page=0, to_page=ext.page_count - 1)
                    annex_items_pending.append(AnnexItem(label=label, page_start=page_start))
        # annex placeholder
        if annex_after_page is not None and cursor == annex_after_page:
            annex_page_indices = create_blank_annex_pages(final, annex_pages_count)
        cursor += 1

    if annex_after_page is None:
        annex_page_indices = create_blank_annex_pages(final, annex_pages_count)

    return final, annex_items_pending, annex_page_indices


def _count_annex_items(pdf_inserts: list[tuple[MarkerHit, list[tuple[str, Path]]]]) -> int:
    return sum(len(files) for _, files in pdf_inserts)


# =========================
# Step 8: pagination
# =========================
def _paginate(doc: fitz.Document) -> None:
    """Ajoute 'Page X / N' en pied de page sur toutes les pages."""
    total = doc.page_count
    for i in range(total):
        page = doc[i]
        text = f"Page {i + 1} / {total}"
        font = "helv"
        size = 9.0
        width = fitz.get_text_length(text, fontname=font, fontsize=size)
        x = (page.rect.width - width) / 2
        y = page.rect.height - 24
        # rectangle blanc derrière pour rester lisible si une page externe a un fond
        bg = fitz.Rect(x - 4, y - size, x + width + 4, y + 4)
        page.draw_rect(bg, color=None, fill=(1, 1, 1), overlay=True)
        page.insert_text(
            fitz.Point(x, y),
            text,
            fontname=font,
            fontsize=size,
            color=(0.42, 0.45, 0.50),
        )


# =========================
# Utilities
# =========================
def soffice_available() -> bool:
    return shutil.which(settings.soffice_bin) is not None
