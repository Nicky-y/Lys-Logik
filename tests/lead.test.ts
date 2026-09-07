import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateLead, type LeadInput } from '../src/lib/lead.ts';

const valid: LeadInput = {
  name: 'Anna Jensen',
  contact: 'anna@example.com',
  postalCode: '2800',
  service: 'belysning',
  description: 'Jeg vil gerne have hjælp til lys over mit spisebord.',
  terms: true,
};

test('accepts a complete pilot enquiry with email', () =>
  assert.deepEqual(validateLead(valid), {}));
test('accepts Danish phone numbers with spaces and country prefix', () => {
  for (const contact of [
    '12345678',
    '12 34 56 78',
    '+45 12 34 56 78',
    '12-34-56-78',
  ])
    assert.deepEqual(validateLead({ ...valid, contact }), {});
});
test('rejects malformed contact details', () => {
  for (const contact of [
    'anna',
    'a@b',
    '1234567',
    '+46 12345678',
    'text12345678',
    'a @example.com',
    'a'.repeat(255) + '@example.com',
  ])
    assert.ok(validateLead({ ...valid, contact }).contact);
});
test('requires four postcode digits and preserves leading zeroes', () => {
  assert.deepEqual(validateLead({ ...valid, postalCode: '0800' }), {});
  for (const postalCode of ['800', '28000', '28OO', '-800'])
    assert.ok(validateLead({ ...valid, postalCode }).postalCode);
});
test('accepts each available service and rejects unknown values', () => {
  for (const service of ['belysning', 'smart-home', 'forbedringer', 'andet'])
    assert.deepEqual(validateLead({ ...valid, service }), {});
  assert.ok(validateLead({ ...valid, service: 'unexpected' }).service);
});
test('requires explicit pilot terms acknowledgement', () =>
  assert.ok(validateLead({ ...valid, terms: false }).terms));
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
test('reports all missing inputs together without mutating input', () => {
  const input = Object.freeze({
    name: '',
    contact: '',
    postalCode: '',
    service: '',
    description: '',
    terms: false,
  });
  assert.deepEqual(Object.keys(validateLead(input)).sort(), [
    'contact',
    'description',
    'name',
    'postalCode',
    'service',
    'terms',
  ]);
  assert.equal(input.name, '');
});
