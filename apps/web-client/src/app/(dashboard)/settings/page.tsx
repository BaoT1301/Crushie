import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your account, appearance, and privacy.
        </p>
      </div>

      <SettingsClient />
    </section>
  );
}
