import { useI18n } from '../i18n/index.jsx';
import { useStore } from '../lib/store.jsx';
import { Page, Topbar } from '../components/Shell.jsx';
import { LEVELS } from '../lib/ui.js';
import { IconShield, IconPulse, IconMap, IconBell, IconGlobe } from '../components/Icons.jsx';

export function AboutPage() {
  const { t, lang } = useI18n();
  const { overview } = useStore();

  const fr = lang === 'fr';

  return (
    <>
      <Topbar title={t('nav.about')} subtitle={t('app.tagline')} />
      <Page>
        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="row" style={{ gap: 13, marginBottom: 14 }}>
              <div
                style={{
                  width: 48, height: 48, borderRadius: 13, flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-deep))',
                  display: 'grid', placeItems: 'center',
                }}
              >
                <IconShield style={{ width: 26, height: 26, color: '#04121a' }} />
              </div>
              <div>
                <h3 style={{ fontSize: 18 }}>ÉpiWatch</h3>
                <p className="small faint" style={{ margin: 0 }}>{t('app.org')}</p>
              </div>
            </div>
            <p className="small muted" style={{ lineHeight: 1.7 }}>
              {fr
                ? 'ÉpiWatch est une plateforme de surveillance sanitaire et d’alerte épidémiologique en temps réel. Les établissements de santé déclarent les cas de maladies ; la plateforme agrège les données, les cartographie et déclenche automatiquement des alertes graduées du niveau local au niveau régional.'
                : 'ÉpiWatch is a real-time health surveillance and outbreak alerting platform. Health facilities report disease cases; the platform aggregates the data, maps it and automatically triggers graded alerts from local to regional level.'}
            </p>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>{fr ? 'Problématique' : 'Problem statement'}</h3>
              <IconGlobe style={{ width: 18, height: 18, color: 'var(--primary)' }} />
            </div>
            <p className="small muted" style={{ lineHeight: 1.7 }}>
              {fr
                ? 'Comment centraliser les données sanitaires de plusieurs hôpitaux, détecter rapidement les augmentations inhabituelles du nombre de cas et informer les professionnels de santé ainsi que les populations concernées ?'
                : 'How can health data from multiple hospitals be centralised, unusual rises in cases detected quickly, and both health professionals and affected populations informed?'}
            </p>
            <div className="divider" />
            <div className="grid grid-2" style={{ gap: 12 }}>
              <div>
                <div className="tiny faint">{fr ? 'Hôpitaux' : 'Hospitals'}</div>
                <div className="bold" style={{ fontSize: 22 }}>{overview?.hospitals ?? (fr ? 'Non disponible' : 'Not available')}</div>
              </div>
              <div>
                <div className="tiny faint">{t('common.diseases')}</div>
                <div className="bold" style={{ fontSize: 22 }}>{overview?.diseases ?? (fr ? 'Non disponible' : 'Not available')}</div>
              </div>
              <div>
                <div className="tiny faint">{t('common.region')}</div>
                <div className="bold" style={{ fontSize: 22 }}>{overview?.regions.length ?? (fr ? 'Non disponible' : 'Not available')}</div>
              </div>
              <div>
                <div className="tiny faint">{t('dash.activeAlerts')}</div>
                <div className="bold" style={{ fontSize: 22 }}>{overview?.alerts.active ?? (fr ? 'Non disponible' : 'Not available')}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Échelle des niveaux ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div>
              <h3>{fr ? 'Échelle des niveaux d’alerte' : 'Alert level scale'}</h3>
              <p>{fr ? 'Sept niveaux, chacun associé à une action.' : 'Seven levels, each with an associated action.'}</p>
            </div>
            <IconPulse style={{ width: 18, height: 18, color: 'var(--primary)' }} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.level')}</th>
                  <th>{fr ? 'Signification' : 'Meaning'}</th>
                  <th>{fr ? 'Action recommandée' : 'Recommended action'}</th>
                </tr>
              </thead>
              <tbody>
                {LEVELS.map((l) => (
                  <tr key={l.level}>
                    <td>
                      <span className="row" style={{ gap: 9 }}>
                        <span className="dot" style={{ background: l.color, width: 13, height: 13 }} />
                        <span className="bold mono">{l.level}</span>
                      </span>
                    </td>
                    <td className="bold small">{fr ? l.labelFr : l.labelEn}</td>
                    <td className="small muted">{t(`level.${l.level}.action`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Fonctionnalités ── */}
        <div className="grid grid-3">
          {[
            {
              icon: IconMap,
              title: fr ? 'Carte interactive' : 'Interactive map',
              text: fr
                ? 'Marqueurs dont la taille et l’intensité reflètent le niveau d’alerte, filtrables par maladie et par zone.'
                : 'Markers whose size and intensity reflect the alert level, filterable by disease and area.',
            },
            {
              icon: IconBell,
              title: fr ? 'Alertes graduées' : 'Graded alerts',
              text: fr
                ? 'Création automatique d’alertes locales, de district et régionales selon des seuils configurables.'
                : 'Automatic creation of local, district and regional alerts based on configurable thresholds.',
            },
            {
              icon: IconPulse,
              title: fr ? 'Temps réel' : 'Real time',
              text: fr
                ? 'Chaque déclaration met à jour le tableau de bord et les téléphones abonnés instantanément.'
                : 'Every report instantly updates the dashboard and subscribed phones.',
            },
          ].map(({ icon: Icon, title, text }) => (
            <div className="card" key={title}>
              <div
                style={{
                  width: 40, height: 40, borderRadius: 11, marginBottom: 12,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  display: 'grid', placeItems: 'center', color: 'var(--primary)',
                }}
              >
                <Icon style={{ width: 20, height: 20 }} />
              </div>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>{title}</h3>
              <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>{text}</p>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: 16, textAlign: 'center' }}>
          <p className="small faint" style={{ margin: 0 }}>
            {fr
              ? 'Prototype académique · Concours INNOVA · Les données patients ne sont jamais stockées ; seules des données agrégées et fictives sont utilisées.'
              : 'Academic prototype · INNOVA competition · Patient data is never stored; only aggregated, fictitious data is used.'}
          </p>
        </div>
      </Page>
    </>
  );
}
