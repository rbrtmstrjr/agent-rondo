import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

export function SectionHeading({
  eyebrow,
  title,
  desc,
  align = "left",
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  desc?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <Reveal
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-4">{title}</h2>
      {desc && <p className="mt-5 text-lg leading-relaxed text-muted">{desc}</p>}
    </Reveal>
  );
}
