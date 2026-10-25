import { useMemo, useState } from 'react';
import { useI18n, diseaseName } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useStore } from '../lib/store.jsx';
import { api, formatNumber, timeAgo } from '../lib/api.js';
import { Page, Topbar } from '../components/Shell.jsx';
import { Empty, LevelBadge, Tabs, ConfirmButton } from '../components/ui.jsx';
import { canAck, levelInfo, severityClass } from '../lib/ui.js';
import { IconBell, IconCheck, IconShieldOff } from '../components/Icons.jsx';

export function AlertsPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { alerts, alertCounts, diseases, refresh } = useStore();

  const [tab, setTab] = useState('open');
  const [scope, setScope] = useState('all');
  const [diseaseId, setDiseaseId] = useState('all');
  const [minLevel, setMinLevel] = useState(0);
  const [busyId, setBusyId] = useState(null);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (tab === 'open' && a.status === 'resolved') return false;
      if (tab === 'active' && a.status !== 'active') return false;
      if (tab === 'acknowledged' && a.status !== 'acknowledged') return false;
      if (tab === 'resolved' && a.status !== 'resolved') return false;
      if (scope !== 'all' && a.scope !== scope) return false;
      if (diseaseId !== 'all' && a.disease_id !== Number(diseaseId)) return false;
      if (a.level < minLevel) return false;
      return true;
    });
  }, [alerts, tab, scope, diseaseId, minLevel]);

  const counts = useMemo(
    () => ({
      open: alerts.filter((a) => a.status !== 'resolved').length,
      active: alerts.filter((a) => a.status === 'active').length,
      acknowledged: alerts.filter((a) => a.status === 'acknowledged').length,
      resolved: alerts.filter((a) => a.status === 'resolved').length,
    }),
    [alerts],
  );

  const handleAck = async (alert, status) => {
    setBusyId(alert.id);
    try {
      await api.ackAlert(alert.id, status);
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Topbar
        title={t('alerts.title')}
        subtitle={t('alerts.subtitle')}
        actions={
          <span className="badge soft">
            <IconBell style={{ width: 13, height: 13 }} />
            {alertCounts.active} {t('status.active').toLowerCase()}
          </span>
        }
      />
      <Page>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'open', label: t('status.open'), count: counts.open },
            { id: 'active', label: t('status.active'), count: counts.active },
            { id: 'acknowledged', label: t('status.acknowledged'), count: counts.acknowledged },
            { id: 'resolved', label: t('status.resolved'), count: counts.resolved },
          ]}
        />

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="inline">
            <div className="field" style={{ margin: 0, minWidth: 150 }}>
              <label htmlFor="scopeFilter">{t('common.level')}</label>
              <select id="scopeFilter" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="all">{t('common.allM')}</option>
                <option value="hospital">{t('alerts.scope.hospital')}</option>
                <option value="district">{t('alerts.scope.district')}</option>
                <option value="region">{t('alerts.scope.region')}</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0, minWidth: 160 }}>
              <label htmlFor="diseaseFilter">{t('common.disease')}</label>
              <select id="diseaseFilter" value={diseaseId} onChange={(e) => setDiseaseId(e.target.value)}>
                <option value="all">{t('common.allF')}</option>
                {diseases.map((d) => (
                  <option key={d.id} value={d.id}>{diseaseName(d, lang)}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0, minWidth: 140 }}>
              <label htmlFor="minLevel">{t('notif.minLevel')}</label>
              <select id="minLevel" value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))}>
                {[0, 2, 3, 4, 5, 6].map((l) => (
                  <option key={l} value={l}>
                    {l === 0 ? t('common.allM') : `≥ ${l}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="card">
            <Empty icon={IconShieldOff} title={t('alerts.empty')} />
          </div>
        ) : (
          <div className="col" style={{ gap: 10 }}>
            {filtered.map((alert) => (
              <div key={alert.id} className={`alert-card ${severityClass(alert.level)}${alert.status === 'resolved' ? ' resolved' : ''}`}>
                <div className="alert-body">
                  <div className="row wrap" style={{ gap: 9, marginBottom: 4 }}>
                    <LevelBadge level={alert.level} lang={lang} />
                    <span className="bold" style={{ fontSize: 14 }}>{alert.title}</span>
                  </div>
                  <div className="alert-msg">{alert.message}</div>
                  {alert.action && (
                    <div className="small" style={{ color: 'var(--text-faint)', marginTop: 5 }}>
                      → {alert.action}
                    </div>
                  )}
                  <div className="alert-meta">
                    <span className="badge ghost">{t(`alerts.scope.${alert.scope}`)}</span>
                    <span className="bold">{alert.scope_name}</span>
                    <span>·</span>
                    <span>{diseaseName({ name: alert.disease_name, name_en: alert.disease_name_en }, lang)}</span>
                    {alert.scope !== 'hospital' && (
                      <>
                        <span>·</span>
                        <span>
                          {alert.hospital_count} {t('alerts.hospitalsConcerned')}
                        </span>
                      </>
                    )}
                    <span>·</span>
                    <span>{formatNumber(alert.total_cases, lang)} {t('common.patients').toLowerCase()}</span>
                    <span>·</span>
                    <span>{timeAgo(alert.updated_at, lang)}</span>
                    <span
                      className={`badge ${alert.status === 'active' ? 'lvl-3' : alert.status === 'resolved' ? 'soft' : 'ghost'}`}
                    >
                      {t(`status.${alert.status}`)}
                    </span>
                  </div>
                </div>

                {canAck(user) && alert.status !== 'resolved' && (
                  <div className="alert-actions">
                    {alert.status === 'active' && (
                      <button
                        className="btn sm primary"
                        disabled={busyId === alert.id}
                        onClick={() => handleAck(alert, 'acknowledged')}
                      >
                        <IconCheck style={{ width: 14, height: 14 }} />
                        {t('alerts.ack')}
                      </button>
                    )}
                    <ConfirmButton
                      className="btn sm danger"
                      onConfirm={() => handleAck(alert, 'resolved')}
                      confirmLabel={t('common.confirm')}
                    >
                      {t('alerts.resolve')}
                    </ConfirmButton>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Page>
    </>
  );
}
