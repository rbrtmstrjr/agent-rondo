import { Hero } from "@/components/sections/hero";
import { Problem } from "@/components/sections/problem";
import { Stats } from "@/components/sections/stats";
import { FeaturedWork } from "@/components/sections/featured-work";
import { Process } from "@/components/sections/process";
import { Services } from "@/components/sections/services";

export default function Home() {
  return (
    <>
      <Hero />
      <Problem />
      <Stats />
      <FeaturedWork />
      <Process />
      <Services />
    </>
  );
}
