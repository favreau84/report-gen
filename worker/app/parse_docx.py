from __future__ import annotations

import io
import re
import zipfile
from collections import Counter
from dataclasses import dataclass, field
from typing import Literal
from xml.etree import ElementTree as ET


NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

# --- Convention Jinja (par défaut) ---
JINJA_VAR_RE = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")
JINJA_FOR_RE = re.compile(r"\{%\s*for\s+\w+\s+in\s+([a-zA-Z_][\w\.]*)\s*%\}")

# --- Marqueurs PDF/annexe (communs aux deux conventions) ---
MARKER_RE = re.compile(r"@@(pdf|pdfdir|annex)(?::([\w\-\.]+))?")

# --- Suffixes de blocs reconnus en mode préfixé ---
BLOCK_SUFFIXES = ("DEBUT", "FIN", "start", "stop")
_BLOCK_SUFFIX_GROUP = "|".join(BLOCK_SUFFIXES)
BLOCK_SUFFIX_RE = re.compile(rf"(?i)({_BLOCK_SUFFIX_GROUP})$")

# Styles de paragraphe interprétés comme titres de section (FR + EN).
# Capture le niveau (1, 2, 3, …) en groupe 1.
HEADING_STYLE_RE = re.compile(r"^(?:Titre|Heading|Title|Heading\s)\s*(\d+)$", re.IGNORECASE)


TagConvention = Literal["jinja", "li_prefix"]


@dataclass(frozen=True)
class Placeholder:
    key: str
    type: str  # field | loop | block | pdf | pdfdir | annex
    required: bool = True
    section: str = ""        # fil d'Ariane "Titre1 › Titre2 › …"
    context: str = ""        # extrait du paragraphe d'origine avec la balise marquée
    position: int = 0        # ordre d'apparition dans le document


@dataclass
class DocParagraph:
    index: int
    text: str
    style: str | None
    heading_level: int | None = None  # 1, 2, 3, … si paragraphe-titre


@dataclass
class PreviewTag:
    start: int
    end: int
    key: str
    type: str  # field | loop | block | pdf | pdfdir | annex


@dataclass
class PreviewParagraph:
    index: int
    text: str
    style: str | None
    heading_level: int | None
    section_path: str
    tags: list[PreviewTag] = field(default_factory=list)


def extract_docx_text(docx_bytes: bytes) -> str:
    """Retourne le texte complet du document, paragraphes joints par \n."""
    return "\n".join(p.text for p in extract_docx_paragraphs(docx_bytes))


def extract_docx_paragraphs(docx_bytes: bytes) -> list[DocParagraph]:
    """Itère sur tous les paragraphes du document (y compris ceux dans des tables),
    en ordre de lecture. Le `style` est le nom brut Word (`Titre1`, `TM2`, etc.).
    """
    paragraphs: list[DocParagraph] = []
    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as z:
        with z.open("word/document.xml") as f:
            tree = ET.parse(f)
    root = tree.getroot()
    for i, para in enumerate(root.iter(f"{{{NS['w']}}}p")):
        text = "".join(t.text or "" for t in para.iter(f"{{{NS['w']}}}t"))
        style_el = para.find(f"{{{NS['w']}}}pPr/{{{NS['w']}}}pStyle")
        style = style_el.get(f"{{{NS['w']}}}val") if style_el is not None else None
        level: int | None = None
        if style:
            m = HEADING_STYLE_RE.match(style)
            if m:
                level = int(m.group(1))
        paragraphs.append(DocParagraph(index=i, text=text, style=style, heading_level=level))
    return paragraphs


def _compute_para_sections(paragraphs: list[DocParagraph]) -> dict[int, str]:
    """Pour chaque paragraphe, calcule le fil d'Ariane des titres en cours.

    Exemple : si on est dans 'Titre1 = "Les conclusions"' puis 'Titre2 = "Limites"',
    le résultat sera "Les conclusions › Limites".
    """
    section_path: list[tuple[int, str]] = []  # (level, text)
    out: dict[int, str] = {}
    for p in paragraphs:
        if p.heading_level is not None and p.text.strip():
            # Remplace les niveaux >= courant
            while section_path and section_path[-1][0] >= p.heading_level:
                section_path.pop()
            section_path.append((p.heading_level, p.text.strip()))
            # Le paragraphe-titre lui-même est rattaché à son propre fil
        out[p.index] = " › ".join(s[1] for s in section_path)
    return out


def _build_context(text: str, start: int, end: int, window: int = 60) -> str:
    """Construit l'extrait contextuel, balise mise entre « ... »."""
    text = text.strip()
    if not text:
        return ""
    # Ajuste start/end si on a strippé
    # On garde le texte brut et on reconstruit l'extrait depuis le texte original
    # (simplification : pas de strip ici, on travaille sur le texte original)
    if len(text) <= 220:
        return text[:start] + "«" + text[start:end] + "»" + text[end:]
    left = max(0, start - window)
    right = min(len(text), end + window)
    pe = "…" if left > 0 else ""
    se = "…" if right < len(text) else ""
    return pe + text[left:start] + "«" + text[start:end] + "»" + text[end:right] + se


def parse_placeholders(
    docx_bytes: bytes,
    convention: TagConvention = "jinja",
    prefix: str = "li_",
) -> list[Placeholder]:
    """Extrait la liste dédupliquée des balises, enrichies de section/contexte."""
    paragraphs = extract_docx_paragraphs(docx_bytes)
    para_section = _compute_para_sections(paragraphs)
    if convention == "li_prefix":
        return _parse_prefix(paragraphs, para_section, prefix)
    return _parse_jinja(paragraphs, para_section)


def build_preview(
    docx_bytes: bytes,
    convention: TagConvention = "jinja",
    prefix: str = "li_",
) -> list[PreviewParagraph]:
    """Construit la représentation paragraphe-par-paragraphe du document avec
    la position exacte de chaque balise dans chaque paragraphe.

    Utilisé par le frontend pour rendre un panneau de prévisualisation cliquable.
    """
    paragraphs = extract_docx_paragraphs(docx_bytes)
    para_section = _compute_para_sections(paragraphs)

    def collect(text: str) -> list[PreviewTag]:
        if not text:
            return []
        tags: list[PreviewTag] = []
        if convention == "li_prefix":
            tags.extend(_find_prefix_tags(text, prefix))
        else:
            tags.extend(_find_jinja_tags(text))
        tags.extend(_find_pdf_annex_tags(text))
        tags.sort(key=lambda t: t.start)
        return tags

    return [
        PreviewParagraph(
            index=p.index,
            text=p.text,
            style=p.style,
            heading_level=p.heading_level,
            section_path=para_section.get(p.index, ""),
            tags=collect(p.text),
        )
        for p in paragraphs
    ]


def _find_prefix_tags(text: str, prefix: str) -> list[PreviewTag]:
    prefix = (prefix or "").strip().lower()
    if not prefix:
        return []
    block_re, token_re = _build_prefix_regexes(prefix)
    skip_len = len(prefix)
    out: list[PreviewTag] = []
    block_spans: list[tuple[int, int]] = []
    for m in block_re.finditer(text):
        base = m.group(1).rstrip("_").lower()
        out.append(PreviewTag(start=m.start(), end=m.end(), key=base, type="block"))
        block_spans.append((m.start(), m.end()))
    chars = list(text)
    for s, e in block_spans:
        for i in range(s, e):
            chars[i] = " "
    masked = "".join(chars)
    for m in token_re.finditer(masked):
        tok = m.group(0)
        key = tok[skip_len:]
        if not key or BLOCK_SUFFIX_RE.search(key):
            continue
        out.append(PreviewTag(start=m.start(), end=m.end(), key=key.lower(), type="field"))
    return out


def _find_jinja_tags(text: str) -> list[PreviewTag]:
    out: list[PreviewTag] = []
    for m in JINJA_VAR_RE.finditer(text):
        raw = m.group(1).strip()
        if raw.startswith(("%", "#", "-")):
            continue
        if raw.startswith('"@@') or raw.startswith("'@@"):
            continue
        key = raw.split("|", 1)[0].split(" ", 1)[0].strip()
        if not key or not re.match(r"^[a-zA-Z_][\w\.]*$", key):
            continue
        out.append(PreviewTag(start=m.start(), end=m.end(), key=key, type="field"))
    for m in JINJA_FOR_RE.finditer(text):
        out.append(
            PreviewTag(start=m.start(), end=m.end(), key=m.group(1).strip(), type="loop")
        )
    return out


def _find_pdf_annex_tags(text: str) -> list[PreviewTag]:
    out: list[PreviewTag] = []
    for m in MARKER_RE.finditer(text):
        kind = m.group(1)
        slot = m.group(2)
        if kind == "annex":
            out.append(PreviewTag(start=m.start(), end=m.end(), key="annex", type="annex"))
        elif slot:
            out.append(PreviewTag(start=m.start(), end=m.end(), key=slot, type=kind))
    return out


def suggest_prefixes(docx_bytes: bytes, *, min_count: int = 3, top_n: int = 4) -> list[str]:
    """Détecte les préfixes récurrents `xx_` dans le document."""
    text = extract_docx_text(docx_bytes)
    counter: Counter[str] = Counter()
    for m in re.finditer(r"\b([a-zA-Z]{1,5})_[a-zA-Z][\w]+", text):
        p = m.group(1).lower() + "_"
        if 3 <= len(p) <= 6:
            counter[p] += 1
    candidates = [(p, c) for p, c in counter.items() if c >= min_count]
    candidates.sort(key=lambda x: (-x[1], x[0]))
    return [p for p, _ in candidates[:top_n]]


# =========================================================================
# Convention Jinja
# =========================================================================
def _parse_jinja(
    paragraphs: list[DocParagraph],
    para_section: dict[int, str],
) -> list[Placeholder]:
    found: dict[tuple[str, str], Placeholder] = {}
    pos_counter = _Counter()

    for p in paragraphs:
        text = p.text
        if not text:
            continue
        section = para_section.get(p.index, "")

        for m in JINJA_VAR_RE.finditer(text):
            raw = m.group(1).strip()
            if raw.startswith(("%", "#", "-")):
                continue
            if raw.startswith('"@@') or raw.startswith("'@@"):
                continue
            key = raw.split("|", 1)[0].split(" ", 1)[0].strip()
            if not key or not re.match(r"^[a-zA-Z_][\w\.]*$", key):
                continue
            _record(found, ("field", key), Placeholder(
                key=key, type="field",
                section=section,
                context=_build_context(text, m.start(), m.end()),
                position=pos_counter.next(),
            ))

        for m in JINJA_FOR_RE.finditer(text):
            key = m.group(1).strip()
            _record(found, ("loop", key), Placeholder(
                key=key, type="loop", required=False,
                section=section,
                context=_build_context(text, m.start(), m.end()),
                position=pos_counter.next(),
            ))

    _collect_pdf_annex_paras(paragraphs, para_section, found, pos_counter)
    return _sorted(found)


# =========================================================================
# Convention préfixée
# =========================================================================
def _build_prefix_regexes(prefix: str) -> tuple[re.Pattern[str], re.Pattern[str]]:
    p = re.escape(prefix)
    block_re = re.compile(rf"(?i){p}((?:(?!{p})\w)+?)({_BLOCK_SUFFIX_GROUP})")
    token_re = re.compile(rf"(?i){p}(?:(?!{p})\w)+")
    return block_re, token_re


def _parse_prefix(
    paragraphs: list[DocParagraph],
    para_section: dict[int, str],
    prefix: str,
) -> list[Placeholder]:
    prefix = (prefix or "").strip().lower()
    if not prefix:
        found: dict[tuple[str, str], Placeholder] = {}
        pos_counter = _Counter()
        _collect_pdf_annex_paras(paragraphs, para_section, found, pos_counter)
        return _sorted(found)

    block_re, token_re = _build_prefix_regexes(prefix)
    skip_len = len(prefix)
    found: dict[tuple[str, str], Placeholder] = {}
    pos_counter = _Counter()

    # Suivi des paires de blocs : on enregistre le PREMIER passage (DEBUT/start)
    # pour mémoriser la section/context, et on attend l'autre extrémité avant
    # de matérialiser un placeholder de type 'block'.
    block_state: dict[str, dict[str, bool | Placeholder]] = {}

    for p in paragraphs:
        text = p.text
        if not text:
            continue
        section = para_section.get(p.index, "")

        # 1. Marqueurs de bloc dans ce paragraphe
        block_spans: list[tuple[int, int]] = []
        for m in block_re.finditer(text):
            base = m.group(1).rstrip("_").lower()
            suffix = m.group(2).lower()
            block_spans.append((m.start(), m.end()))
            state = block_state.setdefault(base, {"start": False, "end": False})
            if suffix in ("debut", "start"):
                state["start"] = True
                if "placeholder" not in state:
                    state["placeholder"] = Placeholder(
                        key=base, type="block", required=False,
                        section=section,
                        context=_build_context(text, m.start(), m.end()),
                        position=pos_counter.next(),
                    )
            else:
                state["end"] = True

        # 2. Masquer les marqueurs de bloc avant la détection des champs
        chars = list(text)
        for s, e in block_spans:
            for i in range(s, e):
                chars[i] = " "
        masked = "".join(chars)

        # 3. Champs <prefix>xxx
        for m in token_re.finditer(masked):
            tok = m.group(0)
            key = tok[skip_len:]
            if not key or BLOCK_SUFFIX_RE.search(key):
                continue
            k = ("field", key.lower())
            if k not in found:
                _record(found, k, Placeholder(
                    key=key.lower(), type="field",
                    section=section,
                    context=_build_context(text, m.start(), m.end()),
                    position=pos_counter.next(),
                ))

    # 4. Matérialise les blocs complets
    for base, state in block_state.items():
        if state.get("start") and state.get("end") and "placeholder" in state:
            ph = state["placeholder"]
            assert isinstance(ph, Placeholder)
            found[("block", base)] = ph

    # 5. PDF/annexe (parcours paragraphes)
    _collect_pdf_annex_paras(paragraphs, para_section, found, pos_counter)
    return _sorted(found)


# =========================================================================
# Marqueurs PDF / annexe (parcours par paragraphe pour récupérer la section)
# =========================================================================
def _collect_pdf_annex_paras(
    paragraphs: list[DocParagraph],
    para_section: dict[int, str],
    found: dict[tuple[str, str], Placeholder],
    pos_counter: "_Counter",
) -> None:
    for p in paragraphs:
        text = p.text
        if not text:
            continue
        section = para_section.get(p.index, "")
        for m in MARKER_RE.finditer(text):
            kind = m.group(1)
            slot = m.group(2)
            if kind == "annex":
                k = ("annex", "annex")
                if k not in found:
                    _record(found, k, Placeholder(
                        key="annex", type="annex", required=False,
                        section=section,
                        context=_build_context(text, m.start(), m.end()),
                        position=pos_counter.next(),
                    ))
            elif slot:
                k = (kind, slot)
                if k not in found:
                    _record(found, k, Placeholder(
                        key=slot, type=kind,
                        section=section,
                        context=_build_context(text, m.start(), m.end()),
                        position=pos_counter.next(),
                    ))


# =========================================================================
# Helpers
# =========================================================================
class _Counter:
    """Compteur monotone pour préserver l'ordre d'apparition."""

    def __init__(self, start: int = 0) -> None:
        self._n = start

    def next(self) -> int:
        v = self._n
        self._n += 1
        return v


def _record(
    found: dict[tuple[str, str], Placeholder],
    key: tuple[str, str],
    placeholder: Placeholder,
) -> None:
    if key not in found:
        found[key] = placeholder


def _sorted(found: dict[tuple[str, str], Placeholder]) -> list[Placeholder]:
    # Ordre d'apparition dans le document
    return sorted(found.values(), key=lambda p: (p.position, p.type, p.key))
