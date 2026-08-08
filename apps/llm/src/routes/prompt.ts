/**
 * Prompt Routes — Core API for structured LLM interactions
 *
 * POST /api/prompt/run           — Run a registered template by name
 * POST /api/prompt/raw           — Run a raw formatted prompt
 * GET  /api/prompt/templates     — List available templates
 */

import { Router } from "express";
import { z } from "zod";
import { generateFromPrompt, generateJSON } from "../lib/ai.js";
import { formatPrompt } from "../lib/prompt-formatter.js";
import { requireServiceToken } from "../lib/auth.js";
import {
  PROMPT_TEMPLATES,
  AVAILABLE_TEMPLATES,
  type TemplateName,
} from "../lib/prompt-templates.js";
import { getCachedResponse, setCachedResponse } from "../lib/redis.js";

const router = Router();

// ──────────────────────────────────────────────────────────────────────────
// POST /run — Execute a registered prompt template
// ──────────────────────────────────────────────────────────────────────────

const runTemplateSchema = z.object({
  template: z.enum(AVAILABLE_TEMPLATES as [string, ...string[]]),
  input: z.record(z.unknown()),
  context: z.record(z.unknown()).optional(),
  parseJson: z.boolean().optional().default(true),
  cache: z.boolean().optional().default(true),
});

router.post("/run", requireServiceToken(), async (req, res) => {
  try {
    const { template, input, context, parseJson, cache } =
      runTemplateSchema.parse(req.body);

    const templateFn = PROMPT_TEMPLATES[template as TemplateName];
    const prompt = templateFn(input, context);

    // Check cache
    if (cache) {
      const cached = await getCachedResponse(prompt);
      if (cached) {
        res.json({
          data: parseJson ? JSON.parse(cached) : cached,
          meta: { template, cached: true },
        });
        return;
      }
    }

    // Call LLM
    const startTime = Date.now();
    let data: unknown;

    if (parseJson) {
      data = await generateJSON(prompt);
    } else {
      data = await generateFromPrompt(prompt);
    }

    const duration = Date.now() - startTime;

    // Cache the response
    if (cache) {
      await setCachedResponse(
        prompt,
        typeof data === "string" ? data : JSON.stringify(data),
      );
    }

    res.json({
      data,
      meta: { template, cached: false, durationMs: duration },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: "Invalid request",
        details: error.errors,
        availableTemplates: AVAILABLE_TEMPLATES,
      });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(422).json({
        error: "LLM returned invalid JSON",
        message: error.message,
      });
      return;
    }
    throw error;
  }
});

// ──────────────────────────────────────────────────────────────────────────
// POST /raw — Execute a custom formatted prompt (advanced usage)
// ──────────────────────────────────────────────────────────────────────────

const rawPromptSchema = z.object({
  role: z.string().min(1),
  task: z.string().min(1),
  rules: z.array(z.string()).default([]),
  input: z.record(z.unknown()),
  output: z.union([z.record(z.unknown()), z.string()]),
  context: z.record(z.unknown()).optional(),
  examples: z
    .array(
      z.object({
        input: z.record(z.unknown()),
        output: z.unknown(),
      }),
    )
    .optional(),
  parseJson: z.boolean().optional().default(true),
  cache: z.boolean().optional().default(false),
});

router.post("/raw", requireServiceToken(), async (req, res) => {
  try {
    const body = rawPromptSchema.parse(req.body);
    const prompt = formatPrompt({
      ...body,
      examples: body.examples?.map((example) => ({
        input: example.input,
        output: example.output ?? null,
      })),
    });

    // Check cache
    if (body.cache) {
      const cached = await getCachedResponse(prompt);
      if (cached) {
        res.json({
          data: body.parseJson ? JSON.parse(cached) : cached,
          meta: { cached: true },
        });
        return;
      }
    }

    const startTime = Date.now();
    let data: unknown;

    if (body.parseJson) {
      data = await generateJSON(prompt);
    } else {
      data = await generateFromPrompt(prompt);
    }

    const duration = Date.now() - startTime;

    if (body.cache) {
      await setCachedResponse(
        prompt,
        typeof data === "string" ? data : JSON.stringify(data),
      );
    }

    res.json({
      data,
      meta: { cached: false, durationMs: duration },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request", details: error.errors });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(422).json({
        error: "LLM returned invalid JSON",
        message: error.message,
      });
      return;
    }
    throw error;
  }
});

// ──────────────────────────────────────────────────────────────────────────
// GET /templates — List all available prompt templates
// ──────────────────────────────────────────────────────────────────────────

router.get("/templates", (_req, res) => {
  res.json({
    templates: AVAILABLE_TEMPLATES,
    count: AVAILABLE_TEMPLATES.length,
  });
});

export default router;
