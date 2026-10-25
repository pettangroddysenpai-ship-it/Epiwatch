import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar as RBar, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { useI18n, diseaseName } from '../i18n/index.jsx';
import { useStore } from '../lib/store.jsx';
import { api, formatNumber, timeAgo, formatDate } from '../lib/api.js';
import { Page, Topbar, ConnectionBanner } from '../components/Shell.jsx';
import { StatCard, LevelBadge, Bar as MiniBar } from '../components/ui.jsx';
import { LEVELS, levelInfo, levelColor, severityClass } from '../lib/ui.js';
import {
  IconBell, IconUsers, IconTrend, IconHospital, IconAlert, IconGlobe, IconActivity, IconMap, IconClock, IconRefresh,
} from '../components/Icons.jsx';
import { usePolling } from '../lib/hooks.js';

const LEVEL_LABELS_FR = ['Aucun', 'Stable', 'À surveiller', 'Préoccupant', 'Élevé', 'Critique', 'Majeur'];
const LEVEL_LABELS_EN = ['None', 'Stable', 'Monitor', 'Concerning', 'High', 'Critical', 'Major'];

export function DashboardPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { overview, alerts, alertCounts, situation, diseases, isConnected, reloadReference, refresh } = useStore();
  const [series, setSeries] = useState([]);

  usePolling(() => {
    api.timeseries({ days: 30 }).then((r) => setSeries(r.series)).catch(() => undefined);
  }, 60000, series.length === 0);

  const levelData = useMemo(
    () =>
      LEVELS.map((l) => ({
        name: (lang === 'en' ? LEVEL_LABELS_EN : LEVEL_LABELS_FR)[l.level],
        level: l.level,
        value: overview?.by_level?.[l.level] ?? 0,
        color: l.color,
      })).filter((d) => d.value > 0 || d.level >= 4),
    [overview, lang],
  );

  const diseaseData = useMemo(
    () =>
      (overview?.by_disease ?? []).map((d) => ({
        ...d,
        label: lang === 'en' ? d.name_en : d.name,
      })),
    [overview, lang],
  );

  const trendData = useMemo(
    () => series.map((s) => ({ ...s, label: s.date.slice(5) })),
    [series],
  );

  const openAlerts = alerts.filter((a) => a.status !== 'resolved').slice(0, 6);
  const maxDisease = Math.max(1, ...diseaseData.map((d) => d.active));
  const hasTrendData = trendData.some((d) => Number(d.new_cases) > 0 || Number(d.under_care) > 0);

  const chartGrid = 'rgba(148,163,184,0.13)';
  const chartAxis = { stroke: '#6b7f9e', fontSize: 11.5 };

  return (
    <>
      <Topbar
        title={t('dash.title')}
        subtitle={t('app.shortTagline')}
        actions={
          <button className="btn sm refresh-btn" onClick={() => { refresh(); reloadReference(); }} aria-label={t('common.refresh')}>
            <IconRefresh className="refresh-ico" />
            <span className="refresh-text">{t('common.refresh')}</span>
          </button>
        }
      />
      <ConnectionBanner />
      <Page>
        {!overview ? (
          <div className="center-screen" style={{ minHeight: '50vh' }}>
            <div className="spinner" style={{ width: 28, height: 28 }} />
          </div>
        ) : (
          <>
            <div className="dash-update" role="status">
              <span className="dash-update-icon"><IconClock /></span>
              <span>
                {t('dash.lastUpdate')} : {timeAgo(overview.generated_at, lang)}
              </span>
            </div>

            {/* ── KPI ── */}
            <div className="grid grid-5" style={{ marginBottom: 16 }}>
              <StatCard
                accent
                icon={IconBell}
                iconTone="blue"
                label={t('dash.activeAlerts')}
                value={formatNumber(alertCounts.active, lang)}
                sub={`${alertCounts.critical} ${t('dash.critical').toLowerCase()}`}
                tone={alertCounts.critical > 0 ? 'var(--lvl5)' : undefined}
              />
              <StatCard
                icon={IconUsers}
                iconTone="green"
                label={t('dash.followedPatients')}
                value={formatNumber(overview.total_active, lang)}
                sub={`${formatNumber(overview.new_cases_window, lang)} ${t('common.newCases').toLowerCase()} (${overview.config.windowDays || 7} ${t('common.days')})`}
              />
              <StatCard
                icon={IconHospital}
                iconTone="violet"
                label={t('dash.hospitalsMonitored')}
                value={formatNumber(overview.hospitals, lang)}
                sub={`${overview.diseases} ${t('common.diseases').toLowerCase()}`}
              />
              <StatCard
                icon={IconGlobe}
                iconTone="orange"
                label={t('common.region')}
                value={formatNumber(overview.regions.length, lang)}
                sub={`${alertCounts.regional} ${t('public.zoneAlert').toLowerCase()}`}
              />
              <StatCard
                icon={IconAlert}
                iconTone="red"
                label={t('common.deaths')}
                value={formatNumber(overview.deaths_window, lang)}
                sub={`${t('report.period')}: ${overview.config.windowDays || 7} ${t('common.days')}`}
              />
            </div>

            {/* ── Graphiques ── */}
            <div className="grid grid-2" style={{ marginBottom: 16 }}>
              <div className="card trend-card">
                <div className="card-head">
                  <span className="stat-icon blue chart-icon-mobile">
                    <IconTrend style={{ width: 17, height: 17 }} />
                  </span>
                  <div>
                    <h3>{t('dash.trend')}</h3>
                    <p>{t('report.period')}: 30 {t('common.days')}</p>
                  </div>
                  <IconTrend className="chart-head-icon" style={{ width: 18, height: 18, color: 'var(--primary)' }} />
                </div>
                {hasTrendData ? (
                  <div className="chart-body">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradCases" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.55} />
                            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={chartGrid} vertical={false} />
                        <XAxis dataKey="label" {...chartAxis} tickLine={false} axisLine={false} />
                        <YAxis {...chartAxis} tickLine={false} axisLine={false} width={46} />
                        <Tooltip
                          contentStyle={{
                            background: '#111c33', border: '1px solid #23324f', borderRadius: 9,
                            fontSize: 12.5, color: '#e6edf7',
                          }}
                          formatter={(v, n) => [formatNumber(v, lang), n === 'new_cases' ? t('common.newCases') : t('common.underCare')]}
                        />
                        <Area type="monotone" dataKey="new_cases" stroke="#22d3ee" strokeWidth={2.2} fill="url(#gradCases)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="chart-empty">{t('dash.noData')}</div>
                )}
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>{t('dash.byDisease')}</h3>
                    <p>{t('common.underCare')}</p>
                  </div>
                  <IconActivity style={{ width: 18, height: 18, color: 'var(--accent)' }} />
                </div>
                <div style={{ height: 230 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={diseaseData} layout="vertical" margin={{ top: 4, right: 16, left: 6, bottom: 0 }}>
                      <CartesianGrid stroke={chartGrid} horizontal={false} />
                      <XAxis type="number" {...chartAxis} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="label" {...chartAxis} tickLine={false} axisLine={false} width={104} />
                      <Tooltip
                        contentStyle={{
                          background: '#111c33', border: '1px solid #23324f', borderRadius: 9,
                          fontSize: 12.5, color: '#e6edf7',
                        }}
                        formatter={(v) => [formatNumber(v, lang), t('common.underCare')]}
                      />
                      <RBar dataKey="active" radius={[0, 5, 5, 0]} barSize={18}>
                        {diseaseData.map((d) => (
                          <Cell key={d.disease_id} fill={d.color} />
                        ))}
                      </RBar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-3" style={{ marginBottom: 16 }}>
              {/* ── Répartition des niveaux ── */}
              <div className="card">
                <div className="card-head">
                  <h3>{t('dash.alertDistribution')}</h3>
                </div>
                <div style={{ height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={levelData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={44}
                        outerRadius={68}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {levelData.map((d) => (
                          <Cell key={d.level} fill={d.color} />
                        ))}
                      </Pie>
                      <Legend
                        verticalAlign="bottom"
                        height={30}
                        formatter={(v) => <span style={{ fontSize: 11.5, color: '#9fb0cc' }}>{v}</span>}
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#111c33', border: '1px solid #23324f', borderRadius: 9, fontSize: 12.5,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Régions ── */}
              <div className="card" style={{ gridColumn: 'span 2' }}>
                <div className="card-head">
                  <div>
                    <h3>{t('dash.regions')}</h3>
                    <p>{t('dash.byLevel')}</p>
                  </div>
                  <Link className="btn sm ghost" to="/map">
                    <IconMap style={{ width: 15, height: 15 }} />
                    {t('nav.map')}
                  </Link>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('common.region')}</th>
                        <th>{t('common.level')}</th>
                        <th className="num">{t('common.underCare')}</th>
                        <th className="num">{t('alerts.hospitalsConcerned')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.regions.map((r) => (
                        <tr key={r.region_id}>
                          <td>
                            <span className="bold">{r.region_name}</span>
                          </td>
                          <td>
                            <LevelBadge level={r.max_level} lang={lang} />
                          </td>
                          <td className="num mono">{formatNumber(r.active, lang)}</td>
                          <td className="num mono">{r.alert_hospitals}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ── Alertes récentes ── */}
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>{t('dash.recentAlerts')}</h3>
                  <p>{alertCounts.active} {t('status.active').toLowerCase()}</p>
                </div>
                <Link className="btn sm ghost" to="/alerts">
                  {t('common.viewAll')}
                </Link>
              </div>
              {openAlerts.length === 0 ? (
                <div className="empty">{t('alerts.empty')}</div>
              ) : (
                <div className="col" style={{ gap: 10 }}>
                  {openAlerts.map((alert) => (
                    <Link
                      key={alert.id}
                      to="/alerts"
                      className={`alert-card ${severityClass(alert.level)}`}
                      style={{ display: 'flex' }}
                    >
                      <div className="alert-body">
                        <div className="alert-title row wrap" style={{ gap: 8 }}>
                          <LevelBadge level={alert.level} lang={lang} size="sm" />
                          <span>{alert.title}</span>
                        </div>
                        <div className="alert-msg">{alert.message}</div>
                        <div className="alert-meta">
                          <span className={`badge soft`}>{t(`alerts.scope.${alert.scope}`)}</span>
                          <span>{alert.scope_name}</span>
                          <span>·</span>
                          <span>{diseaseName({ name: alert.disease_name, name_en: alert.disease_name_en }, lang)}</span>
                          <span>·</span>
                          <span>{timeAgo(alert.updated_at, lang)}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </Page>
    </>
  );
}
