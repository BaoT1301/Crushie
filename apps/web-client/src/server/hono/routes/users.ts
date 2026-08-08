/**
 * Users — Mobile REST routes
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { users } from "@/services/users/schema";
import type { AuthEnv } from "../middleware";
import { withRls } from "../secure-db";
import { clerkClient } from "@clerk/nextjs/server";

const app = new Hono<AuthEnv>();

// GET /users/me
app.get("/me", async (c) => {
  const userId = c.var.userId;
  const [user] = await withRls(c, (tx) =>
    tx.select().from(users).where(eq(users.id, userId)).limit(1),
  );
  return c.json({ data: user ?? null });
});

// PATCH /users/me
app.patch("/me", async (c) => {
  const userId = c.var.userId;
  const body = await c.req.json<{
    firstName?: string;
    lastName?: string;
  }>();

  const [updated] = await withRls(c, (tx) =>
    tx
      .update(users)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning(),
  );

  // Report the miss rather than 200-ing on a write that did not land. A row the
  // caller cannot see under RLS is indistinguishable from one that is absent,
  // and both should read as 404 to the client.
  if (!updated) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ data: updated });
});

// POST /users/sync — sync Clerk user data to DB
app.post("/sync", async (c) => {
  const userId = c.var.userId;
  let body:
    | {
        email?: string;
        firstName?: string;
        lastName?: string;
        imageUrl?: string;
      }
    | undefined;

  // Mobile clients may call /users/sync with no body; tolerate that and
  // fetch profile from Clerk on the server.
  try {
    body = await c.req.json();
  } catch {
    body = undefined;
  }

  let email = body?.email;
  let firstName = body?.firstName;
  let lastName = body?.lastName;
  let imageUrl = body?.imageUrl;

  if (!email) {
    try {
      const client = await clerkClient();
      const u = await client.users.getUser(userId);
      email =
        u.primaryEmailAddress?.emailAddress ??
        u.emailAddresses?.[0]?.emailAddress ??
        undefined;
      firstName = firstName ?? u.firstName ?? undefined;
      lastName = lastName ?? u.lastName ?? undefined;
      imageUrl = imageUrl ?? u.imageUrl ?? undefined;
    } catch {
      // ignore
    }
  }

  // Ensure required email constraint is satisfied (and unique in dev)
  email = email ?? `${userId}@placeholder.local`;

  // The existence check and the write it selects are one operation and share a
  // transaction. Split apart, a second /sync racing this one can insert between
  // them and turn the insert branch into a duplicate-key error.
  const result = await withRls(c, async (tx) => {
    const [existing] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (existing) {
      const [updated] = await tx
        .update(users)
        .set({
          email: email ?? existing.email,
          firstName,
          lastName,
          imageUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();
      return { created: false as const, user: updated };
    }

    const [newUser] = await tx
      .insert(users)
      .values({
        id: userId,
        email,
        firstName,
        lastName,
        imageUrl,
      })
      .returning();

    return { created: true as const, user: newUser };
  });

  if (result.created) {
    return c.json({ data: result.user }, 201);
  }

  return c.json({ data: result.user });
});

export default app;
