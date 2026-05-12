import { WORKER_URL, getAccessToken } from './supabase';

async function authed(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error('Non authentifié.');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  let body: BodyInit | undefined;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  } else {
    body = init.body as BodyInit | undefined;
  }
  const r = await fetch(`${WORKER_URL}${path}`, { ...init, headers, body });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `Erreur worker (${r.status})`);
  }
  return r;
}

export type ParseResponse = {
  placeholders: Array<{
    key: string;
    type: 'field' | 'loop' | 'block' | 'pdf' | 'pdfdir' | 'annex';
    required: boolean;
    section: string;
    context: string;
    position: number;
  }>;
  suggested_prefixes: string[];
};

export async function parseDocx(reportId: string): Promise<ParseResponse> {
  const r = await authed('/parse', { method: 'POST', json: { report_id: reportId } });
  return (await r.json()) as ParseResponse;
}

export type GenerateResponse = { generation_id: string };

export async function generate(reportId: string): Promise<GenerateResponse> {
  const r = await authed('/generate', { method: 'POST', json: { report_id: reportId } });
  return (await r.json()) as GenerateResponse;
}

export type PreviewTag = { start: number; end: number; key: string; type: string };
export type PreviewParagraph = {
  index: number;
  text: string;
  style: string | null;
  heading_level: number | null;
  section_path: string;
  tags: PreviewTag[];
};
export type PreviewResponse = { paragraphs: PreviewParagraph[] };

export async function getPreview(reportId: string): Promise<PreviewResponse> {
  const r = await authed('/preview', { method: 'POST', json: { report_id: reportId } });
  return (await r.json()) as PreviewResponse;
}

export type PreviewPdfResponse = { path: string; signed_url: string; regenerated: boolean };

export async function getPreviewPdf(
  reportId: string,
  force: boolean = false,
): Promise<PreviewPdfResponse> {
  const r = await authed('/preview-pdf', {
    method: 'POST',
    json: { report_id: reportId, force },
  });
  return (await r.json()) as PreviewPdfResponse;
}
