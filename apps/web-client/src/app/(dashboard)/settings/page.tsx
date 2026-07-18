import { UserProfile } from "@clerk/nextjs";

export default function SettingsPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account, security, and connected services.
        </p>
      </div>

      <UserProfile
        appearance={{
          variables: {
            colorBackground: "var(--card)",
            colorForeground: "var(--foreground)",
            colorPrimary: "var(--primary)",
            colorInputBackground: "var(--background)",
            colorInputText: "var(--foreground)",
            colorNeutral: "var(--muted-foreground)",
            borderRadius: "var(--radius)",
            fontFamily: "var(--font-sans)",
          },
          elements: {
            rootBox: "w-full",
            cardBox: "w-full max-w-none shadow-sm",
            card: "w-full border border-border bg-card shadow-none",
            navbar: "border-border bg-muted/40",
            navbarButton:
              "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            navbarButtonIcon: "text-muted-foreground",
            navbarButtonText: "font-medium",
            headerTitle: "text-foreground",
            headerSubtitle: "text-muted-foreground",
            profileSectionTitleText: "text-foreground",
            profileSectionContent: "text-foreground",
            formFieldLabel: "text-foreground",
            formFieldInput:
              "border-input bg-background text-foreground focus:border-ring focus:ring-ring",
            formButtonPrimary:
              "bg-primary text-primary-foreground hover:bg-primary/90",
            formButtonReset:
              "text-muted-foreground hover:text-foreground",
            footerActionLink: "text-primary hover:text-primary/80",
          },
        }}
      />
    </section>
  );
}
