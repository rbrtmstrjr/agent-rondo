import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tasteful stylized placeholder used until real photos/screens are added. */
export function Placeholder({
  label = "Image",
  className,
  ratio = "aspect-[4/5]",
}: {
  label?: string;
  className?: string;
  ratio?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl border border-line",
        ratio,
        className,
      )}
    >
      <div className="absolute inset-0 grid-texture opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-br from-gold-glow via-transparent to-cyan-glow opacity-60" />
      <div className="relative flex flex-col items-center gap-2 text-faint">
        <ImageIcon className="h-7 w-7" />
        <span className="font-mono text-xs uppercase tracking-widest">{label}</span>
      </div>
    </div>
  );
}
