/**
 * Analyzer Types — Shared type definitions for the Profile Analyzer feature
 *
 * This file is the single source of truth for all analyzer-related types
 * used across the page, components, and tRPC procedures.
 */

// ============================================================================
// Core Types
// ============================================================================

export type PredictedStyle =
  | "direct"
  | "playful"
  | "intellectual"
  | "shy"
  | "adventurous";

export interface VibePrediction {
  confidence: number;
  dominantTrait: string;
  secondaryTrait: string;
  summary: string;
  communicationTips: string[];
}

export interface DateSuggestion {
  title: string;
  description: string;
  vibeMatch: number;
  estimatedCost: string;
  duration: string;
  /** Populated when environmental context is available */
  placeName?: string;
  placeId?: string;
  whyThisSpot?: string;
  /** Coordinates for map pin */
  lat?: number;
  lng?: number;
  /** Conversation context for sustaining chat around this date spot */
  icebreakerQuestion?: string;
  followUpQuestions?: string[];
  topicCues?: string[];
  doTips?: string[];
  avoidTips?: string[];
  bestTimingCue?: string;
}

// ============================================================================
// Environmental Context Types
// ============================================================================

export interface WeatherContext {
  temp: number;
  feelsLike: number;
  description: string;
  icon: string;
  humidity: number;
  windSpeed: number;
}

export interface NearbyPlace {
  name: string;
  placeId: string;
  vicinity: string;
  rating?: number;
  types: string[];
  staticMapUrl?: string;
  /** Coordinates for map pin */
  lat?: number;
  lng?: number;
}

export interface EnvironmentContext {
  city: string;
  weather?: WeatherContext;
  nearbyPlaces: NearbyPlace[];
}

// ============================================================================
// Location Input (from browser Geolocation API)
// ============================================================================

export interface LocationInput {
  lat: number;
  lng: number;
  /** City name when selected via city search */
  cityName?: string;
}

// ============================================================================
// Analyzer Result
// ============================================================================

export interface AnalyzerResult {
  id: string;
  userId: string;
  imageHash: string;
  hintTags: string[];
  predictedStyle: PredictedStyle;
  vibePrediction: VibePrediction;
  conversationOpeners: string[];
  dateSuggestions: DateSuggestion[];
  modelVersion: string;
  latencyMs: number;
  createdAt: string;
  /** Environmental context — present when user shared location */
  city?: string;
  weatherContext?: WeatherContext;
  locationContext?: Record<string, unknown>;
  nearbyPlaces?: NearbyPlace[];
}

// ============================================================================
// History Summary (lightweight, for list view)
// ============================================================================

export interface AnalyzerSessionSummary {
  id: string;
  predictedStyle: PredictedStyle;
  vibePrediction: VibePrediction;
  city?: string;
  createdAt: string;
}

// ============================================================================
// Style Configuration
// ============================================================================

export interface StyleConfig {
  gradient: string;
  bg: string;
  border: string;
  emoji: string;
}

export const STYLE_CONFIG: Record<PredictedStyle, StyleConfig> = {
  direct: {
    gradient: "from-primary to-rose-500",
    bg: "bg-primary/10",
    border: "border-primary/30",
    emoji: "🎯",
  },
  playful: {
    gradient: "from-primary to-rose-500",
    bg: "bg-primary/10",
    border: "border-primary/30",
    emoji: "😄",
  },
  intellectual: {
    gradient: "from-primary to-rose-500",
    bg: "bg-primary/10",
    border: "border-primary/30",
    emoji: "🧠",
  },
  shy: {
    gradient: "from-primary to-rose-500",
    bg: "bg-primary/10",
    border: "border-primary/30",
    emoji: "🌸",
  },
  adventurous: {
    gradient: "from-primary to-rose-500",
    bg: "bg-primary/10",
    border: "border-primary/30",
    emoji: "🏔️",
  },
};

// ============================================================================
// Hint Tag Categories — Predefined multiple-choice options
// ============================================================================

export interface HintTagCategory {
  label: string;
  emoji: string;
  tags: string[];
}

export const HINT_TAG_CATEGORIES: HintTagCategory[] = [
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
    label: "Personality",
    emoji: "✨",
    tags: [
      "Introvert",
      "Extrovert",
      "Ambivert",
      "Creative soul",
      "Old soul",
      "Free spirit",
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
];
