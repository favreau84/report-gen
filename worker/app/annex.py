from __future__ import annotations

from dataclasses import dataclass

import fitz  # PyMuPDF


@dataclass
class AnnexItem:
    label: str
    page_start: int  # 0-based page absolute index in final doc


# Mise en page de l'annexe (A4 portrait)
PAGE_WIDTH = 595.0   # pt
PAGE_HEIGHT = 842.0  # pt
MARGIN_X = 56.0
MARGIN_TOP = 72.0
MARGIN_BOTTOM = 72.0
TITLE_FONT_SIZE = 18.0
ITEM_FONT_SIZE = 11.0
ITEM_HEIGHT = 22.0
TITLE_BLOCK_HEIGHT = 48.0  # titre + espace
FOOTER_RESERVE = 24.0      # zone réservée au footer "Page X / N"


def estimate_annex_pages(item_count: int) -> int:
    """Nombre de pages nécessaires pour l'annexe en fonction du nombre d'items."""
    if item_count <= 0:
        return 1  # une page "Aucune annexe" reste plus propre qu'une page vide
    usable_first = PAGE_HEIGHT - MARGIN_TOP - TITLE_BLOCK_HEIGHT - MARGIN_BOTTOM - FOOTER_RESERVE
    usable_next = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM - FOOTER_RESERVE
    items_first = max(1, int(usable_first // ITEM_HEIGHT))
    items_next = max(1, int(usable_next // ITEM_HEIGHT))
    if item_count <= items_first:
        return 1
    remaining = item_count - items_first
    return 1 + (remaining + items_next - 1) // items_next


def create_blank_annex_pages(doc: fitz.Document, count: int) -> list[int]:
    """Crée `count` pages blanches A4 à la fin de `doc`, renvoie leurs indices."""
    indices: list[int] = []
    for _ in range(count):
        page = doc.new_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)
        indices.append(page.number)
    return indices


def render_annex(
    doc: fitz.Document,
    page_indices: list[int],
    items: list[AnnexItem],
) -> None:
    """Dessine le contenu de l'annexe sur les pages réservées, avec liens cliquables.

    - Première page : titre "Annexes" + items.
    - Pages suivantes : items seulement.
    - Chaque item : texte cliquable "Label …………… page N", lien GoTo vers `page_start`.
    """
    if not page_indices:
        return

    cursor = 0  # index dans `items`
    for i, page_idx in enumerate(page_indices):
        page = doc[page_idx]
        y = MARGIN_TOP

        if i == 0:
            page.insert_text(
                fitz.Point(MARGIN_X, y + TITLE_FONT_SIZE),
                "Annexes",
                fontname="helv",
                fontsize=TITLE_FONT_SIZE,
                color=(0.12, 0.16, 0.22),
            )
            y += TITLE_BLOCK_HEIGHT

        # remplit la page tant qu'il reste de la place et des items
        while cursor < len(items) and y + ITEM_HEIGHT <= PAGE_HEIGHT - MARGIN_BOTTOM - FOOTER_RESERVE:
            item = items[cursor]
            _draw_annex_row(page, y, item)
            y += ITEM_HEIGHT
            cursor += 1

        if cursor >= len(items):
            break

    if not items:
        # Pas d'items : un message neutre
        page = doc[page_indices[0]]
        page.insert_text(
            fitz.Point(MARGIN_X, MARGIN_TOP + TITLE_BLOCK_HEIGHT + 20),
            "Aucune annexe.",
            fontname="helv",
            fontsize=ITEM_FONT_SIZE,
            color=(0.42, 0.45, 0.50),
        )


def _draw_annex_row(page: fitz.Page, y: float, item: AnnexItem) -> None:
    """Dessine une ligne d'annexe : label à gauche, n° de page à droite, lien sur toute la ligne."""
    page_number_text = f"Page {item.page_start + 1}"
    label = _truncate_label(item.label, max_chars=80)

    # Texte de gauche (label)
    page.insert_text(
        fitz.Point(MARGIN_X, y + ITEM_FONT_SIZE),
        label,
        fontname="helv",
        fontsize=ITEM_FONT_SIZE,
        color=(0.15, 0.40, 0.92),  # accent #2563EB
    )

    # Texte de droite (page X)
    pn_width = fitz.get_text_length(page_number_text, fontname="helv", fontsize=ITEM_FONT_SIZE)
    pn_x = PAGE_WIDTH - MARGIN_X - pn_width
    page.insert_text(
        fitz.Point(pn_x, y + ITEM_FONT_SIZE),
        page_number_text,
        fontname="helv",
        fontsize=ITEM_FONT_SIZE,
        color=(0.42, 0.45, 0.50),
    )

    # Pointillés au milieu
    label_width = fitz.get_text_length(label, fontname="helv", fontsize=ITEM_FONT_SIZE)
    dots_x_start = MARGIN_X + label_width + 6
    dots_x_end = pn_x - 6
    if dots_x_end > dots_x_start:
        dots_text = "." * max(3, int((dots_x_end - dots_x_start) / 3))
        page.insert_text(
            fitz.Point(dots_x_start, y + ITEM_FONT_SIZE),
            dots_text,
            fontname="helv",
            fontsize=ITEM_FONT_SIZE,
            color=(0.75, 0.78, 0.82),
        )

    # Rectangle cliquable sur toute la ligne → GoTo page cible
    link_rect = fitz.Rect(MARGIN_X - 2, y, PAGE_WIDTH - MARGIN_X + 2, y + ITEM_HEIGHT)
    page.insert_link(
        {
            "kind": fitz.LINK_GOTO,
            "from": link_rect,
            "page": item.page_start,
            "to": fitz.Point(0, 0),
        }
    )


def _truncate_label(s: str, max_chars: int) -> str:
    if len(s) <= max_chars:
        return s
    return s[: max_chars - 1] + "…"
