import type { RiskSignal } from "./types";
import { makeSignal, warnOrHigh } from "./fraud-signals";
import { CONSUMER_THRESHOLDS as T } from "./policy";

interface Complaint {
  company_response?: string;
  consumer_disputed?: string;
  timely?: string;
  product?: string;
}

export interface ConsumerMetrics {
  totalComplaints: number;
  reliefRate: number | null;
  disputeRate: number | null;
  untimelyRate: number | null;
  topProduct: string | null;
  topProductShare: number | null;
  withRelief: number;
  withoutRelief: number;
  disputed: number;
  untimely: number;
}

export function computeConsumerMetrics(complaints: Complaint[]): ConsumerMetrics {
  const total = complaints.length;
  if (total === 0) {
    return {
      totalComplaints: 0, reliefRate: null, disputeRate: null,
      untimelyRate: null, topProduct: null, topProductShare: null,
      withRelief: 0, withoutRelief: 0, disputed: 0, untimely: 0,
    };
  }

  let withRelief = 0;
  let withoutRelief = 0;
  let disputed = 0;
  let untimely = 0;
  const byProduct = new Map<string, number>();

  for (const c of complaints) {
    const response = (c.company_response ?? "").toLowerCase();
    if (response.includes("relief")) {
      withRelief++;
    } else if (response.includes("closed")) {
      withoutRelief++;
    }

    if (c.consumer_disputed?.toLowerCase() === "yes") disputed++;
    if (c.timely?.toLowerCase() === "no") untimely++;

    if (c.product) {
      byProduct.set(c.product, (byProduct.get(c.product) ?? 0) + 1);
    }
  }

  const totalResolved = withRelief + withoutRelief;
  const reliefRate = totalResolved > 0 ? withRelief / totalResolved : null;
  const disputeRate = total > 0 ? disputed / total : null;
  const untimelyRate = total > 0 ? untimely / total : null;

  let topProduct: string | null = null;
  let topProductCount = 0;
  for (const [product, count] of byProduct) {
    if (count > topProductCount) {
      topProduct = product;
      topProductCount = count;
    }
  }
  const topProductShare = total > 0 ? topProductCount / total : null;

  return {
    totalComplaints: total,
    reliefRate,
    disputeRate,
    untimelyRate,
    topProduct,
    topProductShare,
    withRelief,
    withoutRelief,
    disputed,
    untimely,
  };
}

export function buildConsumerSignals(complaints: Complaint[]): RiskSignal[] {
  const m = computeConsumerMetrics(complaints);
  const signals: RiskSignal[] = [];

  if (m.totalComplaints < T.minimumComplaintCount) return signals;

  if (m.reliefRate != null) {
    // Lower is worse for relief rate
    const sev = warnOrHigh(m.reliefRate, T.reliefRateWarn, T.reliefRateHigh, false);
    if (sev) {
      signals.push(makeSignal(sev, {
        key: "consumer_low_relief",
        label: "Low Consumer Relief Rate",
        detail: `Only ${(m.reliefRate * 100).toFixed(1)}% of resolved complaints resulted in relief for the consumer (${m.withRelief} of ${m.withRelief + m.withoutRelief}). Companies that almost never provide relief when consumers complain may be engaging in systematic consumer harm.`,
        value: m.reliefRate,
        threshold: T.reliefRateWarn,
      }));
    }
  }

  if (m.disputeRate != null) {
    const sev = warnOrHigh(m.disputeRate, T.disputeRateWarn, T.disputeRateHigh);
    if (sev) {
      signals.push(makeSignal(sev, {
        key: "consumer_high_dispute",
        label: "High Consumer Dispute Rate",
        detail: `${(m.disputeRate * 100).toFixed(1)}% of consumers disputed the company's response (${m.disputed} of ${m.totalComplaints}). A high dispute rate means consumers don't agree with how the company handled their complaint — the company's "resolution" isn't actually resolving the problem.`,
        value: m.disputeRate,
        threshold: T.disputeRateWarn,
      }));
    }
  }

  if (m.untimelyRate != null) {
    const sev = warnOrHigh(m.untimelyRate, T.untimelyRateWarn, T.untimelyRateHigh);
    if (sev) {
      signals.push(makeSignal(sev, {
        key: "consumer_untimely",
        label: "Untimely Responses to Federal Complaints",
        detail: `${(m.untimelyRate * 100).toFixed(1)}% of complaints received untimely responses (${m.untimely} of ${m.totalComplaints}). Companies are required to respond to CFPB complaints within 15 days. Failure to respond on time to a federal regulator suggests indifference to consumer protection.`,
        value: m.untimelyRate,
        threshold: T.untimelyRateWarn,
      }));
    }
  }

  if (m.topProductShare != null) {
    const sev = warnOrHigh(m.topProductShare, T.productConcentrationWarn, T.productConcentrationHigh);
    if (sev) {
      signals.push(makeSignal(sev, {
        key: "consumer_product_concentration",
        label: "Complaint Concentration in Single Product",
        detail: `${(m.topProductShare * 100).toFixed(0)}% of complaints are about "${m.topProduct}". When most complaints focus on a single product, it indicates a systemic product-level issue rather than random dissatisfaction.`,
        value: m.topProductShare,
        threshold: T.productConcentrationWarn,
      }));
    }
  }

  return signals;
}
