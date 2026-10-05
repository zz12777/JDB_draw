import fs from 'fs';
import { parseResponses, buildEntries } from '../js/parse.js';
const forms = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const k of ['men', 'women', 'social']) {
  const { kind, responses } = parseResponses(forms[k]);
  const { events, waitlist } = buildEntries(kind, responses);
  console.log('=====', k, kind, '回應', responses.length);
  responses.filter(r => r.notes.length).forEach(r => console.log('  列', r.rowNo, r.school, r.notes.join('；')));
  for (const [ev, list] of Object.entries(events)) {
    const schools = {};
    list.forEach(e => schools[e.school] = (schools[e.school] || 0) + 1);
    console.log(ev, list.length, '候補', waitlist[ev].length, JSON.stringify(schools));
    list.filter(e => e.flags.length).forEach(e => console.log('   ', e.school, e.name, e.flags.join(',')));
  }
}
