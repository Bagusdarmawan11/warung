import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-peach-400 text-white hover:bg-peach-500 shadow-soft',
  secondary: 'bg-mint-200 text-mint-600 hover:bg-mint-300',
  ghost: 'bg-white text-ink border border-lilac-200 hover:bg-lilac-50',
  danger: 'bg-rose-100 text-rose-600 hover:bg-rose-200',
  dark: 'bg-ink text-cream hover:bg-ink/90',
};
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-5 py-3 text-base gap-2',
  icon: 'p-2.5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  full,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; full?: boolean }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-2xl font-semibold transition-all active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap',
        variantClasses[variant],
        sizeClasses[size],
        full && 'w-full',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({
  className,
  children,
  tight,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { className?: string; children: ReactNode; tight?: boolean }) {
  return (
    <div className={cn('bg-white rounded-xl3 border border-lilac-100 shadow-soft', tight ? 'p-3.5' : 'p-5', className)} {...rest}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
type BadgeTone = 'good' | 'warn' | 'bad' | 'neutral' | 'info';
const badgeClasses: Record<BadgeTone, string> = {
  good: 'bg-mint-100 text-mint-600',
  warn: 'bg-butter-100 text-peach-600',
  bad: 'bg-rose-100 text-rose-600',
  neutral: 'bg-lilac-50 text-ink-soft',
  info: 'bg-sky-100 text-sky-600',
};
export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold font-mono whitespace-nowrap', badgeClasses[tone], className)}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Form field wrapper + input
// ---------------------------------------------------------------------------
export function Field({
  label,
  hint,
  className,
  full,
  children,
}: {
  label?: string;
  hint?: string;
  className?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('mb-3.5', full && 'sm:col-span-2', className)}>
      {label && <label className="block text-xs font-bold text-ink-soft mb-1.5">{label}</label>}
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-soft/70">{hint}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-xl border border-lilac-200 bg-lilac-50/40 px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-soft/50 outline-none transition focus:border-peach-400 focus:bg-white focus:ring-2 focus:ring-peach-100',
        className
      )}
      {...props}
    />
  );
});

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full rounded-xl border border-lilac-200 bg-lilac-50/40 px-3.5 py-2.5 text-[15px] text-ink outline-none transition focus:border-peach-400 focus:bg-white focus:ring-2 focus:ring-peach-100',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl2 border border-dashed border-lilac-200 bg-lilac-50/40 py-12 px-6 text-center">
      {icon && <div className="text-lilac-300">{icon}</div>}
      <p className="font-semibold text-ink-soft">{title}</p>
      {hint && <p className="text-xs text-ink-soft/70 max-w-xs">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle group (segmented control)
// ---------------------------------------------------------------------------
export function ToggleGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-2xl bg-lilac-50 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-xl px-4 py-2 text-sm font-semibold transition-all',
            value === o.value ? 'bg-white text-ink shadow-soft' : 'text-ink-soft hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chip (filter pill)
// ---------------------------------------------------------------------------
export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap',
        active ? 'border-ink bg-ink text-cream' : 'border-lilac-200 bg-white text-ink-soft hover:border-lilac-300'
      )}
    >
      {children}
    </button>
  );
}
