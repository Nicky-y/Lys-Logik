import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LeadIdSchema } from '../supabase/functions/_shared/contracts/operations.ts';
import {
  collectionForStatus,
  leadPath,
  readWorkspaceRoute,
} from '../operations/src/lead-navigation.ts';

const id = LeadIdSchema.parse('82b2db71-774d-47f7-bfe3-b386992320ce');
test('inbox is the default; saved status decides the home of each enquiry', () => {
  assert.equal(readWorkspaceRoute('').section.id, 'indbakke');
  assert.equal(readWorkspaceRoute('#/').section.id, 'indbakke');
  assert.equal(collectionForStatus('new'), 'inbox');
  for (const status of [
    'clarifying',
    'qualified',
    'scheduled',
    'completed',
    'invoiced',
    'paid',
  ] as const)
    assert.equal(collectionForStatus(status), 'cases');
  for (const status of ['rejected', 'outside_scope', 'cancelled'] as const)
    assert.equal(collectionForStatus(status), 'archive');
  assert.equal(leadPath(id, 'new'), `#/indbakke/leads/${id}`);
  assert.equal(leadPath(id, 'clarifying'), `#/sager/leads/${id}`);
  assert.equal(leadPath(id, 'rejected'), `#/sager/arkiv/leads/${id}`);
});
test('legacy notification, pipeline and calendar routes retain their guarded identities', () => {
  assert.equal(readWorkspaceRoute(`#/leads/${id}`).lead, id);
  assert.equal(readWorkspaceRoute('#/pipeline').section.id, 'sager');
  assert.equal(readWorkspaceRoute('#/archive').collection, 'archive');
  for (const prefix of ['calendar', 'kalender']) {
    const route = readWorkspaceRoute(`#/${prefix}/2026-09-15/leads/${id}`);
    assert.equal(route.day, '2026-09-15');
    assert.equal(route.lead, id);
    assert.equal(route.section.id, 'kalender');
  }
});
test('invalid deep-link identities and calendar dates do not enter a query', () => {
  for (const path of [
    '#/leads/not-an-id',
    '#/indbakke/leads/https://example.com',
    '#/sager/leads/%3Cscript%3E',
  ])
    assert.equal(readWorkspaceRoute(path).lead, undefined);
  for (const date of ['2026-02-30', '2019-09-15', '2101-01-01'])
    assert.equal(readWorkspaceRoute(`#/kalender/${date}`).day, undefined);
});
