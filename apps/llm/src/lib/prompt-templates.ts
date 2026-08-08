/**
 * Prompt Templates Registry
 *
 * Pre-built, optimized prompt templates for common AI tasks.
 * Each template returns a formatted prompt string ready for the LLM.
 */

import { createPromptTemplate } from "./prompt-formatter.js";

// ============================================================================
// Theme Generation
// ============================================================================

export const generateThemePalette = createPromptTemplate({
  role: "Expert UI/UX designer specializing in color theory and design systems",
  task: "Generate a cohesive, accessible color palette for a web application theme",
  rules: [
    "Return ONLY valid JSON — no markdown, no explanation",
    "All colors must be valid hex color codes",
    "Ensure primary/foreground pairs meet WCAG AA contrast ratio (4.5:1)",
    "Destructive color must clearly communicate danger/error",
    "Muted colors should be subtle variations of the background",
    "Chart colors must be visually distinguishable from each other",
    "Dark mode should maintain the same hue family but adjust lightness",
  ],
  output: {
    light: {
      background: "#hex",
      foreground: "#hex",
      primary: "#hex",
      "primary-foreground": "#hex",
      secondary: "#hex",
      "secondary-foreground": "#hex",
      muted: "#hex",
      "muted-foreground": "#hex",
      accent: "#hex",
      "accent-foreground": "#hex",
      destructive: "#hex",
      border: "#hex",
    },
    dark: {
      background: "#hex",
      foreground: "#hex",
      primary: "#hex",
      "primary-foreground": "#hex",
      "...": "same shape as light",
    },
  },
  examples: [
    {
      input: { mood: "calm", baseColor: "#3b82f6" },
      output: {
        light: {
          background: "#f8fafc",
          foreground: "#1e293b",
          primary: "#3b82f6",
          "primary-foreground": "#ffffff",
        },
        dark: {
          background: "#0f172a",
          foreground: "#e2e8f0",
          primary: "#60a5fa",
          "primary-foreground": "#0f172a",
        },
      },
    },
  ],
});

// ============================================================================
// Text Summarization
// ============================================================================

export const summarizeText = createPromptTemplate({
  role: "Expert content analyst with strong summarization skills",
  task: "Produce a concise, accurate summary of the provided text",
  rules: [
    "Return ONLY valid JSON — no markdown, no explanation",
    "Summary must be shorter than the original text",
    "Preserve the key facts, names, and numbers",
    "Use clear, simple language",
    "Include a list of key takeaways",
    "Identify the overall sentiment",
  ],
  output: {
    summary: "string — concise summary paragraph",
    keyTakeaways: ["string — bullet point 1", "string — bullet point 2"],
    sentiment: "positive | neutral | negative",
    wordCount: "number — word count of summary",
  },
});

// ============================================================================
// Code Review
// ============================================================================

export const reviewCode = createPromptTemplate({
  role: "Senior software engineer and code reviewer",
  task: "Analyze the provided code and give actionable review feedback",
  rules: [
    "Return ONLY valid JSON — no markdown, no explanation",
    "Focus on bugs, security issues, performance, and readability",
    "Assign a severity to each issue: critical, warning, or suggestion",
    "Provide a brief fix recommendation for each issue",
    "If the code is good, return an empty issues array with a positive comment",
  ],
  output: {
    overallScore: "number 1-10",
    summary: "string — one sentence overview",
    issues: [
      {
        severity: "critical | warning | suggestion",
        line: "number | null",
        description: "string",
        fix: "string",
      },
    ],
  },
});

// ============================================================================
// Content Rewriting
// ============================================================================

export const rewriteContent = createPromptTemplate({
  role: "Professional content writer and editor",
  task: "Rewrite the provided text according to the specified tone and constraints",
  rules: [
    "Return ONLY valid JSON — no markdown, no explanation",
    "Preserve the original meaning and key information",
    "Match the requested tone precisely",
    "Keep approximately the same length unless told otherwise",
    "Fix any grammar or spelling errors in the original",
  ],
  output: {
    rewritten: "string — the rewritten text",
    changes: ["string — brief description of each change made"],
    tone: "string — the tone applied",
  },
});

// ============================================================================
// Data Extraction
// ============================================================================

export const extractStructuredData = createPromptTemplate({
  role: "Data extraction specialist",
  task: "Extract structured data from unstructured text into the requested schema",
  rules: [
    "Return ONLY valid JSON — no markdown, no explanation",
    "Only extract information that is explicitly present in the text",
    "Use null for fields where data cannot be found",
    "Do not infer or hallucinate data",
    "Normalize dates to ISO 8601 format when possible",
  ],
  output: "{ ...schema provided in input.outputSchema }",
});

// ============================================================================
// Translation
// ============================================================================

export const translateText = createPromptTemplate({
  role: "Professional translator with expertise in technical and casual content",
  task: "Translate the provided text to the target language",
  rules: [
    "Return ONLY valid JSON — no markdown, no explanation",
    "Preserve formatting, tone, and intent of the original",
    "Keep technical terms in their commonly accepted form in the target language",
    "If a term has no good translation, keep it in the original language with a note",
  ],
  output: {
    translated: "string — the translated text",
    sourceLanguage: "string — detected source language",
    targetLanguage: "string — target language",
    notes: ["string — any translation notes or untranslatable terms"],
  },
});

// ============================================================================
// Profile Analysis (Dating Coach)
// ============================================================================

export const analyzeCrushProfile = createPromptTemplate({
  role: "Expert dating coach and communication strategist",
  task: "Analyze a dating profile to predict communication style and suggest conversation starters and date ideas",
  rules: [
    "Return ONLY valid JSON — no markdown, no explanation",
    "predictedStyle must be one of: direct, playful, intellectual, shy, adventurous",
    "Provide 3 unique conversation openers that match the predicted style",
    "Suggest 3 diverse date ideas with different price points",
    "All suggestions should feel authentic and not generic",
    "vibeMatch scores should reflect genuine compatibility with the predicted style",
  ],
  output: {
    predictedStyle: "direct | playful | intellectual | shy | adventurous",
    vibePrediction: {
      confidence: "number 0-1",
      dominantTrait: "string",
      secondaryTrait: "string",
      summary: "string — 1-2 sentence vibe description",
      communicationTips: ["string — tip 1", "string — tip 2", "string — tip 3"],
    },
    conversationOpeners: [
      "string — opener 1",
      "string — opener 2",
      "string — opener 3",
    ],
    dateSuggestions: [
      {
        title: "string",
        description: "string",
        vibeMatch: "number 0-1",
        estimatedCost: "string — e.g. Free, $20-40, $50+",
        duration: "string — e.g. 2-3 hours",
      },
    ],
    modelVersion: "openai",
  },
  examples: [
    {
      input: { imageHash: "abc123", hintTags: ["university student", "loves hiking"] },
      output: {
        predictedStyle: "adventurous",
        vibePrediction: {
          confidence: 0.87,
          dominantTrait: "Adventurous Spirit",
          secondaryTrait: "Active & Outdoorsy",
          summary:
            "Thrill-seeker who values experiences over material things. Likely to say yes to spontaneous adventures.",
          communicationTips: [
            "Suggest specific activities, not just 'let's hang out'",
            "Share your own adventure stories to build rapport",
            "Be clear about plans with dates and times",
          ],
        },
        conversationOpeners: [
          "What's on your bucket list that you haven't checked off yet?",
          "Mountains or ocean — where do you feel most alive?",
          "What's your best 'almost didn't make it' adventure story?",
        ],
        dateSuggestions: [
          {
            title: "Sunrise Hike & Breakfast",
            description:
              "Wake up early, catch the sunrise from a local trail, then grab breakfast at a cozy spot nearby",
            vibeMatch: 0.96,
            estimatedCost: "Free-$20",
            duration: "3-4 hours",
          },
          {
            title: "Rock Climbing Gym Session",
            description:
              "Try indoor climbing together — active, fun, and you can chat between climbs",
            vibeMatch: 0.92,
            estimatedCost: "$30-50",
            duration: "2-3 hours",
          },
          {
            title: "Farmers Market + Picnic",
            description:
              "Browse a local farmers market, pick up fresh food, then have a picnic in a park",
            vibeMatch: 0.88,
            estimatedCost: "$20-40",
            duration: "2-3 hours",
          },
        ],
        modelVersion: "openai",
      },
    },
  ],
});

// ============================================================================
// Template Registry — for dynamic lookup by name
// ============================================================================

export const PROMPT_TEMPLATES = {
  "generate-theme-palette": generateThemePalette,
  "summarize-text": summarizeText,
  "review-code": reviewCode,
  "rewrite-content": rewriteContent,
  "extract-structured-data": extractStructuredData,
  "translate-text": translateText,
  "analyze-crush-profile": analyzeCrushProfile,
} as const;

export type TemplateName = keyof typeof PROMPT_TEMPLATES;

export const AVAILABLE_TEMPLATES = Object.keys(
  PROMPT_TEMPLATES,
) as TemplateName[];