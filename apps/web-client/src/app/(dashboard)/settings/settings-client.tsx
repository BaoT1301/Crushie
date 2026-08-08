"use client";

import Link from "next/link";
import { UserProfile } from "@clerk/nextjs";
import { Moon, Sun, Palette, ShieldCheck, ExternalLink } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/services/theme";

/**
 * Settings.
 *
 * The page used to be nothing but a themed <UserProfile/>, so it read as
 * Clerk's account panel wearing the app's colours: Clerk's own sidebar nested
 * inside the app's sidebar, plus a "Secured by Clerk" footer.
 *
 * The product now owns the frame and Clerk owns only what is genuinely its
 * own. Email, password, 2FA, sessions and connected accounts stay with Clerk
 * on purpose: those are security-critical flows that are easy to get subtly
 * wrong when hand-rolled.
 *
 * Nothing in the other tabs is a placeholder toggle. Every control here is
 * wired to something real, and where a capability does not exist yet it is
 * stated plainly rather than mocked with a switch that does nothing.
 */
export function SettingsClient() {
  const { theme, setTheme } = useTheme();

  return (
    <Tabs defaultValue="account" className="w-full">
      <TabsList className="mb-6 grid w-full max-w-md grid-cols-3">
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="appearance">Appearance</TabsTrigger>
        <TabsTrigger value="privacy">Privacy</TabsTrigger>
      </TabsList>

      {/* ── Account: Clerk's surface, framed by ours ────────────────────── */}
      <TabsContent value="account">
        <UserProfile
          routing="hash"
          appearance={{
            variables: {
              colorBackground: "var(--card)",
              colorForeground: "var(--foreground)",
              colorPrimary: "var(--primary)",
              colorInputBackground: "var(--background)",
              colorInputText: "var(--foreground)",
              colorNeutral: "var(--muted-foreground)",
              borderRadius: "var(--radius)",
              fontFamily: "var(--font-body)",
            },
            elements: {
              rootBox: "w-full",
              cardBox: "w-full max-w-none shadow-none",
              card: "w-full border border-border bg-card shadow-none",
              // Clerk's own nav is hidden: the app's tabs above already do
              // this job, and two levels of navigation for one page is the
              // main reason this read as an embedded third-party widget.
              // !hidden, not hidden: Clerk appends these classes alongside its
              // own rather than replacing them, so without the important
              // modifier Clerk's display rule wins the specificity fight.
              navbar: "!hidden",
              navbarMobileMenuRow: "!hidden",
              headerTitle: "font-display text-foreground",
              headerSubtitle: "text-muted-foreground",
              profileSectionTitleText: "text-foreground",
              profileSectionContent: "text-foreground",
              formFieldLabel: "text-foreground",
              formFieldInput:
                "border-input bg-background text-foreground focus:border-ring focus:ring-ring",
              formButtonPrimary:
                "bg-primary text-primary-foreground hover:bg-primary/90",
              formButtonReset: "text-muted-foreground hover:text-foreground",
              footerActionLink: "text-primary hover:text-primary/80",
              // NOTE: the "Secured by Clerk" badge is only removable on a paid
              // Clerk plan. This selector is left in place because it also
              // controls footer spacing, but do not rely on CSS to suppress
              // their branding while on the free tier: upgrading exposes a
              // supported toggle, which is the correct way to remove it.
              //
              // The "Development mode" pill is separate and is not stylable at
              // all. It reflects pk_test_ keys and disappears on production
              // keys. It is a safety signal, so hiding it would be a mistake
              // even if it were possible.
            },
          }}
        />
      </TabsContent>

      {/* ── Appearance ──────────────────────────────────────────────────── */}
      <TabsContent value="appearance">
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Theme
            </h2>
            <p className="mt-1 mb-5 text-sm text-muted-foreground">
              Crushie is designed dark. Light mode is supported but the brand
              reads best against near black.
            </p>

            <div className="flex flex-wrap gap-3">
              {(
                [
                  ["dark", "Dark", Moon],
                  ["light", "Light", Sun],
                ] as const
              ).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTheme(mode)}
                  aria-pressed={theme === mode}
                  className={
                    theme === mode
                      ? "flex items-center gap-2 rounded-full border border-primary bg-primary/10 px-4 py-2 text-sm font-medium text-primary"
                      : "flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">
                  Theme editor
                </h2>
                <p className="mt-1 max-w-[52ch] text-sm text-muted-foreground">
                  Change individual colours, radius and typography. Saved
                  presets apply across the whole app.
                </p>
              </div>
              <Button variant="outline" size="sm" asChild className="shrink-0">
                <Link href="/theme-editor">
                  Open
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </section>
        </div>
      </TabsContent>

      {/* ── Privacy ─────────────────────────────────────────────────────── */}
      <TabsContent value="privacy">
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="font-display text-lg font-semibold text-foreground">
                What Crushie can reach
              </h2>
            </div>

            <dl className="flex flex-col gap-4">
              {[
                [
                  "Dating app accounts",
                  "No access. Crushie never asks for a login to another service.",
                ],
                [
                  "Uploaded screenshots",
                  "Stored in private storage and served through expiring links. Used to generate your analysis.",
                ],
                [
                  "Background activity",
                  "None. The coach runs only while you have it open.",
                ],
              ].map(([term, detail]) => (
                <div
                  key={term}
                  className="flex flex-col gap-1 border-b border-border/60 pb-4 last:border-0 last:pb-0"
                >
                  <dt className="text-sm font-medium text-foreground">
                    {term}
                  </dt>
                  <dd className="text-sm leading-relaxed text-muted-foreground">
                    {detail}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Your data
            </h2>
            {/* Stated rather than mocked. Export and delete are not built, and
                a disabled button implying otherwise would be worse than an
                honest sentence. */}
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Self-serve export and deletion are not built yet. To have your
              analyses and uploads removed, delete your account from the Account
              tab, or contact the team and it will be done manually.
            </p>
          </section>
        </div>
      </TabsContent>
    </Tabs>
  );
}
