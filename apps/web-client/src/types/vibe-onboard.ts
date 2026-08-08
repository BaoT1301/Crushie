/**
 * Vibe Onboard Types — Shared type definitions for the Vibe Generation feature
 *
 * This file defines the categories, types, and display configuration
 * used by the on-board flow where users generate their own vibe profile.
 */

import type { HintTagCategory } from "@/types/analyzer";

// ============================================================================
// Energy Types
// ============================================================================

export type VibeEnergy = "chill" | "moderate" | "high" | "chaotic";

// ============================================================================
// Vibe Generation Result (returned from LLM)
// ============================================================================

export interface VibeGenerationResult {
  vibeName: string;
  vibeSummary: string;
  energy: VibeEnergy;
  moodTags: string[];
  styleTags: string[];
  interestTags: string[];
}

// ============================================================================
// Saved Vibe Profile (returned from tRPC after DB upsert)
// ============================================================================

export interface VibeProfileResult {
  id: string;
  userId: string;
  vibeName: string;
  vibeSummary: string | null;
  energy: VibeEnergy;
  moodTags: string[] | null;
  styleTags: string[] | null;
  interestTags: string[] | null;
  photoUrls: string[] | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Energy Display Config
// ============================================================================

export interface EnergyConfig {
  gradient: string;
  bg: string;
  border: string;
  emoji: string;
  label: string;
}

export const ENERGY_CONFIG: Record<VibeEnergy, EnergyConfig> = {
  chill: {
    gradient: "from-primary/50 to-primary/70",
    bg: "bg-primary/10",
    border: "border-primary/25",
    emoji: "🧊",
    label: "Chill",
  },
  moderate: {
    gradient: "from-primary/65 to-primary/85",
    bg: "bg-primary/[0.16]",
    border: "border-primary/35",
    emoji: "☀️",
    label: "Moderate",
  },
  high: {
    gradient: "from-primary/80 to-primary",
    bg: "bg-primary/[0.24]",
    border: "border-primary/45",
    emoji: "⚡",
    label: "High Energy",
  },
  chaotic: {
    gradient: "from-primary to-rose-500",
    bg: "bg-primary/[0.32]",
    border: "border-primary/60",
    emoji: "🌪️",
    label: "Chaotic",
  },
};

// ============================================================================
// Vibe Tag Categories — Self-description tags for onboarding
// ============================================================================

export const VIBE_TAG_CATEGORIES: HintTagCategory[] = [
  {
    label: "Lifestyle",
    emoji: "🏠",
    tags: [
      "University student",
      "Working professional",
      "Freelancer",
      "Digital nomad",
      "Entrepreneur",
    ],
  },
  {
    label: "Hobbies",
    emoji: "🎯",
    tags: [
      "Loves hiking",
      "Gym enthusiast",
      "Music lover",
      "Bookworm",
      "Gamer",
      "Traveler",
      "Photographer",
      "Artist",
    ],
  },
  {
    label: "My Vibe",
    emoji: "✨",
    tags: [
      "Introvert",
      "Extrovert",
      "Ambivert",
      "Creative soul",
      "Old soul",
      "Free spirit",
      "Romantic",
      "Adventurous",
    ],
  },
  {
    label: "Food & Drink",
    emoji: "🍕",
    tags: [
      "Foodie",
      "Coffee addict",
      "Home cook",
      "Cocktail enthusiast",
      "Tea lover",
      "Health-conscious",
    ],
  },
  {
    label: "Pets & Nature",
    emoji: "🐾",
    tags: [
      "Dog person",
      "Cat person",
      "Plant parent",
      "Nature lover",
      "Animal lover",
    ],
  },
  {
    label: "Date Style",
    emoji: "💫",
    tags: [
      "Coffee & deep talks",
      "Adventure activities",
      "Cozy movie nights",
      "Live music & concerts",
      "Cooking together",
      "Travel & explore",
    ],
  },
];
