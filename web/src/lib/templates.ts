// Création d'un template et (ré)upload de son DOCX. Réutilise le bucket privé
// `templates` (chemin {owner}/{template}/template.docx) — partagé entre le
// bouton « Importer DOCX » du Dashboard et « Remplacer le DOCX » du workspace.

import { supabase, type Template } from './supabase';

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function isDocx(file: File): boolean {
  return file.name.toLowerCase().endsWith('.docx');
}

export function baseName(file: File): string {
  return file.name.replace(/\.docx$/i, '').trim() || 'Sans titre';
}

export async function createTemplate(ownerId: string, name: string): Promise<Template> {
  const { data, error } = await supabase
    .from('templates')
    .insert({ owner_id: ownerId, name, version_tag: 'v1' })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? 'Création du template impossible.');
  }
  return data as Template;
}

export async function uploadTemplateDocx(
  ownerId: string,
  templateId: string,
  file: File,
): Promise<Template> {
  const path = `${ownerId}/${templateId}/template.docx`;
  const { error: upErr } = await supabase.storage
    .from('templates')
    .upload(path, file, { upsert: true, contentType: DOCX_CONTENT_TYPE });
  if (upErr) throw new Error(upErr.message);

  const { data, error: updErr } = await supabase
    .from('templates')
    .update({
      docx_path: path,
      docx_filename: file.name,
      docx_size_bytes: file.size,
      docx_uploaded_at: new Date().toISOString(),
      status: 'draft',
    })
    .eq('id', templateId)
    .select('*')
    .single();
  if (updErr || !data) {
    throw new Error(updErr?.message ?? 'Mise à jour du template impossible.');
  }
  return data as Template;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}
