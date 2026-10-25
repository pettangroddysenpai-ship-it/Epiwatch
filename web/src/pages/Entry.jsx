import { useEffect, useMemo, useState } from 'react';
import { useI18n, diseaseName } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useStore } from '../lib/store.jsx';
import { api, formatDate, formatNumber, timeAgo } from '../lib/api.js';
import { Page, Topbar, ConnectionBanner } from '../components/Shell.jsx';
import { InlineAlert, LevelBadge } from '../components/ui.jsx';
import { canReport, levelInfo } from '../lib/ui.js';
import { IconEntry, IconCheck, IconPulse, IconRefresh } from '../components/Icons.jsx';

export function EntryPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { hospitals, diseases, refresh, pushToast } = useStore();

  const [regionId, setRegionId] = useState('');
  const [hospitalId, setHospitalId] = useState('');
  const [diseaseId, setDiseaseId] = useState('');
  const [customDisease, setCustomDisease] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [newCases, setNewCases] = useState('');
  const [underCare, setUnderCare] = useState('');
  const [deaths, setDeaths] = useState('0');
  const [recovered, setRecovered] = useState('0');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [recent, setRecent] = useState([]);
  const [lastSync, setLastSync] = useState(null);

  const allowed = canReport(user);
  const lockedHospital = user?.hospital_id ?? null;
  const isGlobalEditor = user?.role === 'admin';

  const regions = useMemo(
    () => hospitals.reduce((acc, h) => {
      if (h.region_id && !acc.find((x) => x.id === h.region_id)) {
        acc.push({ id: h.region_id, name: h.region_name });
      }
      return acc;
    }, []).sort((a, b) => a.name.localeCompare(b.name)),
    [hospitals],
  );

  const filteredHospitals = useMemo(() => {
    if (lockedHospital && !isGlobalEditor) {
      return hospitals.filter((h) => h.id === lockedHospital);
    }
    if (regionId) {
      return hospitals.filter((h) => String(h.region_id) === String(regionId));
    }
    return hospitals;
  }, [hospitals, regionId, lockedHospital, isGlobalEditor]);

  /* Pré-sélection de l'hôpital rattaché au compte */
  useEffect(() => {
    if (lockedHospital) {
      const h = hospitals.find((x) => x.id === lockedHospital);
      if (h?.region_id) setRegionId(String(h.region_id));
      setHospitalId(String(lockedHospital));
    } else if (!hospitalId && filteredHospitals.length) {
      setHospitalId(String(filteredHospitals[0].id));
    }
  }, [lockedHospital, hospitals, filteredHospitals, hospitalId]);

  useEffect(() => {
    if (!diseaseId && diseases.length) setDiseaseId(String(diseases[0].id));
  }, [diseases, diseaseId]);

  useEffect(() => {
    if (lockedHospital && !isGlobalEditor) return;
    if (regionId && hospitalId) {
      const still = filteredHospitals.find((h) => String(h.id) === String(hospitalId));
      if (!still) setHospitalId(filteredHospitals[0] ? String(filteredHospitals[0].id) : '');
    } else if (regionId && !hospitalId && filteredHospitals.length) {
      setHospitalId(String(filteredHospitals[0].id));
    }
  }, [regionId, hospitalId, filteredHospitals, lockedHospital, isGlobalEditor]);

  const loadRecent = () => {
    const params = hospitalId ? { hospital_id: hospitalId, limit: 12 } : { limit: 12 };
    api
      .cases(params)
      .then((r) => {
        setRecent(r.cases);
        setLastSync(new Date().toISOString());
      })
      .catch(() => undefined);
  };

  useEffect(loadRecent, [hospitalId]);

  /* Aperçu du niveau atteint selon le total sous prise en charge */
  const preview = useMemo(() => {
    const disease = diseases.find((d) => d.id === Number(diseaseId));
    if (!disease) return null;
    const value = Number(underCare || 0);
    const thresholds = [...(disease.thresholds || [])].sort((a, b) => a.level - b.level);
    let level = 0;
    for (const th of thresholds) {
      if (value >= th.min_active) level = th.level;
      else break;
    }
    return { disease, level, thresholds, value };
  }, [diseases, diseaseId, underCare]);

  const submit = async (e) => {
    e.preventDefault();
    setFeedback(null);
    setBusy(true);
    try {
      const res = await api.createCase({
        hospital_id: Number(hospitalId),
        disease_id: diseaseId === 'custom' ? undefined : Number(diseaseId),
        custom_disease: diseaseId === 'custom' ? customDisease.trim() : undefined,
        report_date: reportDate,
        new_cases: Number(newCases || 0),
        patients_under_care: Number(underCare || 0),
        deaths: Number(deaths || 0),
        recovered: Number(recovered || 0),
        notes: notes || undefined,
      });

      const newAlerts = (res.alerts?.created ?? []).filter((a) => a.scope === 'hospital');
      const level = newAlerts[0]?.level ?? 0;
      setFeedback({
        kind: level >= 5 ? 'warn' : 'info',
        level,
        message:
          level >= 2
            ? `${t('entry.success')} ${lang === 'fr' ? `Niveau d’alerte atteint : ${level}.` : `Alert level reached: ${level}.`}`
            : t('entry.success'),
      });
      pushToast({ kind: 'success', title: t('entry.success'), body: `${newCases} ${t('common.newCases').toLowerCase()}` });

      setNewCases('');
      setUnderCare('');
      setDeaths('0');
      setRecovered('0');
      setNotes('');
      setCustomDisease('');
      if (diseaseId === 'custom') setDiseaseId(diseases[0] ? String(diseases[0].id) : '');
      await refresh();
      loadRecent();
    } catch (err) {
      setFeedback({ kind: 'warn', message: err.message });
    } finally {
      setBusy(false);
    }
  };

  const simulate = async () => {
    if (!hospitalId || !diseaseId) return;
    if (diseaseId === 'custom') {
      setFeedback({ kind: 'warn', message: lang === 'fr' ? 'Choisissez une maladie existante pour la simulation.' : 'Pick an existing disease to run the simulation.' });
      return;
    }
    setBusy(true);
    try {
      await api.simulate({
        hospital_id: Number(hospitalId),
        disease_id: Number(diseaseId),
        new_cases: 40,
      });
      await refresh();
      loadRecent();
      setFeedback({ kind: 'info', message: lang === 'fr' ? 'Hausse simulée (+40 cas). Regardez la carte.' : 'Simulated surge (+40 cases). Check the map.' });
    } catch (err) {
      setFeedback({ kind: 'warn', message: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <>
        <Topbar title={t('entry.title')} />
        <Page>
          <InlineAlert kind="warn">{t('entry.noAccess')}</InlineAlert>
        </Page>
      </>
    );
  }

  return (
    <>
      <Topbar
        title={t('entry.title')}
        subtitle={t('entry.subtitle')}
        actions={
          <button className="btn sm ghost" onClick={loadRecent}>
            <IconRefresh style={{ width: 15, height: 15 }} />
            {t('common.refresh')}
          </button>
        }
      />
      <ConnectionBanner />
      <Page>
        {feedback && (
          <InlineAlert kind={feedback.kind} onClose={() => setFeedback(null)}>
            <div className="row wrap" style={{ gap: 9 }}>
              <IconCheck style={{ width: 16, height: 16 }} />
              <span>{feedback.message}</span>
            </div>
          </InlineAlert>
        )}

        <div className="grid grid-2">
          {/* ── Formulaire ── */}
          <div className="card">
            <div className="card-head">
              <div>
                <h3>{t('entry.submit')}</h3>
                <p>{t('common.date')}: {formatDate(reportDate, lang)}</p>
              </div>
              <IconEntry style={{ width: 18, height: 18, color: 'var(--primary)' }} />
            </div>

            <form onSubmit={submit}>
              <div className="grid grid-2" style={{ gap: 12 }}>
                <div className="field">
                  <label htmlFor="region">{t('common.region')}</label>
                  <select
                    id="region"
                    value={regionId}
                    onChange={(e) => setRegionId(e.target.value)}
                    disabled={!!lockedHospital && !isGlobalEditor}
                  >
                    <option value="">{lang === 'fr' ? 'Toutes les régions' : 'All regions'}</option>
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="hospital">{t('entry.selectHospital')}</label>
                  <select
                    id="hospital"
                    value={hospitalId}
                    onChange={(e) => setHospitalId(e.target.value)}
                    disabled={!!lockedHospital && !isGlobalEditor}
                    required
                  >
                    <option value="">{lang === 'fr' ? 'Sélectionner un hôpital' : 'Select a hospital'}</option>
                    {filteredHospitals.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {lockedHospital && !isGlobalEditor && (
                <span className="hint" style={{ marginTop: -8, marginBottom: 14, display: 'block' }}>
                  {t('entry.hospitalLocked')}
                </span>
              )}

              <div className="field">
                <label htmlFor="disease">{t('entry.selectDisease')}</label>
                <select id="disease" value={diseaseId} onChange={(e) => setDiseaseId(e.target.value)} required>
                  <option value="">{lang === 'fr' ? 'Sélectionner une maladie' : 'Select a disease'}</option>
                  {diseases.map((d) => (
                    <option key={d.id} value={d.id}>
                      {diseaseName(d, lang)}
                    </option>
                  ))}
                  <option value="custom">{lang === 'fr' ? 'Autre maladie (à préciser)' : 'Other disease (specify)'}</option>
                </select>
              </div>

              {diseaseId === 'custom' && (
                <div className="field">
                  <label htmlFor="customDisease">{lang === 'fr' ? 'Nom de la maladie' : 'Disease name'}</label>
                  <input
                    id="customDisease"
                    value={customDisease}
                    onChange={(e) => setCustomDisease(e.target.value)}
                    placeholder={lang === 'fr' ? 'Ex. Rougeole, Fièvre typhoïde…' : 'e.g. Measles, Typhoid fever…'}
                    required
                  />
                  <span className="hint">{lang === 'fr' ? 'Si cette maladie n’existe pas, elle sera ajoutée automatiquement.' : 'If unknown, it will be created automatically.'}</span>
                </div>
              )}

              <div className="field">
                <label htmlFor="date">{t('entry.reportDate')}</label>
                <input
                  id="date"
                  type="date"
                  value={reportDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setReportDate(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-2" style={{ gap: 12 }}>
                <div className="field">
                  <label htmlFor="newCases">{t('common.newCases')}</label>
                  <input
                    id="newCases"
                    type="number"
                    min="0"
                    value={newCases}
                    onChange={(e) => setNewCases(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="underCare">{t('common.underCare')}</label>
                  <input
                    id="underCare"
                    type="number"
                    min="0"
                    value={underCare}
                    onChange={(e) => setUnderCare(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="deaths">{t('common.deaths')}</label>
                  <input id="deaths" type="number" min="0" value={deaths} onChange={(e) => setDeaths(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="recovered">{t('common.recovered')}</label>
                  <input id="recovered" type="number" min="0" value={recovered} onChange={(e) => setRecovered(e.target.value)} />
                </div>
              </div>

              <div className="field">
                <label htmlFor="notes">{t('common.notes')}</label>
                <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>

              <div className="row wrap" style={{ gap: 10 }}>
                <button className="btn primary" type="submit" disabled={busy}>
                  {busy ? <span className="spinner" /> : <IconCheck style={{ width: 16, height: 16 }} />}
                  {t('entry.submit')}
                </button>
                <button className="btn ghost" type="button" onClick={simulate} disabled={busy}>
                  <IconPulse style={{ width: 16, height: 16 }} />
                  {t('entry.simulate')}
                </button>
              </div>
            </form>
          </div>

          {/* ── Aperçu & historique ── */}
          <div className="col" style={{ gap: 16 }}>
            {preview && (
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>{diseaseName(preview.disease, lang)}</h3>
                    <p>{t('admin.thresholds')}</p>
                  </div>
                  <LevelBadge level={preview.level} lang={lang} withLabel />
                </div>
                <div className="col" style={{ gap: 8 }}>
                  {preview.thresholds.map((th) => {
                    const info = levelInfo(th.level);
                    const reached = preview.value >= th.min_active;
                    return (
                      <div className="row between" key={th.level} style={{ opacity: reached ? 1 : 0.55 }}>
                        <div className="row">
                          <span className="dot" style={{ background: info.color }} />
                          <span className="small">{th.level} · {lang === 'en' ? info.labelEn : info.labelFr}</span>
                        </div>
                        <span className="mono small faint">≥ {formatNumber(th.min_active, lang)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-head">
                <div>
                  <h3>{t('entry.recent')}</h3>
                  <p>
                    {t('entry.lastSync')}: {lastSync ? timeAgo(lastSync, lang) : (lang === 'fr' ? 'Jamais synchronisé' : 'Never synced')}
                  </p>
                </div>
              </div>
              {recent.length === 0 ? (
                <div className="empty">{t('common.none')}</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('common.date')}</th>
                        <th>{t('common.disease')}</th>
                        <th className="num">{t('common.newCases')}</th>
                        <th className="num">{t('common.underCare')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((c) => (
                        <tr key={c.id}>
                          <td className="mono">{formatDate(c.report_date, lang)}</td>
                          <td>
                            <span className="row" style={{ gap: 7 }}>
                              <span className="dot" style={{ background: c.disease_color }} />
                              {c.disease_name}
                            </span>
                          </td>
                          <td className="num mono bold">{formatNumber(c.new_cases, lang)}</td>
                          <td className="num mono">{formatNumber(c.patients_under_care, lang)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </Page>
    </>
  );
}
