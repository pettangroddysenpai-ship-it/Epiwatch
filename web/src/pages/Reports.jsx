import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar as RBar, Cell,
} from 'recharts';
import { useI18n, diseaseName } from '../i18n/index.jsx';
import { useStore } from '../lib/store.jsx';
import { api, exportCsv, formatNumber, formatDate } from '../lib/api.js';
import { Page, Topbar } from '../components/Shell.jsx';
import { LevelBadge } from '../components/ui.jsx';
import { IconDownload, IconChart } from '../components/Icons.jsx';

export function ReportsPage() {
  const { t, lang } = useI18n();
  const { diseases, situation, hospitals, zones } = useStore();

  const [days, setDays] = useState(30);
  const [diseaseId, setDiseaseId] = useState('all');
  const [regionId, setRegionId] = useState('all');
  const [series, setSeries] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.timeseries({
        days,
        disease_id: diseaseId === 'all' ? undefined : diseaseId,
        region_id: regionId === 'all' ? undefined : regionId,
      }),
      api.cases({
        limit: 300,
        disease_id: diseaseId === 'all' ? undefined : diseaseId,
        region_id: regionId === 'all' ? undefined : regionId,
        from: new Date(Date.now() - days * 86400000).toISOString().slice(0, 10),
      }),
    ])
      .then(([ts, cs]) => {
        setSeries(ts.series);
        setCases(cs.cases);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [days, diseaseId, regionId]);

  const chartData = useMemo(
    () => series.map((s) => ({ ...s, label: s.date.slice(5) })),
    [series],
  );

  const totals = useMemo(() => {
    return series.reduce(
      (acc, s) => ({
        new_cases: acc.new_cases + s.new_cases,
        under_care: acc.under_care + s.under_care,
        deaths: acc.deaths + s.deaths,
        recovered: acc.recovered + s.recovered,
      }),
      { new_cases: 0, under_care: 0, deaths: 0, recovered: 0 },
    );
  }, [series]);

  const byHospital = useMemo(() => {
    const map = new Map();
    for (const s of situation) {
      if (diseaseId !== 'all' && s.disease_id !== Number(diseaseId)) continue;
      if (regionId !== 'all' && s.region_id !== Number(regionId)) continue;
      const cur = map.get(s.hospital_id) || {
        name: s.hospital_name,
        region: s.region_name,
        district: s.zone_name,
        level: 0,
        active: 0,
        new_cases: 0,
        deaths: 0,
      };
      cur.active += s.active;
      cur.new_cases += s.new_cases_window;
      cur.deaths += s.deaths_window;
      cur.level = Math.max(cur.level, s.level);
      map.set(s.hospital_id, cur);
    }
    return [...map.values()].sort((a, b) => b.level - a.level || b.active - a.active);
  }, [situation, diseaseId, regionId]);

  const exportCases = () => {
    exportCsv(`epiwatch-cas-${new Date().toISOString().slice(0, 10)}.csv`, cases, [
      { label: t('common.date'), value: (r) => r.report_date },
      { label: t('common.hospital'), value: (r) => r.hospital_name },
      { label: t('common.disease'), value: (r) => r.disease_name },
      { label: t('common.newCases'), value: (r) => r.new_cases },
      { label: t('common.underCare'), value: (r) => r.patients_under_care },
      { label: t('common.deaths'), value: (r) => r.deaths },
      { label: t('common.recovered'), value: (r) => r.recovered },
      { label: t('common.notes'), value: (r) => r.notes ?? '' },
    ]);
  };

  const chartGrid = 'rgba(148,163,184,0.13)';
  const chartAxis = { stroke: '#6b7f9e', fontSize: 11.5 };
  const tooltipStyle = {
    background: '#111c33', border: '1px solid #23324f', borderRadius: 9, fontSize: 12.5, color: '#e6edf7',
  };

  return (
    <>
      <Topbar
        title={t('report.title')}
        subtitle={t('report.subtitle')}
        actions={
          <button className="btn sm" onClick={exportCases} disabled={!cases.length}>
            <IconDownload style={{ width: 15, height: 15 }} />
            {t('report.export')}
          </button>
        }
      />
      <Page>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="inline">
            <div className="field" style={{ margin: 0, minWidth: 150 }}>
              <label htmlFor="period">{t('report.period')}</label>
              <select id="period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={7}>7 {t('common.days')}</option>
                <option value={14}>14 {t('common.days')}</option>
                <option value={30}>30 {t('common.days')}</option>
                <option value={60}>60 {t('common.days')}</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0, minWidth: 170 }}>
              <label htmlFor="disease">{t('common.disease')}</label>
              <select id="disease" value={diseaseId} onChange={(e) => setDiseaseId(e.target.value)}>
                <option value="all">{t('common.allF')}</option>
                {diseases.map((d) => (
                  <option key={d.id} value={d.id}>{diseaseName(d, lang)}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0, minWidth: 170 }}>
              <label htmlFor="region">{t('common.region')}</label>
              <select id="region" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                <option value="all">{t('common.allF')}</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          <div className="stat">
            <div className="stat-label">{t('common.newCases')}</div>
            <div className="stat-value">{formatNumber(totals.new_cases, lang)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">{t('common.underCare')}</div>
            <div className="stat-value">{formatNumber(totals.under_care, lang)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">{t('common.recovered')}</div>
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{formatNumber(totals.recovered, lang)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">{t('common.deaths')}</div>
            <div className="stat-value" style={{ color: 'var(--lvl5)' }}>{formatNumber(totals.deaths, lang)}</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div>
              <h3>{t('dash.trend')}</h3>
              <p>{days} {t('common.days')}</p>
            </div>
            <IconChart style={{ width: 18, height: 18, color: 'var(--primary)' }} />
          </div>
          <div style={{ height: 280 }}>
            {loading ? (
              <div className="center-screen" style={{ minHeight: 200 }}>
                <div className="spinner" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 6, right: 14, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={chartGrid} vertical={false} />
                  <XAxis dataKey="label" {...chartAxis} tickLine={false} axisLine={false} />
                  <YAxis {...chartAxis} tickLine={false} axisLine={false} width={50} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="new_cases" name={t('common.newCases')} stroke="#22d3ee" strokeWidth={2.2} dot={false} />
                  <Line type="monotone" dataKey="under_care" name={t('common.underCare')} stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="recovered" name={t('common.recovered')} stroke="#34d399" strokeWidth={1.8} dot={false} />
                  <Line type="monotone" dataKey="deaths" name={t('common.deaths')} stroke="#ef4444" strokeWidth={1.8} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>{t('common.hospitals')}</h3>
              <p>{byHospital.length} {t('common.hospitals').toLowerCase()}</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.hospital')}</th>
                  <th>{t('common.region')}</th>
                  <th>{t('common.level')}</th>
                  <th className="num">{t('common.newCases')}</th>
                  <th className="num">{t('common.underCare')}</th>
                  <th className="num">{t('common.deaths')}</th>
                </tr>
              </thead>
              <tbody>
                {byHospital.map((h) => (
                  <tr key={h.name}>
                    <td className="bold">{h.name}</td>
                    <td className="faint">{h.region} · {h.district}</td>
                    <td><LevelBadge level={h.level} lang={lang} size="sm" /></td>
                    <td className="num mono">{formatNumber(h.new_cases, lang)}</td>
                    <td className="num mono">{formatNumber(h.active, lang)}</td>
                    <td className="num mono">{formatNumber(h.deaths, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Page>
    </>
  );
}
