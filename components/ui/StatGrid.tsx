interface Stat {
  label: string;
  value: string;
}

interface StatGridProps {
  stats: Stat[];
}

export function StatGrid({ stats }: StatGridProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1.5"
        >
          <p className="text-gray-500 dark:text-gray-400">{stat.label}</p>
          <p className="font-semibold text-gray-900 dark:text-white">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
