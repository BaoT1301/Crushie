"use client";

import { cn } from "@/lib/utils";

interface ExtraContextInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
}

export function ExtraContextInput({
  value,
  onChange,
  maxLength = 500,
  disabled = false,
  placeholder = "Tell us more about yourself — hobbies, personality quirks, what makes you unique...",
  label = "Extra Context",
}: ExtraContextInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-foreground">
          {label}
          <span className="text-muted-foreground ml-1 font-normal">
            (optional)
          </span>
        </label>
        <span className="text-xs text-muted-foreground">
          {value.length}/{maxLength}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          if (e.target.value.length <= maxLength) {
            onChange(e.target.value);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
        className={cn(
          // text-base below md, matching ui/input.tsx: anything under 16px
          // makes iOS Safari zoom the page in on focus.
          "w-full rounded-xl border border-input bg-background px-4 py-3 text-base text-foreground md:text-sm",
          "placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
          "resize-none transition-all",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      />
    </div>
  );
}
