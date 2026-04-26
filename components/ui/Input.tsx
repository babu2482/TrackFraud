"use client";

import { useState, useEffect, useRef, forwardRef, InputHTMLAttributes } from "react";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix" | "suffix" | "onClear"> {
  variant?: "default" | "search" | "error" | "success";
  size?: "sm" | "md" | "lg";
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
  clearable?: boolean;
  debounced?: boolean;
  debounceMs?: number;
  error?: string;
  hint?: string;
  onClear?: () => void;
  commandHint?: string;
}

const VARIANT_CLASSES: Record<NonNullable<InputProps["variant"]>, string> = {
  default:
    "border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400",
  search:
    "border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400",
  error:
    "border-red-500 dark:border-red-400 focus:border-red-500 ring-2 ring-red-500/20",
  success:
    "border-green-500 dark:border-green-400 focus:border-green-500",
};

const SIZE_CLASSES: Record<NonNullable<InputProps["size"]>, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-3 py-2 text-sm",
  lg: "px-4 py-3 text-base",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    variant = "default",
    size = "md",
    prefixIcon,
    suffixIcon,
    clearable = false,
    debounced = false,
    debounceMs = 300,
    error,
    hint,
    onClear,
    commandHint = "⌘K",
    className = "",
    onChange,
    value,
    ...rest
  },
  ref
) {
  const [internalValue, setInternalValue] = useState(value as string || "");
  const [debouncedValue, setDebouncedValue] = useState(internalValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = (ref as React.RefObject<HTMLInputElement> | undefined) || useRef<HTMLInputElement>(null);

  const isControlled = value !== undefined;
  const currentValue = isControlled ? (value as string) : internalValue;
  const hasValue = !!currentValue;

  useEffect(() => {
    if (debounced && !isControlled) {
      timerRef.current = setTimeout(() => {
        setDebouncedValue(internalValue);
      }, debounceMs);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
  }, [internalValue, debounced, debounceMs, isControlled]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) {
      setInternalValue(e.target.value);
    }
    onChange?.(e);
  };

  const handleClear = () => {
    setInternalValue("");
    onClear?.();
    inputRef.current?.focus();
  };

  const showClear = clearable && hasValue && !rest.disabled;

  const inputClasses = [
    "w-full rounded-lg border bg-white dark:bg-gray-900 transition-colors-smooth focus-ring",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    prefixIcon ? "pl-9" : "",
    suffixIcon && !showClear ? "pr-9" : "",
    showClear ? "pr-10" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <div className="relative">
      {/* Prefix icon */}
      {prefixIcon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
          {prefixIcon}
        </div>
      )}

      {/* Search input with command hint */}
      {variant === "search" ? (
        <div className="relative">
          {!prefixIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
          )}
          <input
            ref={inputRef}
            type="search"
            value={currentValue}
            onChange={handleChange}
            className={inputClasses}
            placeholder={rest.placeholder || "Search entities, categories..."}
            aria-invalid={!!error}
            aria-describedby={hint ? `${rest.id}-hint` : undefined}
            {...rest}
          />
          {/* Right side: clear button or command hint */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {showClear ? (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-sm transition-colors"
                aria-label="Clear search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                {commandHint}
              </kbd>
            )}
            {showClear && suffixIcon && (
              <div className="text-gray-400 dark:text-gray-500 pointer-events-none">
                {suffixIcon}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Standard input */
        <>
          <input
            ref={inputRef}
            type={rest.type || "text"}
            value={currentValue}
            onChange={handleChange}
            className={inputClasses}
            aria-invalid={!!error}
            aria-describedby={hint ? `${rest.id}-hint` : undefined}
            {...rest}
          />
          {/* Suffix icon or clear */}
          {showClear && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-sm transition-colors"
              aria-label="Clear"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          {!showClear && suffixIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
              {suffixIcon}
            </div>
          )}
        </>
      )}

      {/* Error / hint text */}
      {(error || hint) && (
        <p className={`mt-1 text-xs ${error ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`} id={`${rest.id}-hint`}>
          {error || hint}
        </p>
      )}
    </div>
  );
});

Input.displayName = "Input";

/* ---- Quick-use presets ---- */

export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder,
  ...rest
}: Omit<InputProps, "variant">) {
  return (
    <Input
      variant="search"
      value={value}
      onChange={onChange}
      onClear={onClear}
      placeholder={placeholder}
      {...rest}
    />
  );
}

export function ErrorInput({
  value,
  onChange,
  error,
  ...rest
}: Omit<InputProps, "variant">) {
  return (
    <Input
      variant="error"
      error={error}
      value={value}
      onChange={onChange}
      {...rest}
    />
  );
}