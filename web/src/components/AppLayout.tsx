import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FileText, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/cn';

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-full flex flex-col md:flex-row">
      {/* Mobile topbar */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-line bg-white sticky top-0 z-30">
        <button onClick={() => setOpen((v) => !v)} className="btn-ghost p-2" aria-label="Menu">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="font-semibold">Report Generator</div>
        <button onClick={handleSignOut} className="btn-ghost p-2" aria-label="Déconnexion">
          <LogOut size={18} />
        </button>
      </header>

      {/* Sidebar */}
      <aside
        className={cn(
          'border-r border-line bg-white md:w-64 md:flex md:flex-col shrink-0',
          open ? 'block' : 'hidden md:block',
        )}
      >
        <div className="hidden md:flex items-center h-16 px-6 border-b border-line">
          <FileText size={18} className="text-accent" />
          <span className="ml-2 font-semibold">Report Generator</span>
        </div>
        <nav className="p-3 flex-1">
          <NavLink
            to="/dashboard"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
                isActive ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-line/60',
              )
            }
          >
            <FileText size={16} />
            Mes rapports
          </NavLink>
        </nav>
        <div className="hidden md:block p-3 border-t border-line">
          <div className="px-3 py-2 text-xs text-muted truncate">{user?.email}</div>
          <button onClick={handleSignOut} className="btn-ghost w-full justify-start">
            <LogOut size={16} />
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 md:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
