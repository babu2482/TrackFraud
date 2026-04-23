/**
 * Shared Zod validation schemas for API route inputs.
 * Centralizes input validation to prevent injection attacks and ensure data integrity.
 */

import { z } from 'zod';

// ============================================
// Search Validation
// ============================================

/** Pagination parameters */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

/** Search query parameters */
export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(200).optional().default(''),
  category: z.string().max(50).optional(),
  state: z.string().max(10).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(['relevance', 'name', 'date', 'risk_score']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

// ============================================
// Charity Validation
// ============================================

export const CharitySearchSchema = z.object({
  query: z.string().min(1).max(200).optional(),
  ein: z.string().regex(/^\d{2}[-]?\d{7}$/).optional(),
  ntee_code: z.string().max(10).optional(),
  state: z.string().max(10).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const CharityEINSchema = z.object({
  ein: z.string().min(1),
});

// ============================================
// Corporate Validation
// ============================================

export const CorporateSearchSchema = z.object({
  query: z.string().min(1).max(200).optional(),
  cik: z.string().regex(/^\d{5,10}$/).optional(),
  state: z.string().max(10).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const CorporateCIKSchema = z.object({
  cik: z.string().min(1),
});

// ============================================
// Government Validation
// ============================================

export const GovernmentSearchSchema = z.object({
  query: z.string().min(1).max(200).optional(),
  agency: z.string().max(100).optional(),
  year: z.coerce.number().int().min(2000).max(new Date().getFullYear() + 1).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ============================================
// Political Validation
// ============================================

export const PoliticalSearchSchema = z.object({
  query: z.string().min(1).max(200).optional(),
  chamber: z.enum(['senate', 'house']).optional(),
  state: z.string().max(10).optional(),
  party: z.string().max(50).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const PoliticalCandidateSchema = z.object({
  id: z.string().min(1),
});

export const PoliticalCommitteeSchema = z.object({
  id: z.string().min(1),
});

// ============================================
// Healthcare Validation
// ============================================

export const HealthcareSearchSchema = z.object({
  query: z.string().min(1).max(200).optional(),
  provider_type: z.string().max(100).optional(),
  state: z.string().max(10).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ============================================
// Fraud Score Validation
// ============================================

export const FraudScoreEntitySchema = z.object({
  ein: z.string().regex(/^\d{2}[-]?\d{7}$/).optional(),
  cik: z.string().regex(/^\d{5,10}$/).optional(),
  entity_id: z.string().min(1).optional(),
  entity_type: z.enum(['charity', 'corporation', 'government', 'political', 'healthcare']).optional(),
});

// ============================================
// Tip/Report Validation
// ============================================

export const TipSubmissionSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(20).max(5000),
  category: z.enum(['charity', 'corporation', 'government', 'political', 'healthcare', 'consumer']),
  entity_name: z.string().min(1).max(200).optional(),
  entity_id: z.string().max(50).optional(),
  reporter_email: z.string().email().max(200).optional().or(z.literal('')),
  attachments: z.array(z.string().max(500)).max(5).optional(),
});

// ============================================
// Subscription Validation
// ============================================

export const SubscriptionSchema = z.object({
  email: z.string().email(),
  categories: z.array(z.string()).max(10).optional(),
  frequency: z.enum(['instant', 'daily', 'weekly']).optional(),
});

// ============================================
// Type Exports
// ============================================

export type PaginationInput = z.infer<typeof PaginationSchema>;
export type SearchQueryInput = z.infer<typeof SearchQuerySchema>;
export type CharitySearchInput = z.infer<typeof CharitySearchSchema>;
export type CharityEINInput = z.infer<typeof CharityEINSchema>;
export type CorporateSearchInput = z.infer<typeof CorporateSearchSchema>;
export type CorporateCIKInput = z.infer<typeof CorporateCIKSchema>;
export type GovernmentSearchInput = z.infer<typeof GovernmentSearchSchema>;
export type PoliticalSearchInput = z.infer<typeof PoliticalSearchSchema>;
export type PoliticalCandidateInput = z.infer<typeof PoliticalCandidateSchema>;
export type PoliticalCommitteeInput = z.infer<typeof PoliticalCommitteeSchema>;
export type HealthcareSearchInput = z.infer<typeof HealthcareSearchSchema>;
export type FraudScoreEntityInput = z.infer<typeof FraudScoreEntitySchema>;
export type TipSubmissionInput = z.infer<typeof TipSubmissionSchema>;
export type SubscriptionInput = z.infer<typeof SubscriptionSchema>;