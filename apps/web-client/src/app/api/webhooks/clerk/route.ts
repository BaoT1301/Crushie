import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { Resend } from "resend";

interface ClerkUserEventData {
  id: string;
  email_addresses: Array<{
    id: string;
    email_address: string;
  }>;
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

const CLERK_WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
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
        data.email_addresses[0]?.email_address;

      if (email) {
        const name =
          [data.first_name, data.last_name].filter(Boolean).join(" ") ||
          "there";

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
      }
    }
  }

  return NextResponse.json({ received: true });
}
