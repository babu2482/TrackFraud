/**
 * Test utilities: mock data generators, fixtures, and helpers.
 */

// ─── Mock Charity Profile ─────────────────────────────────────────────

export interface MockCharityProfile {
  id: string;
  ein: string;
  name: string;
  city: string;
  state: string;
  zip: string;
  nteeCode: string;
  rulingDate: string;
  assetCode: string;
  incomeCode: string;
  filingCode: string;
  organizationCode: string;
  deductionCode: string;
  status: string;
  affiliationCode: string;
  classificationCode: string;
  activityCode: string;
  latest990PdfUrl: string | null;
  fraudScore: number | null;
  riskLevel: string | null;
  signalCount: number;
  createdAt: string;
  updatedAt: string;
}

export function createMockCharityProfile(
  overrides: Partial<MockCharityProfile> = {}
): MockCharityProfile {
  return {
    id: 'char-test-001',
    ein: '12-3456789',
    name: 'Test Charity Foundation',
    city: 'Springfield',
    state: 'IL',
    zip: '62701',
    nteeCode: 'T20',
    rulingDate: '20200101',
    assetCode: '4',
    incomeCode: '5',
    filingCode: '12',
    organizationCode: '3',
    deductionCode: '3',
    status: '1',
    affiliationCode: '0',
    classificationCode: '000',
    activityCode: '000',
    latest990PdfUrl: null,
    fraudScore: null,
    riskLevel: null,
    signalCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Mock Corporate Profile ───────────────────────────────────────────

export interface MockCorporateProfile {
  id: string;
  cik: string;
  name: string;
  entityType: string;
  sicCode: string | null;
  stateOfIncorporation: string | null;
  fiscalYearEnd: string | null;
  fraudScore: number | null;
  riskLevel: string | null;
  signalCount: number;
  createdAt: string;
  updatedAt: string;
}

export function createMockCorporateProfile(
  overrides: Partial<MockCorporateProfile> = {}
): MockCorporateProfile {
  return {
    id: 'corp-test-001',
    cik: '0001234567',
    name: 'Test Corp Inc',
    entityType: 'corporation',
    sicCode: '6153',
    stateOfIncorporation: 'DE',
    fiscalYearEnd: '1231',
    fraudScore: null,
    riskLevel: null,
    signalCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Mock Complaint ───────────────────────────────────────────────────

export interface MockComplaint {
  id: string;
  companyId: string;
  companyName: string;
  consumerComplaintId: number;
  product: string;
  subProduct: string;
  issue: string;
  subIssue: string;
  state: string;
  zipCode: string;
  submittedDate: string;
  receivedDate: string;
  companyResponse: string | null;
  timelineDate: string | null;
  consumerSentiment: string;
  companySentiment: string;
  isPublic: boolean;
}

export function createMockComplaint(
  overrides: Partial<MockComplaint> = {}
): MockComplaint {
  return {
    id: 'comp-test-001',
    companyId: 'corp-test-001',
    companyName: 'Test Bank',
    consumerComplaintId: 12345678,
    product: 'Credit card',
    subProduct: 'Closed end',
    issue: 'Charging unauthorized fees',
    subIssue: 'Other',
    state: 'CA',
    zipCode: '90210',
    submittedDate: '2024-01-15',
    receivedDate: '2024-01-15',
    companyResponse: null,
    timelineDate: null,
    consumerSentiment: 'negative',
    companySentiment: 'neutral',
    isPublic: true,
    ...overrides,
  };
}

// ─── Mock API Response ────────────────────────────────────────────────

export function createMockApiResponse(
  data: unknown,
  status: number = 200
) {
  return {
    status,
    headers: new Headers({
      'Content-Type': 'application/json',
    }),
    json: async () => data,
    ok: status >= 200 && status < 300,
  };
}

// ─── Mock Request ─────────────────────────────────────────────────────

export function createMockRequest(overrides: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
} = {}) {
  return {
    url: overrides.url || 'http://localhost:3001/api/test',
    method: overrides.method || 'GET',
    headers: new Headers(overrides.headers || {}),
    nextUrl: {
      pathname: '/api/test',
      searchParams: new URLSearchParams(),
    },
    ...overrides,
  };
}

// ─── Test Data Sets ───────────────────────────────────────────────────

export const TEST_EINS = [
  '12-3456789',
  '98-7654321',
  '11-2233445',
  '55-6677889',
  '99-0011223',
];

export const TEST_CIKS = [
  '0001234567',
  '0009876543',
  '0001122334',
  '0005566778',
  '0009900112',
];

export const TEST_STATES = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI'];

export const TEST_RISK_LEVELS = ['low', 'medium', 'high', 'critical'];
