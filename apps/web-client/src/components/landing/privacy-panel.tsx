"use client";

import { motion } from "framer-motion";

/**
 * Privacy panel.
 *
 * Fills what was the largest void on the page: the privacy section's left
 * column held a heading and two lines of copy, then several hundred pixels of
 * nothing beside a three-row list.
 *
 * These toggles are decorative and non-interactive on purpose. The section
 * claims "here is exactly how much access that gives us", and an assertion is
 * weaker than a demonstration. Every value shown is qualitative and true, so it
 * satisfies the page rule that every number is either true or absent: there are
 * no numbers here at all.
 *
 * The gradient hairline shell reuses the technique already proven on
 * AnalyzerPreview rather than inventing a new one.
 */

const permissions = [
  { label: "Account access", value: "Off", on: false },
  { label: "Screenshot access", value: "This session only", on: true },
  { label: "Background scanning", value: "Off", on: false },
  { label: "Always on listening", value: "Off", on: false },
];

export function PrivacyPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="mt-8 rounded-2xl bg-gradient-to-br from-primary/40 via-pink-500/25 to-rose-500/20 p-px"
    >
      <div className="rounded-2xl bg-card/80 p-6 backdrop-blur-sm">
        <p className="mb-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          What Crushie can reach
        </p>

        <ul className="flex flex-col gap-4">
          {permissions.map((p, i) => (
            <motion.li
              key={p.label}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{
                duration: 0.4,
                delay: 0.15 + i * 0.1,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex items-center justify-between gap-4"
            >
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium text-foreground">
                  {p.label}
                </span>
                <span className="text-xs text-muted-foreground">{p.value}</span>
              </div>

              {/* Decorative. aria-hidden because it conveys nothing a screen
                  reader cannot already get from the label and value above. */}
              <span
                aria-hidden
                className={
                  p.on
                    ? "relative h-6 w-11 shrink-0 rounded-full bg-primary/80"
                    : "relative h-6 w-11 shrink-0 rounded-full bg-muted"
                }
              >
                <motion.span
                  initial={{ x: p.on ? 4 : 4 }}
                  whileInView={{ x: p.on ? 22 : 4 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 22,
                    delay: 0.35 + i * 0.1,
                  }}
                  className="absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm"
                />
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
