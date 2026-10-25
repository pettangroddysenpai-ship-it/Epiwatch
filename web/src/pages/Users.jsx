import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useStore } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { Page, Topbar } from '../components/Shell.jsx';
import { InlineAlert, Modal } from '../components/ui.jsx';
import { canManage, initials } from '../lib/ui.js';
import { IconUsers, IconPlus, IconShield } from '../components/Icons.jsx';

const ROLES = ['admin', 'agent', 'public'];

export function UsersPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { hospitals, zones, reloadReference } = useStore();

  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formRegion, setFormRegion] = useState('');
  const [form, setForm] = useState({
    email: '', password: '', full_name: '', role: 'agent', hospital_id: '', zone_id: '', rank: '',
  });

  const load = () => api.users().then((r) => setUsers(r.users)).catch(() => undefined);
  useEffect(() => { if (canManage(user)) load(); }, [user]);

  if (!canManage(user)) {
    return (
      <>
        <Topbar title={t('admin.users')} />
        <Page>
          <InlineAlert kind="warn">{t('admin.noPermission')}</InlineAlert>
        </Page>
      </>
    );
  }

  const regions = useMemo(
    () => (zones || []).filter((z) => z.type === 'region').sort((a, b) => a.name.localeCompare(b.name)),
    [zones],
  );

  const needsHospital = form.role === 'agent';

  const hospitalOptions = useMemo(() => {
    if (!needsHospital) return [];
    if (formRegion) {
      return (hospitals || []).filter((h) => String(h.region_id) === String(formRegion));
    }
    return hospitals || [];
  }, [hospitals, formRegion, needsHospital]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await api.createUser({
        ...form,
        hospital_id: form.hospital_id || null,
        zone_id: form.zone_id || null,
      });
      setOpen(false);
      setForm({ email: '', password: '', full_name: '', role: 'agent', hospital_id: '', zone_id: '', rank: '' });
      setFormRegion('');
      await load();
      await reloadReference();
      setFeedback({ kind: 'info', message: t('common.save') + ' ✓' });
    } catch (err) {
      setFeedback({ kind: 'warn', message: err.message });
    } finally {
      setBusy(false);
    }
  };

  // Generate preview of identifier based on hospital
  const selectedHospital = useMemo(() => {
    if (!form.hospital_id || !hospitals) return null;
    return hospitals.find(h => String(h.id) === String(form.hospital_id));
  }, [form.hospital_id, hospitals]);

  const previewIdentifier = useMemo(() => {
    if (!selectedHospital) return '';
    const hospitalCode = selectedHospital.code || selectedHospital.name.substring(0, 3).toLowerCase();
    return `inf.${hospitalCode}`;
  }, [selectedHospital]);

  return (
    <>
      <Topbar
        title={t('admin.users')}
        subtitle={`${users.length} ${lang === 'fr' ? 'comptes' : 'accounts'}`}
        actions={
          <button className="btn sm primary" onClick={() => setOpen(true)}>
            <IconPlus style={{ width: 15, height: 15 }} />
            {lang === 'fr' ? 'Nouvel utilisateur' : 'New user'}
          </button>
        }
      />
      <Page>
        {feedback && (
          <InlineAlert kind={feedback.kind} onClose={() => setFeedback(null)}>
            {feedback.message}
          </InlineAlert>
        )}

        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('auth.fullName')}</th>
                  <th>{t('auth.identifier')}</th>
                  <th>{lang === 'fr' ? 'Rôle / Grade' : 'Role / Rank'}</th>
                  <th>{lang === 'fr' ? 'Rattachement' : 'Assignment'}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="row" style={{ gap: 9 }}>
                        <span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                          {initials(u.full_name)}
                        </span>
                        <span className="bold">{u.full_name}</span>
                      </span>
                    </td>
                    <td className="small faint">{u.username || u.email}</td>
                    <td>
                      <div className="col" style={{ gap: 2 }}>
                        <span className={`badge ${u.role === 'admin' ? 'lvl-4' : u.role === 'agent' ? 'lvl-1' : 'soft'}`}>
                          {t(`role.${u.role}`)}
                        </span>
                        {u.rank && <span className="tiny faint">{u.rank}</span>}
                      </div>
                    </td>
                    <td className="small">{u.hospital_name || u.zone_name || (lang === 'fr' ? 'Non assigné' : 'Unassigned')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={lang === 'fr' ? 'Créer un utilisateur' : 'Create a user'}
          footer={
            <>
              <button className="btn ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
              <button className="btn primary" onClick={submit} disabled={busy}>
                {busy && <span className="spinner" />}
                {t('common.save')}
              </button>
            </>
          }
        >
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="u-name">{t('auth.fullName')}</label>
              <input id="u-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="u-email">{t('auth.email')}</label>
              <input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="u-pass">{t('auth.password')}</label>
              <input id="u-pass" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6} required />
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="u-role">{lang === 'fr' ? 'Rôle' : 'Role'}</label>
                <select id="u-role" value={form.role} onChange={(e) => { setForm({ ...form, role: e.target.value, hospital_id: '' }); setFormRegion(''); }}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{t(`role.${r}`)}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="u-rank">{lang === 'fr' ? 'Grade / titre' : 'Rank / title'}</label>
                <input id="u-rank" value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} placeholder={lang === 'fr' ? 'Ex. Dr. Ali, Infirmier' : 'e.g. Dr. Ali, Nurse'} />
              </div>
            </div>
            {needsHospital && (
              <div className="grid grid-2">
                <div className="field">
                  <label htmlFor="u-region">{t('common.region')}</label>
                  <select id="u-region" value={formRegion} onChange={(e) => setFormRegion(e.target.value)}>
                    <option value="">{lang === 'fr' ? 'Toutes les régions' : 'All regions'}</option>
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="u-hosp">{t('common.hospital')}</label>
                  <select id="u-hosp" value={form.hospital_id} onChange={(e) => setForm({ ...form, hospital_id: e.target.value })} required>
                    <option value="">{lang === 'fr' ? 'Sélectionner un hôpital' : 'Select a hospital'}</option>
                    {hospitalOptions.map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {needsHospital && (
              <span className="hint" style={{ display: 'block', marginTop: -10, marginBottom: 12 }}>
                {lang === 'fr' ? 'Le compteur sera généré à partir du code hôpital (ex. inf.hcd).' : 'Counter derived from hospital code (e.g. inf.hcd).'}
              </span>
            )}
            {needsHospital && previewIdentifier && (
              <div className="card" style={{ padding: 12, background: 'var(--surface-2)', marginTop: 8 }}>
                <div className="row between" style={{ gap: 8 }}>
                  <span className="small faint">{lang === 'fr' ? 'Identifiant généré :' : 'Generated identifier :'}</span>
                  <code className="small bold" style={{ color: 'var(--primary)' }}>{previewIdentifier}</code>
                </div>
              </div>
            )}
          </form>
        </Modal>
      </Page>
    </>
  );
}
