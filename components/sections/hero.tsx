"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import heroBg from "@/src/images/hero-bg.png";
import { Button } from "@/components/ui/button";
import { EASE } from "@/lib/motion";

export function Hero() {
  return (
    <section className="relative isolate flex min-h-dvh flex-col justify-end overflow-hidden px-4 pb-32 pt-32 sm:justify-center sm:px-8 sm:pb-24">
      {/* background image */}
      <div className="absolute inset-0 -z-10">
        <Image
          src={heroBg}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>

      <div className="mx-auto w-full max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
          className="max-w-xl"
        >
          <h1 className="font-display text-7xl font-bold uppercase leading-[0.9] tracking-[0.1em] text-foreground sm:text-8xl lg:text-[11rem]">
            Rondo
          </h1>

          <p className="mt-6 max-w-md text-lg leading-relaxed text-foreground/85">
            I&apos;m Robert — I build <span className="font-medium text-foreground">AI systems</span>{" "}
            that answer your customers, qualify your leads, and handle your paperwork{" "}
            <span className="font-medium text-foreground">24/7, while you sleep.</span>{" "}
            Production-grade automation, live in weeks.
          </p>

          <div className="mt-8">
            <Button href="/contact" variant="white" size="lg">
              Get started
              <ArrowUpRight className="h-5 w-5" />
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
