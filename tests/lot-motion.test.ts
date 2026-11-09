import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatCount } from '../src/scripts/lot-motion';

test('count preserves localized precision and grouping and ends exactly', () => {
  assert.equal(formatCount('1 250,50', 0), '0,00');
  assert.equal(formatCount('1 250,50', 0.5), '625,25');
  assert.equal(formatCount('1 250,50', 1), '1 250,50');
  assert.equal(formatCount('1,250.50', 0.5), '625.25');
  assert.equal(formatCount('1,250.50', 1), '1,250.50');
});
