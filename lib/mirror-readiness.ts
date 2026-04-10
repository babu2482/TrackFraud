export interface MirrorReadiness {
  ready: boolean;
  coverage: "not-started" | "summary-only" | "detail-ready" | "historical-partial";
}

export const MIRROR_READINESS_THRESHOLDS = {
  consumer: {
    complaints: 100_000,
    companySummaries: 1_000,
  },
  healthcare: {
    payments: 100_000,
    recipients: 1_000,
  },
  political: {
    candidates: 1_000,
    committees: 1_000,
    cycleSummaries: 1_000,
  },
  government: {
    awards: 10_000,
  },
  corporate: {
    profiles: 1_000,
    filings: 1_000,
    facts: 100,
  },
} as const;

export function assessConsumerMirror(params: {
  complaints: number;
  companySummaries: number;
}): MirrorReadiness {
  if (params.complaints === 0 && params.companySummaries === 0) {
    return { ready: false, coverage: "not-started" };
  }
  if (
    params.complaints >= MIRROR_READINESS_THRESHOLDS.consumer.complaints &&
    params.companySummaries >=
      MIRROR_READINESS_THRESHOLDS.consumer.companySummaries
  ) {
    return { ready: true, coverage: "detail-ready" };
  }
  return { ready: false, coverage: "historical-partial" };
}

export function assessHealthcareMirror(params: {
  payments: number;
  recipients: number;
}): MirrorReadiness {
  if (params.payments === 0 && params.recipients === 0) {
    return { ready: false, coverage: "not-started" };
  }
  if (
    params.payments >= MIRROR_READINESS_THRESHOLDS.healthcare.payments &&
    params.recipients >= MIRROR_READINESS_THRESHOLDS.healthcare.recipients
  ) {
    return { ready: true, coverage: "detail-ready" };
  }
  return { ready: false, coverage: "historical-partial" };
}

export function assessPoliticalMirror(params: {
  candidates: number;
  committees: number;
  cycleSummaries: number;
}): MirrorReadiness {
  if (
    params.candidates === 0 &&
    params.committees === 0 &&
    params.cycleSummaries === 0
  ) {
    return { ready: false, coverage: "not-started" };
  }
  if (
    params.candidates >= MIRROR_READINESS_THRESHOLDS.political.candidates &&
    params.committees >= MIRROR_READINESS_THRESHOLDS.political.committees &&
    params.cycleSummaries >=
      MIRROR_READINESS_THRESHOLDS.political.cycleSummaries
  ) {
    return { ready: true, coverage: "detail-ready" };
  }
  if (params.candidates > 0 && params.committees > 0 && params.cycleSummaries > 0) {
    return { ready: false, coverage: "summary-only" };
  }
  return { ready: false, coverage: "historical-partial" };
}

export function assessGovernmentMirror(params: {
  awards: number;
}): MirrorReadiness {
  if (params.awards === 0) {
    return { ready: false, coverage: "not-started" };
  }
  if (params.awards >= MIRROR_READINESS_THRESHOLDS.government.awards) {
    return { ready: true, coverage: "detail-ready" };
  }
  return { ready: false, coverage: "historical-partial" };
}

export function assessCorporateMirror(params: {
  profiles: number;
  filings: number;
  facts: number;
}): MirrorReadiness {
  if (params.profiles === 0 && params.filings === 0 && params.facts === 0) {
    return { ready: false, coverage: "not-started" };
  }
  if (
    params.profiles >= MIRROR_READINESS_THRESHOLDS.corporate.profiles &&
    params.filings >= MIRROR_READINESS_THRESHOLDS.corporate.filings &&
    params.facts >= MIRROR_READINESS_THRESHOLDS.corporate.facts
  ) {
    return { ready: true, coverage: "detail-ready" };
  }
  if (params.profiles > 0) {
    return { ready: false, coverage: "summary-only" };
  }
  return { ready: false, coverage: "historical-partial" };
}
