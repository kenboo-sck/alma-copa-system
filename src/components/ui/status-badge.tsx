type StatusBadgeProps = {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger";
};

const tones: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  neutral: "border-zinc-600 bg-zinc-800 text-zinc-200",
  success: "border-emerald-700 bg-emerald-950 text-emerald-300",
  warning: "border-amber-700 bg-amber-950 text-amber-300",
  danger: "border-red-700 bg-red-950 text-red-300",
};

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {label}
    </span>
  );
}
