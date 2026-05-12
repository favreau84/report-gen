import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, Play } from 'lucide-react';
import { supabase, type Generation, type Report } from '../lib/supabase';
import { generate } from '../lib/worker';
import { useToast } from '../lib/toast';

const STATUS_LABEL: Record<Generation['status'], string> = {
  pending: 'En attente…',
  running: 'Génération en cours…',
  done: 'Terminé',
  failed: 'Échec',
};

export function ReportGeneratePage() {
  const { id } = useParams();
  const toast = useToast();
  const [report, setReport] = useState<Report | null>(null);
  const [gen, setGen] = useState<Generation | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;
    void supabase
      .from('reports')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => setReport((data as Report) ?? null));
    void loadLatestGen();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [id]);

  async function loadLatestGen() {
    if (!id) return;
    const { data } = await supabase
      .from('generations')
      .select('*')
      .eq('report_id', id)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setGen((data as Generation) ?? null);
    if (data && (data as Generation).status === 'done' && (data as Generation).output_path) {
      void buildSignedUrl((data as Generation).output_path!);
    }
    if (data && ((data as Generation).status === 'pending' || (data as Generation).status === 'running')) {
      startPolling();
    }
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      if (!gen && !id) return;
      const generationId = (gen?.id ?? null) || null;
      const { data } = generationId
        ? await supabase.from('generations').select('*').eq('id', generationId).single()
        : await supabase
            .from('generations')
            .select('*')
            .eq('report_id', id!)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();
      const g = (data as Generation) ?? null;
      setGen(g);
      if (g && (g.status === 'done' || g.status === 'failed')) {
        if (pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
        if (g.status === 'done' && g.output_path) {
          void buildSignedUrl(g.output_path);
          toast.push('success', 'PDF généré.');
        }
        if (g.status === 'failed') toast.push('error', g.error ?? 'Échec de la génération.');
      }
    }, 2000);
  }

  async function buildSignedUrl(path: string) {
    const { data, error } = await supabase.storage.from('outputs').createSignedUrl(path, 3600);
    if (error) {
      toast.push('error', error.message);
      return;
    }
    setSignedUrl(data.signedUrl);
  }

  async function trigger() {
    if (!id) return;
    setBusy(true);
    setSignedUrl(null);
    try {
      const { generation_id } = await generate(id);
      const { data } = await supabase
        .from('generations')
        .select('*')
        .eq('id', generation_id)
        .single();
      setGen((data as Generation) ?? null);
      startPolling();
    } catch (e) {
      toast.push('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <Link to={`/reports/${id}/edit`} className="btn-ghost px-2 py-1.5">
          <ArrowLeft size={16} /> Retour à l'édition
        </Link>
      </header>

      <div>
        <h1 className="text-xl font-semibold">{report?.name ?? '…'}</h1>
        <p className="text-sm text-muted">Génération du PDF côté serveur.</p>
      </div>

      <div className="card p-5 space-y-4">
        <button onClick={trigger} className="btn-primary" disabled={busy || gen?.status === 'running' || gen?.status === 'pending'}>
          <Play size={16} />
          Lancer la génération
        </button>

        {gen && (
          <div className="rounded-lg border border-line p-4 space-y-2">
            <div className="flex items-center gap-2">
              {(gen.status === 'pending' || gen.status === 'running') && (
                <Loader2 className="animate-spin text-accent" size={16} />
              )}
              <span className="text-sm font-medium">{STATUS_LABEL[gen.status]}</span>
            </div>
            <div className="text-xs text-muted">
              Démarrée à {new Date(gen.started_at).toLocaleString('fr-FR')}
              {gen.finished_at &&
                ` · Terminée à ${new Date(gen.finished_at).toLocaleString('fr-FR')}`}
            </div>
            {gen.error && <div className="text-sm text-danger">{gen.error}</div>}
            {gen.status === 'done' && signedUrl && (
              <a href={signedUrl} target="_blank" rel="noreferrer" className="btn-primary mt-2">
                <Download size={16} />
                Télécharger le PDF
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
