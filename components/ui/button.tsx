import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline";

const base =
  "group inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-deep disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "gold-gradient text-black hover:brightness-110 hover:shadow-[0_10px_40px_-10px_var(--color-gold-glow)] active:scale-[0.97]",
  outline:
    "border border-line-strong bg-surface text-foreground hover:border-gold/50 hover:bg-surface-strong active:scale-[0.97]",
  ghost: "text-muted hover:text-foreground",
};

const sizes = {
  md: "h-11 px-6 text-sm",
  lg: "h-13 px-8 text-base",
} as const;

type Props = {
  variant?: Variant;
  size?: keyof typeof sizes;
  href?: string;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = "primary",
  size = "md",
  href,
  className,
  children,
  ...props
}: Props) {
  const classes = cn(base, variants[variant], sizes[size], className);

  if (href) {
    const external = href.startsWith("http");
    return (
      <Link
        href={href}
        className={classes}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
