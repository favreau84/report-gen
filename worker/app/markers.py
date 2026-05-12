from __future__ import annotations

import re
from dataclasses import dataclass

import fitz  # PyMuPDF


MARKER_PATTERN = re.compile(r"@@(pdf|pdfdir|annex)(?::([\w\-\.]+))?")


@dataclass
class MarkerHit:
    kind: str  # 'pdf' | 'pdfdir' | 'annex'
    slot: str | None
    page_index: int  # 0-based
    bbox: fitz.Rect  # rectangle approximatif du marqueur dans la page source


def find_markers(doc: fitz.Document) -> list[MarkerHit]:
    """Localise les marqueurs `@@…` dans un PDF page par page.

    Pour chaque page, on appelle `page.search_for(...)` qui retourne les `Rect`
    pour un texte donné. On scanne d'abord le texte complet de la page avec
    une regex pour identifier les marqueurs présents, puis on demande leurs
    positions.

    Renvoie les marqueurs **dans l'ordre d'apparition** dans le document
    (par page croissante, puis par position verticale puis horizontale).
    """
    hits: list[MarkerHit] = []
    for page_index in range(doc.page_count):
        page = doc[page_index]
        text = page.get_text("text") or ""
        seen_on_page: set[tuple[str, str | None]] = set()
        for m in MARKER_PATTERN.finditer(text):
            kind = m.group(1)
            slot = m.group(2)
            key = (kind, slot)
            if key in seen_on_page:
                continue
            seen_on_page.add(key)
            literal = f"@@{kind}:{slot}" if slot else f"@@{kind}"
            rects = page.search_for(literal, quads=False) or []
            if not rects:
                # fallback : pleine page si introuvable (très rare)
                bbox = fitz.Rect(0, 0, page.rect.width, page.rect.height)
            else:
                bbox = rects[0]
            hits.append(MarkerHit(kind=kind, slot=slot, page_index=page_index, bbox=bbox))
    # ordre : page, puis y, puis x
    hits.sort(key=lambda h: (h.page_index, h.bbox.y0, h.bbox.x0))
    return hits
