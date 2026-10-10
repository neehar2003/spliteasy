import { useRef, useState } from 'react';
import { Download, Upload, Trash2, ShieldAlert } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { getCurrentUserName, setCurrentUserName } from '../services/settingsService';
import { exportBackupData, importBackupData } from '../services/backupService';
import { resetDatabase } from '../services/database/db';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useToast } from '../hooks/useToast';

export default function SettingsPage() {
  const { version, refresh } = useDatabase();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [name, setName] = useState(getCurrentUserName() || '');
  const [saving, setSaving] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  async function handleSaveName(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await setCurrentUserName(name);
      toast.success('Name saved.');
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    try {
      const data = await exportBackupData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spliteasy-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded.');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importBackupData(data);
      toast.success('Backup restored successfully.');
      refresh();
    } catch (err) {
      toast.error(err.message || 'Could not read that file.');
    } finally {
      e.target.value = '';
    }
  }

  async function handleReset() {
    if (resetConfirmText !== 'DELETE') {
      toast.error('Type DELETE exactly to confirm.');
      return;
    }
    try {
      await resetDatabase();
      toast.success('All data has been reset.');
      setShowReset(false);
      setResetConfirmText('');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="page-subtitle">Shared by everyone using this app. There's no login — people are identified by the name they type below.</p>
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">Your name</h3>
        <p className="hint" style={{ marginTop: -6, marginBottom: 14 }}>
          Used to calculate "you paid" / "you owe" totals on the dashboard. Match it to how your name appears as a member in your groups.
        </p>
        <form onSubmit={handleSaveName} className="flex-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={{ maxWidth: 260 }} />
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </form>
      </div>

      <div className="card">
        <h3 className="section-title">Data & privacy</h3>
        <p className="hint" style={{ marginTop: -6 }}>
          All groups, expenses, and settlements are stored in a shared database (Supabase/Postgres) that every person using
          this app's link can read and write — there's no login or per-person isolation. Use the export/import below to keep
          an offline copy.
        </p>

        <div className="flex-wrap-gap" style={{ marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download size={16} /> Export backup (JSON)
          </button>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} /> Import backup
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleImportFile} />
        </div>
      </div>

      <div className="card" style={{ borderColor: 'var(--color-danger-soft)' }}>
        <h3 className="section-title" style={{ color: 'var(--color-danger)' }}><ShieldAlert size={16} style={{ verticalAlign: -2 }} /> Danger zone</h3>
        <p className="hint" style={{ marginTop: -6 }}>Permanently delete every group, member, expense, and settlement for everyone sharing this app. This cannot be undone.</p>
        <button className="btn btn-danger" onClick={() => setShowReset(true)}>
          <Trash2 size={16} /> Reset all data
        </button>
      </div>

      {showReset && (
        <ConfirmDialog
          title="Reset all data?"
          message={
            <>
              This permanently deletes everything in SplitEasy. Type <strong>DELETE</strong> below to confirm.
              <input
                style={{ marginTop: 12 }}
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                autoFocus
              />
            </>
          }
          confirmLabel="Reset everything"
          danger
          onConfirm={handleReset}
          onCancel={() => { setShowReset(false); setResetConfirmText(''); }}
        />
      )}
    </div>
  );
}
