import { Hero } from "@/components/sections/hero";
import { ToolsMarquee } from "@/components/sections/tools-marquee";
import { Problem } from "@/components/sections/problem";
import { Stats } from "@/components/sections/stats";
import { FeaturedWork } from "@/components/sections/featured-work";
import { Process } from "@/components/sections/process";
import { Services } from "@/components/sections/services";
import { Pricing } from "@/components/sections/pricing";

export default function Home() {
  return (
    <>
      <Hero />
      <ToolsMarquee />
      <Problem />
      <Services />
      <Stats />
      <FeaturedWork />
      <Process />
      <Pricing />
    </>
  );
}
