import type { RiskSignal } from "./types";
import { makeSignal, warnOrHigh } from "./fraud-signals";
import { GOVERNMENT_THRESHOLDS as T } from "./policy";

interface AwardData {
  total_obligation?: number;
  base_and_all_options_value?: number;
  contract_data?: {
    type_of_contract_pricing_description?: string;
    extent_competed_description?: string;
    number_of_offers_received?: number;
  };
}

export interface GovernmentMetrics {
  costOverrunRatio: number | null;
  isNonCompeted: boolean;
  isSingleBid: boolean;
  isCostPlus: boolean;
  competitionDescription: string | null;
}

export function computeGovernmentMetrics(award: AwardData): GovernmentMetrics {
  const obligation = award.total_obligation ?? 0;
  const baseValue = award.base_and_all_options_value ?? 0;
  const cd = award.contract_data;

  const costOverrunRatio =
    baseValue > 0 ? obligation / baseValue : null;

  const compDesc = cd?.extent_competed_description?.toLowerCase() ?? "";
  const isNonCompeted =
    compDesc.includes("not competed") ||
    compDesc.includes("not available for competition") ||
    compDesc.includes("sole source");

  const isSingleBid =
    (cd?.number_of_offers_received ?? 0) === T.singleBidThreshold &&
    !isNonCompeted; // only flag if it was supposedly competed

  const pricingDesc = cd?.type_of_contract_pricing_description?.toLowerCase() ?? "";
  const isCostPlus =
    pricingDesc.includes("cost") && !pricingDesc.includes("fixed");

  return {
    costOverrunRatio,
    isNonCompeted,
    isSingleBid,
    isCostPlus,
    competitionDescription: cd?.extent_competed_description ?? null,
  };
}

export function buildGovernmentSignals(award: AwardData): RiskSignal[] {
  const m = computeGovernmentMetrics(award);
  const signals: RiskSignal[] = [];
  const obligation = award.total_obligation ?? 0;

  if (m.isNonCompeted && obligation >= T.nonCompetedDollarFloor) {
    signals.push(makeSignal("high", {
      key: "government_non_competed",
      label: "Non-Competed Contract",
      detail: `This $${(obligation / 1_000_000).toFixed(1)}M contract was awarded without competition (${m.competitionDescription}). Non-competed contracts bypass competitive pricing and are a primary vector for waste and favoritism. Small purchases are routinely sole-sourced, but large contracts should be competed.`,
      value: obligation,
      threshold: T.nonCompetedDollarFloor,
    }));
  } else if (m.isNonCompeted) {
    signals.push(makeSignal("medium", {
      key: "government_non_competed",
      label: "Non-Competed Award",
      detail: `This award was not competed (${m.competitionDescription}). While small sole-source purchases are routine, non-competed awards lack competitive pricing pressure.`,
      value: obligation,
      threshold: T.nonCompetedDollarFloor,
    }));
  }

  if (m.isSingleBid) {
    signals.push(makeSignal("medium", {
      key: "government_single_bid",
      label: "Single-Bid Competition",
      detail: `Only 1 offer was received despite the contract being classified as competed. Single-bid "competitions" may indicate that requirements were written for a specific vendor, or that the competition was not effectively publicized.`,
      value: 1,
      threshold: T.singleBidThreshold,
    }));
  }

  if (m.costOverrunRatio != null) {
    const sev = warnOrHigh(m.costOverrunRatio, T.costOverrunWarn, T.costOverrunHigh);
    if (sev) {
      signals.push(makeSignal(sev, {
        key: "government_cost_overrun",
        label: "Cost Overrun",
        detail: `The government has obligated ${m.costOverrunRatio.toFixed(1)}x the original contract value. Significant cost overruns indicate poor project management, scope creep, or intentional low-balling to win the contract.`,
        value: m.costOverrunRatio,
        threshold: T.costOverrunWarn,
      }));
    }
  }

  if (m.isCostPlus && obligation >= T.nonCompetedDollarFloor) {
    signals.push(makeSignal("medium", {
      key: "government_cost_plus",
      label: "Cost-Plus Pricing",
      detail: `This large contract uses cost-plus pricing, meaning the contractor is reimbursed for costs plus a profit margin. Cost-plus contracts provide no incentive for the contractor to control expenses — the more they spend, the more they earn.`,
      value: obligation,
    }));
  }

  return signals;
}
