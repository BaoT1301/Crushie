"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

/**
 * Shared calls to action.
 *
 * One label per intent, defined once and reused, so the page never offers the
 * same action under two different names in the hero and the closing section.
 */

export function StartFreeButton({ size = "lg" }: { size?: "lg" | "default" }) {
  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <Button
            size={size}
            className="gap-2 rounded-full bg-gradient-to-r from-primary via-pink-500 to-rose-500 px-7 text-white shadow-lg shadow-primary/35 transition-shadow hover:shadow-xl hover:shadow-primary/45"
          >
            Start free
            <ArrowRight className="h-4 w-4" />
          </Button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <Button
          size={size}
          asChild
          className="gap-2 rounded-full px-7 shadow-lg shadow-primary/25"
        >
          <Link href="/dashboard">
            Open Crushie
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </SignedIn>
    </>
  );
}

export function SecondaryButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="outline"
      size="lg"
      asChild
      className="rounded-full border-primary/30 bg-primary/5 px-6 text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"
    >
      <a href={href}>{children}</a>
    </Button>
  );
}
