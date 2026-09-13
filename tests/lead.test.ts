import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateLead, type LeadInput } from '../src/lib/lead.ts';
import {
  LeadSchema,
  SubmissionKeySchema,
} from '../supabase/functions/_shared/contracts/lead.ts';
import {
  ServiceSchema,
  serviceLabels,
} from '../supabase/functions/_shared/contracts/service.ts';
import { services } from '../src/data/site.ts';

const valid: LeadInput = {
  name: 'Anna Jensen',
  email: 'anna@example.com',
  phone: '',
  postalCode: '2800',
  service: 'belysning',
  description: 'Jeg vil gerne have hjælp til lys over mit spisebord.',
  terms: true,
};

test('email is required; phone is optional', () => {
  assert.deepEqual(validateLead(valid), {});
  assert.ok(validateLead({ ...valid, email: '', phone: '12345678' }).email);
});
test('accepts Danish phone numbers with spaces and country prefix', () => {
  for (const phone of [
    '12345678',
    '12 34 56 78',
    '+45 12 34 56 78',
    '12-34-56-78',
  ]) {
    assert.deepEqual(validateLead({ ...valid, phone }), {});
  }
});
test('rejects malformed contact details', () => {
  for (const email of [
    'anna',
    'a@b',
    '12345678',
    'a @example.com',
    'a'.repeat(255) + '@example.com',
  ]) {
    assert.ok(validateLead({ ...valid, email }).email);
  }
  for (const phone of ['1234567', '+46 12345678', 'text12345678']) {
    assert.ok(validateLead({ ...valid, phone }).phone);
  }
});
test('requires four postcode digits and preserves leading zeroes', () => {
  assert.deepEqual(validateLead({ ...valid, postalCode: '0800' }), {});
  for (const postalCode of ['800', '28000', '28OO', '-800'])
    assert.ok(validateLead({ ...valid, postalCode }).postalCode);
});
test('accepts each available service and rejects unknown values', () => {
  for (const service of [
    'lampeopsaetning',
    'stikkontakter',
    'smart-home',
    'lysstyring-sensorer',
    'hvidevarer',
    'belysning',
    'forbedringer',
    'andet',
  ])
    assert.deepEqual(validateLead({ ...valid, service }), {});
  assert.ok(validateLead({ ...valid, service: 'unexpected' }).service);
});

test('each published catalogue choice is accepted by intake and has an operations label', () => {
  assert.equal(services.length, 5);
  for (const service of services) {
    assert.equal(ServiceSchema.parse(service.id), service.id);
    assert.equal(serviceLabels[service.id], service.label);
  }
});
test('requires explicit acknowledgement before work is agreed', () => {
  assert.equal(
    validateLead({ ...valid, terms: false }).terms,
    'Bekræft, at pris og omfang aftales, før arbejdet starter.',
  );
});
test('enforces name and description boundaries after trimming', () => {
  assert.ok(validateLead({ ...valid, name: ' A ' }).name);
  assert.ok(validateLead({ ...valid, name: 'a'.repeat(101) }).name);
  assert.ok(validateLead({ ...valid, description: '         ' }).description);
  assert.ok(
    validateLead({ ...valid, description: 'a'.repeat(1501) }).description,
  );
  assert.deepEqual(
    validateLead({ ...valid, name: ' Bo ', description: 'a'.repeat(10) }),
    {},
  );
  assert.deepEqual(
    validateLead({
      ...valid,
      name: 'a'.repeat(100),
      description: 'a'.repeat(1500),
    }),
    {},
  );
});
test('reports missing inputs together without mutating the input', () => {
  const input = Object.freeze({
    name: '',
    email: '',
    phone: '',
    postalCode: '',
    service: '',
    description: '',
    terms: false,
  });
  assert.deepEqual(Object.keys(validateLead(input)).sort(), [
    'description',
    'email',
    'name',
    'postalCode',
    'service',
    'terms',
  ]);
  assert.equal(input.name, '');
});
test('rejects injected status and requires guarded submission identities', () => {
  assert.equal(
    LeadSchema.safeParse({ ...valid, status: 'paid' }).success,
    false,
  );
  assert.equal(SubmissionKeySchema.safeParse('123').success, false);
  assert.equal(
    SubmissionKeySchema.safeParse('82b2db71-774d-47f7-bfe3-b386992320ce')
      .success,
    true,
  );
});
