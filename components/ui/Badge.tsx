interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "red" | "amber" | "blue";
  title?: string;
}

const VARIANT_CLASSES: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300",
  red: "border-red-300 text-red-700 dark:border-red-700 dark:text-red-300",
  amber: "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300",
  blue: "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300",
};

export function Badge({ children, variant = "default", title }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${VARIANT_CLASSES[variant]}`}
      title={title}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({
  severity,
  children,
  title,
}: {
  severity: "high" | "medium" | "info";
  children: React.ReactNode;
  title?: string;
}) {
  const variant = severity === "high" ? "red" : severity === "medium" ? "amber" : "blue";
  return (
    <Badge variant={variant} title={title}>
      {children}
    </Badge>
  );
}
