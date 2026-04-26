interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
}

const SIZE_CLASSES = {
  sm: "w-4 h-4",
  md: "w-8 h-8",
  lg: "w-12 h-12",
};

const LABEL_SIZES = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export function LoadingSpinner({ size = "md", label }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8" role="status" aria-label="Loading">
      <svg
        className={`animate-spin text-gray-400 dark:text-gray-500 ${SIZE_CLASSES[size]}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
      {label && (
        <span className={`text-gray-500 dark:text-gray-400 ${LABEL_SIZES[size]}`}>
          {label}
        </span>
      )}
    </div>
  );
}