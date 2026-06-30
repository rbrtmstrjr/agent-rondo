import Link from "next/link";
import { Aurora } from "@/components/visual/aurora";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 text-center">
      <Aurora />
      <div className="mx-auto max-w-lg">
        <p className="font-display text-7xl font-bold text-gradient-gold sm:text-8xl">404</p>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          This page got automated away.
        </h1>
        <p className="mt-4 text-muted">
          The page you&apos;re looking for doesn&apos;t exist — but the good stuff is just a click
          away.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button href="/">Back home</Button>
          <Button href="/work" variant="outline">
            See the work
          </Button>
        </div>
      </div>
    </section>
  );
}
