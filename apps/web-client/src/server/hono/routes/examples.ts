/**
 * Examples — Mobile REST routes (CRUD)
 */

import { Hono } from "hono";
import { eq, and, or, desc } from "drizzle-orm";
import { examples } from "@/services/examples/schema";
import type { AuthEnv } from "../middleware";
import { withRls } from "../secure-db";

const app = new Hono<AuthEnv>();

// GET /examples — list my examples
app.get("/", async (c) => {
  const userId = c.var.userId;
  const rows = await withRls(c, (tx) =>
    tx
      .select()
      .from(examples)
      .where(eq(examples.userId, userId))
      .orderBy(desc(examples.createdAt)),
  );
  return c.json({ data: rows });
});

// GET /examples/public — list all public examples
app.get("/public", async (c) => {
  const rows = await withRls(c, (tx) =>
    tx
      .select()
      .from(examples)
      .where(eq(examples.isPublic, true))
      .orderBy(desc(examples.createdAt)),
  );
  return c.json({ data: rows });
});

// GET /examples/:id
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.var.userId;

  // Previously any authenticated user could read any row by uuid, ignoring
  // both ownership and the isPublic flag.
  const [example] = await withRls(c, (tx) =>
    tx
      .select()
      .from(examples)
      .where(
        and(
          eq(examples.id, id),
          or(eq(examples.userId, userId), eq(examples.isPublic, true)),
        ),
      )
      .limit(1),
  );
  return c.json({ data: example ?? null });
});

// POST /examples
app.post("/", async (c) => {
  const userId = c.var.userId;
  const body = await c.req.json<{
    title: string;
    description?: string;
    isPublic?: boolean;
  }>();

  const [created] = await withRls(c, (tx) =>
    tx
      .insert(examples)
      .values({
        userId,
        title: body.title,
        description: body.description,
        isPublic: body.isPublic ?? false,
      })
      .returning(),
  );

  return c.json({ data: created }, 201);
});

// PATCH /examples/:id
app.patch("/:id", async (c) => {
  const userId = c.var.userId;
  const id = c.req.param("id");
  const body = await c.req.json<{
    title?: string;
    description?: string;
    isPublic?: boolean;
  }>();

  const [updated] = await withRls(c, (tx) =>
    tx
      .update(examples)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(examples.id, id), eq(examples.userId, userId)))
      .returning(),
  );

  // Report the miss rather than 200-ing on a write that did not land. Under RLS
  // a row the caller cannot see is indistinguishable from one that is absent,
  // and both should read as 404 to the client.
  if (!updated) {
    return c.json({ error: "Example not found" }, 404);
  }

  return c.json({ data: updated });
});

// DELETE /examples/:id
app.delete("/:id", async (c) => {
  const userId = c.var.userId;
  const id = c.req.param("id");

  // .returning() so a no-op delete is detectable. This previously returned
  // {success: true} unconditionally, which under RLS meant every failed delete
  // reported success.
  const deleted = await withRls(c, (tx) =>
    tx
      .delete(examples)
      .where(and(eq(examples.id, id), eq(examples.userId, userId)))
      .returning({ id: examples.id }),
  );

  if (!deleted.length) {
    return c.json({ error: "Example not found" }, 404);
  }

  return c.json({ success: true });
});

export default app;
