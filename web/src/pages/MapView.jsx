import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { useI18n, diseaseName } from '../i18n/index.jsx';
import { useStore } from '../lib/store.jsx';
import { formatNumber, formatDate } from '../lib/api.js';
import { Page, Topbar, ConnectionBanner } from '../components/Shell.jsx';
import { levelInfo, levelColor } from '../lib/ui.js';
import { IconMap, IconActivity, IconRefresh } from '../components/Icons.jsx';

const CAMEROON_CENTER = [5.6, 12.0];

/**
 * Carte interactive Leaflet.
 * - Un marqueur agrégé par hôpital (niveau = max sur les maladies).
 * - Taille et intensité du signal proportionnelles au niveau d'alerte.
 * - Clic : détail par maladie et coordonnées de l'établissement.
 */
export function MapPage() {
  const { t, lang } = useI18n();
  const { situation, diseases, hospitals, isConnected } = useStore();

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [heatMode, setHeatMode] = useState(true);
  const [diseaseFilter, setDiseaseFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState(0);
  const [selected, setSelected] = useState(null);

  /* ── Initialisation de la carte ── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      center: CAMEROON_CENTER,
      zoom: 6,
      zoomControl: true,
      preferCanvas: false,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 120);
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* ── Agrégation par hôpital ── */
  const hospitalStates = useMemo(() => {
    const byHospital = new Map();
    for (const s of situation) {
      if (diseaseFilter !== 'all' && s.disease_id !== Number(diseaseFilter)) continue;
      const current = byHospital.get(s.hospital_id) || {
        hospital_id: s.hospital_id,
        name: s.hospital_name,
        type: s.hospital_type,
        lat: s.lat,
        lng: s.lng,
        zone_name: s.zone_name,
        region_name: s.region_name,
        level: 0,
        total_active: 0,
        total_new: 0,
        diseases: [],
      };
      current.total_active += s.active;
      current.total_new += s.new_cases_window;
      current.diseases.push(s);
      if (s.level > current.level) current.level = s.level;
      byHospital.set(s.hospital_id, current);
    }
    for (const h of byHospital.values()) {
      h.diseases.sort((a, b) => b.level - a.level || b.active - a.active);
    }
    return [...byHospital.values()].sort((a, b) => b.level - a.level);
  }, [situation, diseaseFilter]);

  const visible = useMemo(
    () => hospitalStates.filter((h) => h.level >= levelFilter),
    [hospitalStates, levelFilter],
  );

  /* ── Rendu des marqueurs ── */
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    for (const h of visible) {
      const info = levelInfo(h.level);
      const size = 16 + h.level * 4.2;
      const isHot = h.level >= 4;

      const icon = L.divIcon({
        className: 'epi-marker-wrap',
        iconSize: [size + 26, size + 26],
        iconAnchor: [(size + 26) / 2, (size + 26) / 2],
        html: `
          <div class="epi-marker" style="width:${size + 26}px;height:${size + 26}px;color:${info.color}">
            ${heatMode && h.level >= 2
              ? `<span class="pulse"></span><span class="pulse d2"></span>${h.level >= 5 ? '<span class="pulse d3"></span>' : ''}`
              : ''}
            <div class="core" style="width:${size}px;height:${size}px;background:${info.color};
              ${isHot ? `box-shadow:0 0 ${6 + h.level * 2}px ${info.color};` : ''}">
              ${h.level}
            </div>
          </div>`,
      });

      const marker = L.marker([h.lat, h.lng], { icon, riseOnHover: true });
      marker.bindPopup(buildPopup(h, lang, t), { maxWidth: 300, className: 'epi-popup' });
      marker.on('click', () => setSelected(h));
      marker.addTo(layer);
    }
  }, [visible, heatMode, lang, t]);

  /* ── Ajustement de la vue quand les filtres changent fortement ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !visible.length) return;
    if (diseaseFilter !== 'all') {
      const group = L.featureGroup(visible.map((h) => L.marker([h.lat, h.lng])));
      map.fitBounds(group.getBounds().pad(0.25), { animate: true });
    }
  }, [diseaseFilter, visible]);

  const stats = useMemo(() => {
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const h of hospitalStates) counts[h.level]++;
    return counts;
  }, [hospitalStates]);

  return (
    <>
      <Topbar
        title={t('map.title')}
        subtitle={t('map.subtitle')}
        actions={
          <button className="btn sm ghost" onClick={() => setHeatMode((v) => !v)}>
            <IconActivity style={{ width: 15, height: 15 }} />
            {t('map.heat')}: {heatMode ? 'ON' : 'OFF'}
          </button>
        }
      />
      <ConnectionBanner />
      <Page>
        <div className="map-shell">
          <div ref={containerRef} className="map-canvas" />
        </div>

        <div className="grid grid-2" style={{ marginTop: 16, gap: 16 }}>
          {/* Légende */}
          <div className="card">
            <div className="card-head">
              <h4>{t('map.legend')}</h4>
            </div>
            <div className="level-legend">
              {[0, 1, 2, 3, 4, 5, 6].map((lvl) => {
                const info = levelInfo(lvl);
                return (
                  <div className="legend-row" key={lvl}>
                    <span
                      className="legend-swatch"
                      style={{
                        background: info.color,
                        width: 12 + lvl * 2.1,
                        height: 12 + lvl * 2.1,
                        borderRadius: '50%',
                        boxShadow: lvl >= 4 ? `0 0 ${lvl * 2}px ${info.color}` : undefined,
                      }}
                    />
                    <span>
                      {lvl} · {lang === 'en' ? info.labelEn : info.labelFr}
                    </span>
                    <span className="faint" style={{ marginLeft: 'auto' }}>{stats[lvl]}</span>
                  </div>
                );
              })}
            </div>
            <div className="divider" />
            <div className="row between tiny faint">
              <span>{visible.length} {t('common.hospitals').toLowerCase()}</span>
              <span className={isConnected ? '' : 'bold'}>{isConnected ? t('nav.live') : t('nav.offline')}</span>
            </div>
          </div>

          {/* Filtres */}
          <div className="card">
            <div className="card-head">
              <h4>{t('common.filter')}</h4>
            </div>
            <div className="col" style={{ gap: 12 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="diseaseFilter">{t('map.filterDisease')}</label>
                <select
                  id="diseaseFilter"
                  value={diseaseFilter}
                  onChange={(e) => setDiseaseFilter(e.target.value)}
                >
                  <option value="all">{t('common.allF')}</option>
                  {diseases.map((d) => (
                    <option key={d.id} value={d.id}>
                      {diseaseName(d, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="levelFilter">{t('admin.persistMin')}</label>
                <select
                  id="levelFilter"
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(Number(e.target.value))}
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((l) => (
                    <option key={l} value={l}>
                      {l === 0 ? t('common.allF') : `≥ ${l} · ${lang === 'en' ? levelInfo(l).labelEn : levelInfo(l).labelFr}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Synthèse par maladie */}
        {diseaseFilter !== 'all' && selected == null && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <h3>{t('dash.byDisease')}</h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('common.hospital')}</th>
                    <th>{t('common.district')}</th>
                    <th>{t('common.level')}</th>
                    <th className="num">{t('common.underCare')}</th>
                    <th className="num">{t('common.newCases')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible
                    .filter((h) => h.diseases.length)
                    .map((h) => {
                      const d = h.diseases[0];
                      return (
                        <tr key={h.hospital_id}>
                          <td className="bold">{h.name}</td>
                          <td className="faint">{h.zone_name}</td>
                          <td>
                            <span
                              className="badge"
                              style={{ background: levelColor(d.level), color: d.level <= 2 ? '#0f172a' : '#fff' }}
                            >
                              {d.level}
                            </span>
                          </td>
                          <td className="num mono">{formatNumber(d.active, lang)}</td>
                          <td className="num mono">{formatNumber(d.new_cases_window, lang)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Page>
    </>
  );
}

function buildPopup(h, lang, t) {
  const rows = h.diseases
    .slice(0, 4)
    .map(
      (d) => `
      <div class="popup-row">
        <span>${diseaseName({ name: d.disease_name, name_en: d.disease_name_en }, lang)}</span>
        <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;
          background:${levelColor(d.level)};margin-right:5px"></span>${d.active} ${t('common.patients')}</span>
      </div>`,
    )
    .join('');

  return `
    <div class="popup-card">
      <h4>${h.name}</h4>
      <div class="sub">${h.zone_name} · ${h.region_name}</div>
      <div class="popup-row">
        <span>${t('common.level')}</span>
        <span style="color:${levelColor(h.level)}">${h.level} · ${lang === 'en' ? levelInfo(h.level).labelEn : levelInfo(h.level).labelFr}</span>
      </div>
      <div class="popup-row">
        <span>${t('common.underCare')} (${t('common.total').toLowerCase()})</span>
        <span>${h.total_active}</span>
      </div>
      <div class="popup-row">
        <span>${t('common.diseases')}</span>
        <span>${h.diseases.length}</span>
      </div>
      <div class="popup-row">
        <span>${t('common.newCases')} (7j)</span>
        <span>${h.total_new}</span>
      </div>
      ${rows}
    </div>`;
}
