import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { supabase, type Report } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

const STATUS_LABEL: Record<Report['status'], string> = {
  draft: 'Brouillon',
  ready: 'Prêt',
  generating: 'Génération…',
  done: 'Généré',
  failed: 'Échec',
};

export function DashboardPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast.push('error', error.message);
      return;
    }
    setReports(data as Report[]);
  }

  async function create() {
    if (!name.trim() || !user) return;
    setCreating(true);
    const { error } = await supabase.from('reports').insert({
      name: name.trim(),
      owner_id: user.id,
    });
    setCreating(false);
    if (error) {
      toast.push('error', error.message);
      return;
    }
    setName('');
    toast.push('success', 'Rapport créé.');
    void load();
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce rapport ?')) return;
    const { error } = await supabase.from('reports').delete().eq('id', id);
    if (error) {
      toast.push('error', error.message);
      return;
    }
    toast.push('success', 'Rapport supprimé.');
    void load();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Mes rapports</h1>
        <span className="text-sm text-muted">{reports?.length ?? 0} rapport(s)</span>
      </header>

      <div className="card p-4 sm:p-5">
        <label className="label" htmlFor="new-name">
          Nouveau rapport
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="new-name"
            className="input flex-1"
            placeholder="Nom du rapport"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create();
            }}
          />
          <button onClick={create} className="btn-primary" disabled={!name.trim() || creating}>
            <Plus size={16} />
            Créer
          </button>
        </div>
      </div>

      <div className="card divide-y divide-line">
        {reports === null && <div className="p-6 text-sm text-muted">Chargement…</div>}
        {reports !== null && reports.length === 0 && (
          <div className="p-6 text-sm text-muted text-center">Aucun rapport pour le moment.</div>
        )}
        {reports?.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-4">
            <FileText size={18} className="text-muted shrink-0" />
            <Link
              to={`/reports/${r.id}/edit`}
              className="flex-1 min-w-0 text-ink hover:text-accent"
            >
              <div className="truncate font-medium">{r.name}</div>
              <div className="text-xs text-muted">
                Mis à jour le {new Date(r.updated_at).toLocaleString('fr-FR')}
              </div>
            </Link>
            <span className="badge border-line text-muted">{STATUS_LABEL[r.status]}</span>
            <button
              onClick={() => remove(r.id)}
              className="btn-ghost p-2"
              aria-label="Supprimer"
              title="Supprimer"
            >
              <Trash2 size={16} className="text-danger" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
