"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { VerificationBadge } from "@/components/verification-badge";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useAuth,
} from "@clerk/nextjs";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Palette,
  Rocket,
  Menu,
  X,
  Heart,
  HeartHandshake,
  UserRoundCog,
  Compass,
  Settings,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { HeartIcon } from "@/components/love-animations";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Crush Analyzer",
    href: "/analyze-profile",
    icon: HeartHandshake,
  },
  {
    label: "Match Center",
    href: "/discover",
    icon: Compass,
  },
  {
    label: "Onboard",
    href: "/on-board",
    icon: Rocket,
  },
  {
    label: "Vibe Profiles",
    href: "/profile",
    icon: UserRoundCog,
  },
  {
    label: "Theme Editor",
    href: "/theme-editor",
    icon: Palette,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

// ============================================================================
// Navbar Component
// ============================================================================

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isSignedIn } = useAuth();
  const trpc = useTRPC();
  const userQuery = useQuery({
    ...trpc.users.getMe.queryOptions(),
    enabled: Boolean(isSignedIn),
    retry: false,
  });

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Prevent scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // Escape closes the menu. Without this the only way out on a phone with a
  // keyboard attached, or for anyone tabbing, is to find the toggle again.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl supports-backdrop-filter:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            /* Negative margin plus matching padding gives the 32px mark a
               48x48 tap target without changing how the row reads. */
            className="group -mx-2 -my-2 flex items-center gap-2 p-2 transition-opacity hover:opacity-80"
          >
            <motion.div
              className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-white shadow-sm"
              whileHover={{ scale: 1.1, rotate: -8 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", stiffness: 320, damping: 15 }}
            >
              <HeartIcon className="h-4 w-4 text-background" />
            </motion.div>
            <span className="hidden text-lg font-bold tracking-tight text-foreground sm:inline-block">
              Crushie <span className="text-primary">♥</span>
            </span>
          </Link>

          {/* Desktop Navigation.
              lg, not md. These seven links measure ~900px, so switching them on
              at md (768px) put a 900px row inside a 768px viewport: the whole
              document picked up ~290px of horizontal scroll on every
              authenticated route at iPad-portrait width. lg (1024px) is the
              first breakpoint the row actually fits in. */}
          <div className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Button
                  key={item.href}
                  asChild
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "gap-2 text-sm font-medium transition-all",
                    isActive
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : "text-white/70 hover:text-white",
                  )}
                >
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                </Button>
              );
            })}
          </div>

          {/* Right side — Auth + Mobile toggle */}
          <div className="flex items-center gap-3">
            <SignedOut>
              <SignInButton mode="modal">
                <Button size="sm" className="hidden sm:inline-flex">
                  Sign In
                </Button>
              </SignInButton>
              <SignInButton mode="modal">
                <Button size="sm" variant="ghost" className="sm:hidden">
                  Sign In
                </Button>
              </SignInButton>
            </SignedOut>

            <SignedIn>
              <VerificationBadge
                isVerified={Boolean(userQuery.data?.isVerified)}
                className="hidden sm:inline-flex"
              />
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8",
                  },
                }}
              />
            </SignedIn>

            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Menu Panel */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              /* The panel is nine rows tall and previously had no height cap or
                 scroller, so in landscape (or on a short phone) the last items
                 were simply unreachable. Capping it at the space below the 56px
                 bar and letting it scroll internally fixes that; dvh rather
                 than vh so the cap follows the collapsing iOS address bar, and
                 overscroll-contain stops the scroll chaining to the page
                 underneath once the list hits its end. */
              className="absolute inset-x-0 top-14 max-h-[calc(100dvh-3.5rem)] overflow-x-hidden overflow-y-auto overscroll-contain border-b border-border bg-card shadow-xl"
            >
              <div className="mx-auto max-w-7xl px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
                <div className="flex flex-col gap-1">
                  {navItems.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      pathname.startsWith(item.href + "/");
                    return (
                      <Link key={item.href} href={item.href}>
                        <div
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all",
                            isActive
                              ? "bg-accent text-accent-foreground shadow-sm"
                              : "text-white/70 hover:bg-white/10 hover:text-white",
                          )}
                        >
                          <item.icon className="h-5 w-5" />
                          <span>{item.label}</span>
                          {isActive && (
                            <div className="ml-auto h-2 w-2 rounded-full bg-primary" />
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* Mobile quick actions */}
                <div className="mt-4 border-t border-border pt-4">
                  <SignedOut>
                    <SignInButton mode="modal">
                      <Button size="default" className="w-full gap-2">
                        <Heart className="h-4 w-4" />
                        Fall in Love
                      </Button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                      Signed in with{" "}
                      <Heart className="h-3 w-3 text-primary fill-primary" />
                    </p>
                  </SignedIn>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
