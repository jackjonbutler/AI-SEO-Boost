// src/audit/schema-type-map.ts
// Maps free-text businessType strings to schema.org @type values.
// Pure module — no I/O, no external dependencies.

/** Ordered keyword map (most-specific first). First match wins. */
export const BUSINESS_TYPE_MAP: Array<{ keywords: string[]; schemaType: string }> = [
  { keywords: ['real estate', 'realtor', 'mortgage'], schemaType: 'RealEstateAgent' },
  { keywords: ['online store', 'ecommerce', 'e-commerce', 'retail'], schemaType: 'OnlineStore' },
  { keywords: ['software', 'saas', 'platform', 'tool'], schemaType: 'SoftwareApplication' },
  { keywords: ['restaurant', 'cafe', 'coffee', 'bistro', 'diner', 'eatery'], schemaType: 'Restaurant' },
  { keywords: ['hotel', 'motel', 'inn', 'resort', 'lodge', 'hostel'], schemaType: 'LodgingBusiness' },
  { keywords: ['travel', 'tour', 'vacation', 'holiday'], schemaType: 'TravelAgency' },
  { keywords: ['dentist', 'dental'], schemaType: 'Dentist' },
  { keywords: ['doctor', 'physician', 'clinic', 'medical', 'health', 'hospital'], schemaType: 'MedicalBusiness' },
  { keywords: ['law', 'attorney', 'lawyer', 'legal'], schemaType: 'LegalService' },
  { keywords: ['gym', 'fitness', 'yoga', 'crossfit', 'pilates', 'sport'], schemaType: 'SportsActivityLocation' },
  { keywords: ['salon', 'barber', 'hair', 'beauty', 'spa', 'nail'], schemaType: 'HealthAndBeautyBusiness' },
];

/**
 * Schema.org types that are direct subtypes of LocalBusiness.
 * Used by checkSchemaMarkup to accept a LocalBusiness subtype as passing the LocalBusiness check.
 * NOTE: SoftwareApplication and OnlineStore are NOT here — they extend CreativeWork/Thing,
 * not LocalBusiness, so they require separate pass logic in schema.ts.
 */
export const LOCAL_BUSINESS_SUBTYPES = new Set([
  'Restaurant',
  'LodgingBusiness',
  'TravelAgency',
  'Dentist',
  'MedicalBusiness',
  'LegalService',
  'RealEstateAgent',
  'SportsActivityLocation',
  'HealthAndBeautyBusiness',
]);

/**
 * Maps a free-text businessType string to the most appropriate schema.org @type.
 * Case-insensitive keyword matching. First match wins (map is ordered most-specific first).
 * Returns 'LocalBusiness' as safe fallback when no keyword matches or input is undefined.
 */
export function inferSchemaType(businessType: string | undefined): string {
  if (!businessType) return 'LocalBusiness';
  const lower = businessType.toLowerCase();
  for (const { keywords, schemaType } of BUSINESS_TYPE_MAP) {
    if (keywords.some(kw => lower.includes(kw))) {
      return schemaType;
    }
  }
  return 'LocalBusiness';
}
