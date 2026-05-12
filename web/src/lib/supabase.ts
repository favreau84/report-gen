import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY manquant. Copier web/.env.example vers web/.env.local.',
  );
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL ?? 'http://localhost',
  SUPABASE_PUBLISHABLE_KEY ?? 'publishable-key-missing',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export const WORKER_URL = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? 'http://localhost:8080';

export type TagConvention = 'jinja' | 'li_prefix';

export type Report = {
  id: string;
  owner_id: string;
  name: string;
  docx_path: string | null;
  status: 'draft' | 'ready' | 'generating' | 'done' | 'failed';
  tag_convention: TagConvention;
  tag_prefix: string;
  created_at: string;
  updated_at: string;
};

export type PlaceholderType = 'field' | 'loop' | 'block' | 'pdf' | 'pdfdir' | 'annex';

export type ReportPlaceholder = {
  id: string;
  report_id: string;
  key: string;
  type: PlaceholderType;
  required: boolean;
  section: string | null;
  context: string | null;
  position: number;
};

export type DatasourceKind = 'json' | 'pdf' | 'pdfdir';

export type Datasource = {
  id: string;
  report_id: string;
  key: string;
  kind: DatasourceKind;
  json_payload: unknown | null;
  storage_path: string | null;
};

export type Generation = {
  id: string;
  report_id: string;
  owner_id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  output_path: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
