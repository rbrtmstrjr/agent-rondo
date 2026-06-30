import {
  Bot,
  Code2,
  LayoutGrid,
  Palette,
  Github,
  Linkedin,
  Facebook,
  Instagram,
  type LucideIcon,
} from "lucide-react";

const map: Record<string, LucideIcon> = {
  bot: Bot,
  code: Code2,
  layout: LayoutGrid,
  palette: Palette,
  github: Github,
  linkedin: Linkedin,
  facebook: Facebook,
  instagram: Instagram,
};

export function Icon({
  name,
  className,
  ...props
}: { name: string; className?: string } & React.ComponentProps<LucideIcon>) {
  const Cmp = map[name] ?? Bot;
  return <Cmp className={className} aria-hidden {...props} />;
}
