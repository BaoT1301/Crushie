import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { Resend } from "resend";

interface ClerkUserEventData {
  id: string;
  email_addresses: Array<{
    id: string;
    email_address: string;
  }>;
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
  password_enabled: boolean;
  updated_at: number;
  created_at: number;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserEventData;
  object: "event";
  timestamp: number;
}

/**
 * Resend is constructed per request, not at module scope.
 *
 * `new Resend(undefined)` throws "Missing API key" from the constructor. At
 * module scope that runs during `next build`'s page-data collection, so a
 * missing RESEND_API_KEY failed the entire production build rather than
 * degrading one webhook. Deferring the construction keeps the build green and
 * turns the missing key into a logged no-op at request time instead.
 */
function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

/**
 * Escapes text before it is interpolated into the notification email.
 *
 * `first_name` and `last_name` are attacker-controlled: anyone can set them to
 * arbitrary strings in Clerk. Interpolating them raw into an HTML email let a
 * user inject markup into a message sent from our domain, which matters here
 * because the mail is a security notice. Injecting a "click here to restore
 * your account" anchor into a genuine password-change alert is a workable
 * phishing setup.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req: Request) {
  const CLERK_WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!CLERK_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "CLERK_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing svix headers" },
      { status: 400 },
    );
  }

  const body = await req.text();

  const wh = new Webhook(CLERK_WEBHOOK_SECRET);
  let event: ClerkWebhookEvent;

  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 },
    );
  }

  if (event.type === "user.updated") {
    const { data } = event;

    if (data.password_enabled) {
      const email =
        data.email_addresses.find(
          ({ id }) => id === data.primary_email_address_id,
        )?.email_address ?? data.email_addresses[0]?.email_address;

      const resend = getResend();

      if (email && resend) {
        const name = escapeHtml(
          [data.first_name, data.last_name].filter(Boolean).join(" ") ||
            "there",
        );

        // A delivery failure must not fail the webhook. Clerk retries any
        // non-2xx response, so throwing here would replay the whole event on a
        // schedule for a transient Resend outage, with no way to drain it.
        try {
          await resend.emails.send({
            from: "Crushie <noreply@crushie.app>",
            to: email,
            subject: "Password changed successfully",
            html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #1a1a1a;">Password Changed</h2>
              <p>Hi ${name},</p>
              <p>Your password was changed successfully. If you did not make this change, please reset your password immediately or contact support.</p>
              <p style="color: #666; font-size: 14px; margin-top: 32px;">— The Crushie Team</p>
            </div>
          `,
          });
        } catch (error) {
          console.error(
            "[clerk-webhook] password-change notification failed to send",
            error,
          );
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
