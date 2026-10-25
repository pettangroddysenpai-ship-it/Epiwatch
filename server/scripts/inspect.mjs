import { overview, listAlerts } from '../src/alerts.js';

const o = overview();
console.log('Total actifs:', o.total_active, '| nouveaux 7j:', o.new_cases_window);
console.log('Par niveau:', o.by_level);
console.log('Alertes:', o.alerts);
console.log('Regions:', o.regions.slice(0, 5));
const alerts = listAlerts({ limit: 60 }).filter((x) => x.status !== 'resolved');
console.log('--- alertes ouvertes:', alerts.length);
for (const al of alerts) {
  console.log(
    `  [L${al.level}] ${al.scope}/${al.scope_name} | ${al.disease_name} | hosp=${al.hospital_count} | cases=${al.total_cases} | ${al.status}`,
  );
}
