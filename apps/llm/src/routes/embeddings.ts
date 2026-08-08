import { Router } from "express";
import { z } from "zod";
import { generateEmbedding, EMBEDDING_DIMENSIONS } from "../lib/ai.js";

const router = Router();

/**
 * Text to embed.
 *
 * Bounded because this is billed per input token and the caller is a server we
 * control, so there is no legitimate reason for a profile blurb to approach
 * this. 8000 characters is roughly the model's context, well past any real
 * vibe profile.
 */
const embedSchema = z.object({
  text: z.string().min(1, "text is required").max(8000),
});

/**
 * POST /api/embeddings
 *
 * Lives in this service rather than the web app because OPENAI_API_KEY does.
 * Auth is the shared X-Service-Token applied to the whole /api surface in
 * app.ts, so this is not reachable from a browser.
 */
router.post("/", async (req, res) => {
  try {
    const { text } = embedSchema.parse(req.body);
    const embedding = await generateEmbedding(text);

    res.json({
      data: { embedding, dimensions: EMBEDDING_DIMENSIONS },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request", details: error.issues });
      return;
    }
    throw error;
  }
});

export default router;
