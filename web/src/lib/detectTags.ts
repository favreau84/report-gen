// Détection cliente (préliminaire) des balises d'un DOCX, sans worker.
// Deux conventions, comme le worker :
//  - jinja      : {{ champ }} / {% for %} / {% if %}
//  - li_prefix  : tokens <préfixe><nom> + paires <préfixe><x>DEBUT/FIN, _start/_stop
// Détecte aussi les préfixes récurrents (xx_) pour pré-remplir le champ préfixe.
// L'analyse worker reste autoritative et viendra enrichir/remplacer.

import mammoth from 'mammoth/mammoth.browser';
import { supabase, type PlaceholderType } from './supabase';

export type TagConvention = 'jinja' | 'li_prefix';
export type DetectOptions = { convention?: TagConvention; prefix?: string };

export type DetectedPlaceholder = {
  key: string;
  type: PlaceholderType;
  required: boolean;
  section: string | null;
  context: string | null;
  position: number;
};

export type DetectionResult = {
  placeholders: DetectedPlaceholder[];
  counts: Record<PlaceholderType, number>;
  sectionCount: number;
  warnings: string[];
  suggestedPrefixes: string[];
};

const BLOCK_SUFFIXES = ['DEBUT', 'FIN', 'start', 'stop'];

export async function downloadTemplateDocx(path: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from('templates').download(path);
  if (error || !data) {
    throw new Error(error?.message ?? 'Téléchargement du DOCX impossible.');
  }
  return data.arrayBuffer();
}

type RawHit = { key: string; type: PlaceholderType; index: number };

function collect(
  text: string,
  re: RegExp,
  type: PlaceholderType,
  toKey: (m: RegExpExecArray) => string | null,
): RawHit[] {
  const hits: RawHit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const key = toKey(m);
    if (key) hits.push({ key, type, index: m.index });
  }
  return hits;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Détecte les préfixes récurrents type `li_`, `tag_` (insensible à la casse,
// stocké en minuscules). Miroir de `suggest_prefixes` du worker.
export function suggestPrefixes(text: string, minCount = 3, topN = 4): string[] {
  const re = /\b([a-zA-Z]{1,5})_[a-zA-Z][\w]+/g;
  const counter = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const p = m[1].toLowerCase() + '_';
    if (p.length >= 3 && p.length <= 6) counter.set(p, (counter.get(p) ?? 0) + 1);
  }
  return [...counter.entries()]
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([p]) => p);
}

function jinjaHits(text: string): RawHit[] {
  return [
    ...collect(text, /\{%-?\s*for\b([^%]*?)-?%\}/gi, 'loop', (m) => {
      const e = m[1].trim();
      return e ? `for ${e}` : null;
    }),
    ...collect(text, /\{%-?\s*if\b([^%]*?)-?%\}/gi, 'block', (m) => {
      const e = m[1].trim();
      return e ? `if ${e}` : null;
    }),
    ...collect(text, /\{\{-?\s*([^{}%]+?)\s*-?\}\}/g, 'field', (m) => m[1].trim() || null),
  ];
}

// Miroir client de `_find_prefix_tags` du worker.
function prefixHits(text: string, prefix: string): RawHit[] {
  const p = (prefix || '').trim().toLowerCase();
  if (!p) return [];
  const pe = escapeRe(p);
  const sufGroup = BLOCK_SUFFIXES.join('|');
  const blockRe = new RegExp(`${pe}((?:(?!${pe})\\w)+?)(${sufGroup})`, 'gi');
  const tokenRe = new RegExp(`${pe}(?:(?!${pe})\\w)+`, 'gi');
  const blockSuffixEnd = new RegExp(`(?:${sufGroup})$`, 'i');
  const hits: RawHit[] = [];
  const chars = text.split('');
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text)) !== null) {
    const base = m[1].replace(/_+$/, '').toLowerCase();
    if (base) hits.push({ key: base, type: 'block', index: m.index });
    for (let i = m.index; i < m.index + m[0].length; i++) chars[i] = ' ';
  }
  const masked = chars.join('');
  while ((m = tokenRe.exec(masked)) !== null) {
    const key = m[0].slice(p.length);
    if (!key || blockSuffixEnd.test(key)) continue;
    hits.push({ key: key.toLowerCase(), type: 'field', index: m.index });
  }
  return hits;
}

function markerHits(text: string): RawHit[] {
  return [
    ...collect(text, /@@pdf:([A-Za-z0-9_\-.]+)/g, 'pdf', (m) => `pdf:${m[1]}`),
    ...collect(text, /@@pdfdir:([A-Za-z0-9_\-.]+)/g, 'pdfdir', (m) => `pdfdir:${m[1]}`),
    ...collect(text, /@@annex\b/g, 'annex', () => 'annex'),
  ];
}

export async function detectTags(
  buf: ArrayBuffer,
  opts: DetectOptions = {},
): Promise<DetectionResult> {
  const convention: TagConvention = opts.convention ?? 'jinja';
  const { value: text } = await mammoth.extractRawText({ arrayBuffer: buf });

  const hits: RawHit[] = [
    ...(convention === 'li_prefix'
      ? prefixHits(text, opts.prefix ?? 'li_')
      : jinjaHits(text)),
    ...markerHits(text),
  ];
  hits.sort((a, b) => a.index - b.index);

  const seen = new Set<string>();
  const placeholders: DetectedPlaceholder[] = [];
  for (const h of hits) {
    const id = `${h.type}:${h.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    placeholders.push({
      key: h.key,
      type: h.type,
      required: true,
      section: null,
      context: null,
      position: placeholders.length,
    });
  }

  const counts: Record<PlaceholderType, number> = {
    field: 0,
    loop: 0,
    block: 0,
    pdf: 0,
    pdfdir: 0,
    annex: 0,
  };
  for (const ph of placeholders) counts[ph.type] += 1;

  const warnings: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const mk = trimmed.match(/@@(pdf|pdfdir|annex)\b\S*/);
    if (mk && trimmed !== mk[0]) {
      warnings.push(`Marqueur ${mk[0]} hors ligne dédiée`);
    }
  }

  let sectionCount = 0;
  try {
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf });
    sectionCount = (html.match(/<h[1-3][\s>]/g) ?? []).length;
  } catch {
    sectionCount = 0;
  }

  return { placeholders, counts, sectionCount, warnings, suggestedPrefixes: suggestPrefixes(text) };
}
