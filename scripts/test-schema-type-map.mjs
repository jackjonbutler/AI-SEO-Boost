// scripts/test-schema-type-map.mjs
// Assertion gate for inferSchemaType() — RED before implementation, GREEN after.
// Run: npm run build && node scripts/test-schema-type-map.mjs

import assert from 'node:assert/strict';
import { inferSchemaType } from '../dist/audit/schema-type-map.js';

// --- Defined type mappings ---
assert.strictEqual(inferSchemaType('saas'), 'SoftwareApplication', 'saas → SoftwareApplication');
assert.strictEqual(inferSchemaType('SaaS platform'), 'SoftwareApplication', 'SaaS platform → SoftwareApplication');
assert.strictEqual(inferSchemaType('restaurant'), 'Restaurant', 'restaurant → Restaurant');
assert.strictEqual(inferSchemaType('Italian Restaurant'), 'Restaurant', 'Italian Restaurant → Restaurant');
assert.strictEqual(inferSchemaType('ecommerce'), 'OnlineStore', 'ecommerce → OnlineStore');
assert.strictEqual(inferSchemaType('online store'), 'OnlineStore', 'online store → OnlineStore');
assert.strictEqual(inferSchemaType('travel agency'), 'TravelAgency', 'travel agency → TravelAgency');
assert.strictEqual(inferSchemaType('dentist'), 'Dentist', 'dentist → Dentist');
assert.strictEqual(inferSchemaType('law firm'), 'LegalService', 'law firm → LegalService');
assert.strictEqual(inferSchemaType('gym'), 'SportsActivityLocation', 'gym → SportsActivityLocation');
assert.strictEqual(inferSchemaType('hair salon'), 'HealthAndBeautyBusiness', 'hair salon → HealthAndBeautyBusiness');

// --- Fallback cases ---
assert.strictEqual(inferSchemaType('vehicle wrap shop'), 'LocalBusiness', 'vehicle wrap shop → LocalBusiness (no match)');
assert.strictEqual(inferSchemaType(undefined), 'LocalBusiness', 'undefined → LocalBusiness (safe fallback)');
assert.strictEqual(inferSchemaType(''), 'LocalBusiness', 'empty string → LocalBusiness');
assert.strictEqual(inferSchemaType('random business'), 'LocalBusiness', 'random business → LocalBusiness');

console.log('All 15 inferSchemaType assertions passed.');
