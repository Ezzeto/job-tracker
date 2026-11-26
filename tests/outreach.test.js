'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../lib/outreach.js');

const home = [51.872, 0.159]; // Bishop's Stortford
const el = (id, tags, lat, lon) => ({ type: 'node', id, lat, lon, tags });

test('OpenStreetMap: types, distance, contacts; primary schools and duplicates are left out', () => {
  const list = O.fromOsm([
    el(1, { amenity: 'college', name: 'Harlow College', website: 'harlow-college.ac.uk', email: 'it@harlow-college.ac.uk' }, 51.768, 0.095),
    el(2, { amenity: 'school', name: 'Thorley Hill Primary School' }, 51.86, 0.16),
    el(3, { amenity: 'school', name: 'Birchwood High School', 'addr:city': "Bishop's Stortford" }, 51.88, 0.18),
    el(4, { amenity: 'school', name: 'Birchwood High School', 'addr:city': "Bishop's Stortford" }, 51.88, 0.18),
    el(5, { office: 'it', name: 'Stortford IT Ltd' }, 51.87, 0.16),
    { type: 'way', id: 6, center: { lat: 51.77, lon: 0.09 }, tags: { amenity: 'hospital', name: 'Princess Alexandra Hospital' } },
  ], home);
  assert.deepEqual(list.map(e => e.type), ['college', 'school', 'it', 'hospital']);
  const c = list[0];
  assert.equal(c.website, 'https://harlow-college.ac.uk');
  assert.equal(c.email, 'it@harlow-college.ac.uk');
  assert.ok(c.km > 11 && c.km < 14, String(c.km));
  assert.equal(O.fromOsm([el(2, { amenity: 'school', name: 'Thorley Hill Primary School' }, 51.86, 0.16)], home, { primary: true }).length, 1);
});

test('today\'s five: promising and near first; contacted and skipped ones are not offered', () => {
  const list = [
    { id: 'a', type: 'computer', km: 2, status: 'todo' },
    { id: 'b', type: 'college', km: 9, status: 'todo' },
    { id: 'c', type: 'college', km: 3, status: 'sent' },
    { id: 'd', type: 'school', km: 4, status: 'todo', email: 'x@y.sch.uk' },
    { id: 'e', type: 'school', km: 4, status: 'todo', skip: true },
  ];
  assert.deepEqual(O.queue(list, 3).map(e => e.id), ['d', 'b', 'a']);
});

test('a second email is due 7 days after the first, once', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  const list = [
    { id: 'a', status: 'sent', contactedAt: '2026-11-18' },
    { id: 'b', status: 'sent', contactedAt: '2026-11-22' },
    { id: 'c', status: 'sent', contactedAt: '2026-11-10', followedAt: '2026-11-18' },
    { id: 'd', status: 'replied', contactedAt: '2026-11-01' },
  ];
  assert.deepEqual(O.followUpsDue(list, now).map(e => e.id), ['a']);
});

test('merge keeps the later change; only touched employers go to the sheet; domains for replies', () => {
  const m = O.merge([{ id: 'x', status: 'todo', upd: 1 }, { id: 'y', status: 'sent', upd: 5 }], [{ id: 'x', status: 'sent', upd: 3 }, { id: 'y', status: 'todo', upd: 2 }]);
  assert.deepEqual(m.map(e => e.status), ['sent', 'sent']);
  assert.deepEqual(O.touched([{ id: 'a', status: 'todo', src: 'osm' }, { id: 'b', status: 'sent', src: 'osm' }, { id: 'c', status: 'todo', src: 'user' }]).map(e => e.id), ['b', 'c']);
  assert.equal(O.domainOf('IT Team <it@harlow-college.ac.uk>'.match(/<(.*)>/)[1]), 'harlow-college.ac.uk');
  assert.equal(O.domainOf('https://www.birchwoodhigh.org/vacancies'), 'birchwoodhigh.org');
  assert.equal(O.domainOf('someone@gmail.com'), '');
  assert.match(O.overpassQuery(51.87, 0.16, 30), /around:30000,51.87,0.16/);
});
