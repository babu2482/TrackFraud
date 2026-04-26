import { Badge } from "./Badge";

interface StatusBadgeProps {
  riskLevel: "low" | "medium" | "high" | "critical";
  label?: string;
}

const RISK_CONFIG: Record<StatusBadgeProps["riskLevel"], { variant: "default" | "red" | "amber" | "blue"; label: string }> = {
  low: { variant: "blue", label: "Low Risk" },
  medium: { variant: "amber", label: "Medium Risk" },
  high: { variant: "red", label: "High Risk" },
  critical: { variant: "red", label: "Critical" },
};

export function StatusBadge({ riskLevel, label }: StatusBadgeProps) {
  const config = RISK_CONFIG[riskLevel];
  return (
    <Badge variant={config.variant} title={`${label || config.label} — Risk level: ${riskLevel}`}>
      {label || config.label}
    </Badge>
  );
}