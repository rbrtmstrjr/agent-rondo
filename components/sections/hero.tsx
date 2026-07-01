"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import robot from "@/src/images/robot.png";
import { EASE } from "@/lib/motion";

export function Hero() {
  return (
    <section className="relative isolate flex flex-col overflow-hidden px-4 pt-32 text-center sm:min-h-dvh">
      {/* plain static backdrop — no motion */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 grid-texture opacity-30 [mask-image:radial-gradient(70%_55%_at_50%_30%,black,transparent)]"
        aria-hidden
      />

      {/* Giant RONDO wordmark — subtle, behind the robot (Figma gradient) */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[30%] z-0 select-none font-display text-[clamp(5rem,23vw,21rem)] font-bold uppercase leading-none tracking-tighter"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(223,220,222,0.30) 25%, rgba(255,194,82,1) 56%, rgba(89,62,20,0.50) 75%, rgba(3,0,28,1) 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          opacity: 0.85,
        }}
      >
        Rondo
      </span>

      {/* Paragraph */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE, delay: 0.2 }}
        className="relative z-10 mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted"
      >
        I&apos;m Robert — I build <span className="text-foreground">AI systems</span> that answer
        your customers, qualify your leads, and handle your paperwork{" "}
        <span className="text-foreground">24/7, while you sleep.</span> Production-grade automation,
        live in weeks.
      </motion.p>

      {/* Robot — large, anchored to the bottom of the screen */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: EASE }}
        className="relative z-10 mt-8 flex justify-center sm:mt-auto"
      >
        <Image
          src={robot}
          alt="Agent Rondo — AI automation agent"
          priority
          className="block h-auto w-[380px] sm:w-[560px] lg:w-[720px]"
        />
      </motion.div>
    </section>
  );
}
