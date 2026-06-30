import type { Variants } from "framer-motion";

/** Shared premium easing — matches --ease-premium in CSS. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** Fade + rise, used for scroll-reveal of sections. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE },
  },
};

/** Container that staggers its children in. */
export const stagger: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

/** Default viewport config for whileInView reveals. */
export const inView = { once: true, amount: 0.25 } as const;
