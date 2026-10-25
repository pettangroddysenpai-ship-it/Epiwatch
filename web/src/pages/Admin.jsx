import { useEffect, useState } from 'react';
import { useI18n, diseaseName } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useStore } from '../lib/store.jsx';
import { api, timeAgo } from '../lib/api.js';
import { Page, Topbar } from '../components/Shell.jsx';
import { InlineAlert, ConfirmButton, Tabs } from '../components/ui.jsx';
import { levelInfo, canManage } from '../lib/ui.js';
import { IconSettings, IconPulse, IconAlert, IconRefresh, IconShield } from '../components/Icons.jsx';

export function AdminPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { diseases, config, reloadReference, refresh, pushToast } = useStore();

  const [tab, setTab] = useState('thresholds');
  const [draft, setDraft] = useState({});
  const [cfgDraft, setCfgDraft] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState([]);

  useEffect(() => {
    if (diseases.length) {
      const next = {};
      for (const d of diseases) {
        next[d.id] = [...(d.thresholds || [])]
          .sort((a, b) => a.level - b.level)
          .map((th) => ({ level: th.level, min_active: th.min_active }));
      }
      setDraft(next);
    }
  }, [diseases]);

  useEffect(() => {
    if (config) {
      setCfgDraft({
        window_days: config.window_days,
        threshold_basis: config.threshold_basis,
        persist_min_level: config.persist_min_level,
        escalation: config.escalation,
      });
    }
  }, [config]);

  useEffect(() => {
    if (tab === 'audit') {
      api.audit(80).then((r) => setAudit(r.entries)).catch(() => undefined);
    }
  }, [tab]);

  if (!canManage(user)) {
    return (
      <>
        <Topbar title={t('admin.title')} />
        <Page>
          <InlineAlert kind="warn">{t('admin.noPermission')}</InlineAlert>
        </Page>
      </>
    );
  }

  const updateThreshold = (diseaseId, level, value) => {
    setDraft((prev) => ({
      ...prev,
      [diseaseId]: prev[diseaseId].map((th) =>
        th.level === level ? { ...th, min_active: Math.max(0, Number(value) || 0) } : th,
      ),
    }));
  };

  const saveThresholds = async (diseaseId) => {
    setBusy(true);
    setFeedback(null);
    try {
      const rows = draft[diseaseId];
      const sorted = [...rows].sort((a, b) => a.min_active - b.min_active);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].min_active < sorted[i - 1].min_active) {
          throw new Error(lang === 'fr' ? 'Les seuils doivent être croissants.' : 'Thresholds must increase.');
        }
      }
      await api.updateThresholds(diseaseId, rows);
      await reloadReference();
      await refresh();
      pushToast({ kind: 'success', title: t('common.save'), body: t('admin.thresholds') });
      setFeedback({ kind: 'info', message: t('common.save') + ' ✓' });
    } catch (err) {
      setFeedback({ kind: 'warn', message: err.message });
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await api.updateConfig({
        window_days: Number(cfgDraft.window_days),
        threshold_basis: cfgDraft.threshold_basis,
        persist_min_level: Number(cfgDraft.persist_min_level),
        escalation: cfgDraft.escalation,
      });
      await reloadReference();
      await refresh();
      pushToast({ kind: 'success', title: t('common.save'), body: t('admin.escalation') });
      setFeedback({ kind: 'info', message: t('common.save') + ' ✓' });
    } catch (err) {
      setFeedback({ kind: 'warn', message: err.message });
    } finally {
      setBusy(false);
    }
  };

  const runScenario = async () => {
    setBusy(true);
    try {
      const res = await api.runScenario('cholera_douala');
      await refresh();
      pushToast({
        kind: 'danger',
        title: lang === 'fr' ? 'Scénario exécuté' : 'Scenario executed',
        body: `${res.created.length} ${lang === 'fr' ? 'hôpitaux mis à jour' : 'hospitals updated'}`,
      });
    } finally {
      setBusy(false);
    }
  };

  const resetDemo = async () => {
    setBusy(true);
    try {
      await api.resetDemo();
      await reloadReference();
      await refresh();
      pushToast({ kind: 'success', title: t('admin.reset') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Topbar title={t('admin.title')} subtitle={t('app.org')} />
      <Page>
        {feedback && (
          <InlineAlert kind={feedback.kind} onClose={() => setFeedback(null)}>
            {feedback.message}
          </InlineAlert>
        )}

        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'thresholds', label: t('admin.thresholds') },
            { id: 'escalation', label: t('admin.escalation') },
            { id: 'demo', label: t('admin.simulation') },
            { id: 'audit', label: t('admin.audit') },
          ]}
        />

        {tab === 'thresholds' && (
          <div className="grid grid-2">
            {(diseases ?? []).map((d) => (
              <div className="card" key={d.id}>
                <div className="card-head">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="dot" style={{ background: d.color, width: 11, height: 11 }} />
                    <h3>{diseaseName(d, lang)}</h3>
                  </div>
                  <IconSettings style={{ width: 16, height: 16, color: 'var(--text-faint)' }} />
                </div>
                <p className="tiny faint" style={{ marginTop: -8, marginBottom: 12 }}>{t('admin.thresholdHint')}</p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('common.level')}</th>
                        <th>{t('admin.basis')}</th>
                        <th className="num">{t('common.total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(draft[d.id] ?? []).map((th) => {
                        const info = levelInfo(th.level);
                        return (
                          <tr key={th.level}>
                            <td>
                              <span className="row" style={{ gap: 8 }}>
                                <span className="dot" style={{ background: info.color }} />
                                <span className="small">{th.level} · {lang === 'en' ? info.labelEn : info.labelFr}</span>
                              </span>
                            </td>
                            <td className="tiny faint">≥</td>
                            <td className="num">
                              <input
                                type="number"
                                min="0"
                                value={th.min_active}
                                onChange={(e) => updateThreshold(d.id, th.level, e.target.value)}
                                style={{ width: 96, textAlign: 'right', padding: '5px 9px' }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <button className="btn primary sm" style={{ marginTop: 12 }} onClick={() => saveThresholds(d.id)} disabled={busy}>
                  {t('admin.saveThresholds')}
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'escalation' && cfgDraft && (
          <div className="grid grid-2">
            <div className="card">
              <div className="card-head">
                <h3>{t('admin.escalation')}</h3>
              </div>

              <div className="field">
                <label htmlFor="window">{t('admin.window')} ({t('common.days')})</label>
                <input
                  id="window"
                  type="number"
                  min="1"
                  max="90"
                  value={cfgDraft.window_days}
                  onChange={(e) => setCfgDraft({ ...cfgDraft, window_days: e.target.value })}
                />
                <span className="hint">
                  {lang === 'fr' ? 'Période d’agrégation des nouveaux cas.' : 'Window for aggregating new cases.'}
                </span>
              </div>

              <div className="field">
                <label htmlFor="basis">{t('admin.basis')}</label>
                <select
                  id="basis"
                  value={cfgDraft.threshold_basis}
                  onChange={(e) => setCfgDraft({ ...cfgDraft, threshold_basis: e.target.value })}
                >
                  <option value="under_care">{t('common.underCare')}</option>
                  <option value="new_cases_window">{t('common.newCases')} ({t('report.period')})</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="persist">{t('admin.persistMin')}</label>
                <select
                  id="persist"
                  value={cfgDraft.persist_min_level}
                  onChange={(e) => setCfgDraft({ ...cfgDraft, persist_min_level: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5].map((l) => (
                    <option key={l} value={l}>
                      {l} · {lang === 'en' ? levelInfo(l).labelEn : levelInfo(l).labelFr}
                    </option>
                  ))}
                </select>
              </div>

              <div className="divider" />

              <div className="field">
                <label htmlFor="districtRule">{t('admin.districtRule')}</label>
                <input
                  id="districtRule"
                  type="number"
                  min="1"
                  value={cfgDraft.escalation.district.minHospitals}
                  onChange={(e) =>
                    setCfgDraft({
                      ...cfgDraft,
                      escalation: {
                        ...cfgDraft.escalation,
                        district: { ...cfgDraft.escalation.district, minHospitals: Number(e.target.value) },
                      },
                    })
                  }
                />
              </div>

              <div className="field">
                <label htmlFor="regionRule">{t('admin.regionRule')}</label>
                <input
                  id="regionRule"
                  type="number"
                  min="1"
                  value={cfgDraft.escalation.region.minHospitals}
                  onChange={(e) =>
                    setCfgDraft({
                      ...cfgDraft,
                      escalation: {
                        ...cfgDraft.escalation,
                        region: { ...cfgDraft.escalation.region, minHospitals: Number(e.target.value) },
                      },
                    })
                  }
                />
              </div>

              <button className="btn primary" onClick={saveConfig} disabled={busy}>
                {t('admin.saveConfig')}
              </button>
            </div>

            <div className="card">
              <div className="card-head">
                <h3>{lang === 'fr' ? 'Logique d’escalade' : 'Escalation logic'}</h3>
                <IconShield style={{ width: 18, height: 18, color: 'var(--primary)' }} />
              </div>
              <ol className="col small" style={{ gap: 12, paddingLeft: 18, color: 'var(--text-dim)' }}>
                <li>
                  {lang === 'fr'
                    ? 'Un hôpital atteint un niveau ≥ 2 : une alerte locale est créée.'
                    : 'A hospital reaches level ≥ 2: a local alert is created.'}
                </li>
                <li>
                  {lang === 'fr'
                    ? `Au moins ${cfgDraft.escalation.district.minHospitals} hôpitaux d’un même district au niveau 5+ : alerte de district.`
                    : `At least ${cfgDraft.escalation.district.minHospitals} hospitals in the same district at level 5+: district alert.`}
                </li>
                <li>
                  {lang === 'fr'
                    ? `Au moins ${cfgDraft.escalation.region.minHospitals} hôpitaux d’une même région au niveau 5+ : alerte régionale.`
                    : `At least ${cfgDraft.escalation.region.minHospitals} hospitals in the same region at level 5+: regional alert.`}
                </li>
                <li>
                  {lang === 'fr'
                    ? 'Un seul hôpital au niveau 6 déclenche immédiatement l’escalade supérieure.'
                    : 'A single hospital at level 6 immediately triggers the upper escalation.'}
                </li>
                <li>
                  {lang === 'fr'
                    ? 'Le système compte les établissements distincts, pas le nombre total de cas.'
                    : 'The system counts distinct facilities, not total cases.'}
                </li>
              </ol>
            </div>
          </div>
        )}

        {tab === 'demo' && (
          <div className="grid grid-2">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>{t('admin.simulation')}</h3>
                  <p>{t('admin.simulationHint')}</p>
                </div>
                <IconPulse style={{ width: 18, height: 18, color: 'var(--lvl4)' }} />
              </div>
              <div className="col" style={{ gap: 10 }}>
                <button className="btn danger" onClick={runScenario} disabled={busy}>
                  <IconAlert style={{ width: 16, height: 16 }} />
                  {t('admin.runScenario')}
                </button>
                <button className="btn" onClick={() => { reloadReference(); refresh(); }} disabled={busy}>
                  <IconRefresh style={{ width: 16, height: 16 }} />
                  {t('common.refresh')}
                </button>
                <div className="divider" />
                <ConfirmButton className="btn" onConfirm={resetDemo} confirmLabel={t('admin.resetConfirm')}>
                  {t('admin.reset')}
                </ConfirmButton>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h3>{lang === 'fr' ? 'Déroulé de la démonstration' : 'Demo walkthrough'}</h3>
              </div>
              <ol className="col small" style={{ gap: 11, paddingLeft: 18, color: 'var(--text-dim)' }}>
                {(lang === 'fr'
                  ? [
                      'Ouvrez la carte : les hôpitaux de Douala sont déjà en alerte rouge (choléra).',
                      'Depuis un téléphone, ouvrez /welcome et abonnez-vous à la région Littoral.',
                      'Sur l’ordinateur, saisissez de nouveaux cas à l’Hôpital Central de Douala.',
                      'Observez le marqueur grandir et l’alerte régionale apparaître en temps réel.',
                      'Déclenchez « Alerte majeure » en dépassant le seuil de niveau 6.',
                    ]
                  : [
                      'Open the map: Douala hospitals are already on red alert (cholera).',
                      'On a phone, open /welcome and subscribe to the Littoral region.',
                      'On the computer, enter new cases at Douala Central Hospital.',
                      'Watch the marker grow and the regional alert appear in real time.',
                      'Trigger a "Major alert" by crossing the level 6 threshold.',
                    ]
                ).map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {tab === 'audit' && (
          <div className="card">
            <div className="card-head">
              <h3>{t('admin.audit')}</h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('common.date')}</th>
                    <th>{lang === 'fr' ? 'Entité' : 'Entity'}</th>
                    <th>{lang === 'fr' ? 'Action' : 'Action'}</th>
                    <th>{lang === 'fr' ? 'Auteur' : 'Actor'}</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id}>
                      <td className="mono small">{timeAgo(a.created_at, lang)}</td>
                      <td>
                        <span className="badge soft">{a.entity}</span> #{a.entity_id ?? (lang === 'fr' ? 'Non défini' : 'Undefined')}
                      </td>
                      <td className="bold small">{a.action}</td>
                      <td className="small faint">{a.actor_name ?? (lang === 'fr' ? 'Système' : 'System')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Page>
    </>
  );
}
