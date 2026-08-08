import { TRPCError } from "@trpc/server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { authedProcedure } from "@/server/init";
import { vibeMatches, matchPlanCache } from "../schema";
import { vibeProfiles } from "@/services/vibe-profiles/schema";
import { analyzerSessions } from "@/services/verification/schema";
import { users } from "@/services/users/schema";
import {
  fetchEnvironmentContext,
  geocodePlace,
  searchCities,
  type PlaceResult,
} from "@/services/environment";
import {
  evaluateMatch,
  type ProfileSummary,
  type LLMMissionPlanData,
  type MatchPlanPlaceCandidate,
} from "@/services/llm/client";
import {
  missionInstances,
  missionTemplates,
  userMissionProgress,
} from "@/services/missions/schema";

const indoorPlaceTypes = new Set([
  "restaurant",
  "cafe",
  "bar",
  "museum",
  "art_gallery",
  "movie_theater",
  "bowling_alley",
  "shopping_mall",
  "library",
]);

const cacheTtlMs = 1000 * 60 * 60 * 12;
const reusableMissionStatuses = new Set(["proposed", "accepted", "active"]);
const defaultMatchCity = "Ho Chi Minh City";

const generateMatchPlanInput = z.object({
  matchId: z.uuid(),
  useMock: z.boolean().optional().default(false),
  forceRegenerate: z.boolean().optional().default(false),
});

const getMatchPlanInput = z.object({
  matchId: z.uuid(),
});

function toProfileSummary(profile: {
  userId: string;
  vibeName: string;
  vibeSummary: string | null;
  energy: "chill" | "moderate" | "high" | "chaotic";
  moodTags: string[] | null;
  styleTags: string[] | null;
  interestTags: string[] | null;
}): ProfileSummary {
  return {
    userId: profile.userId,
    vibeName: profile.vibeName,
    vibeSummary: profile.vibeSummary ?? undefined,
    energy: profile.energy,
    moodTags: profile.moodTags ?? [],
    styleTags: profile.styleTags ?? [],
    interestTags: profile.interestTags ?? [],
  };
}

function isRain(description: string | undefined): boolean {
  if (!description) return false;
  const normalized = description.toLowerCase();
  return (
    normalized.includes("rain") ||
    normalized.includes("drizzle") ||
    normalized.includes("storm") ||
    normalized.includes("thunder")
  );
}

function isIndoorPlace(place: PlaceResult): boolean {
  return place.types.some((type) => indoorPlaceTypes.has(type));
}

function sanitizeDistrict(vicinity: string): string {
  const parts = vicinity
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "Unknown district";
  if (parts.length === 1) return parts[0]!;
  return parts[parts.length - 2] ?? parts[0]!;
}

function toPlaceCandidates(places: PlaceResult[]): MatchPlanPlaceCandidate[] {
  return places.slice(0, 5).map((place) => ({
    name: place.name,
    placeId: place.placeId,
    district: sanitizeDistrict(place.vicinity),
    placeType: place.types[0] ?? "point_of_interest",
    types: place.types,
    isIndoor: isIndoorPlace(place),
  }));
}

function buildFallbackPlaces(city: string): PlaceResult[] {
  return [
    {
      name: `${city} Cozy Cafe`,
      placeId: `fallback_${city.replace(/\s+/g, "_").toLowerCase()}_cafe`,
      vicinity: `${city}, Central District`,
      types: ["cafe", "food", "point_of_interest"],
    },
    {
      name: `${city} Art Spot`,
      placeId: `fallback_${city.replace(/\s+/g, "_").toLowerCase()}_gallery`,
      vicinity: `${city}, Arts District`,
      types: ["art_gallery", "museum", "point_of_interest"],
    },
    {
      name: `${city} Rooftop Lounge`,
      placeId: `fallback_${city.replace(/\s+/g, "_").toLowerCase()}_bar`,
      vicinity: `${city}, Riverside District`,
      types: ["bar", "restaurant", "point_of_interest"],
    },
    {
      name: `${city} Night Market Corner`,
      placeId: `fallback_${city.replace(/\s+/g, "_").toLowerCase()}_market`,
      vicinity: `${city}, Old Quarter`,
      types: ["restaurant", "shopping_mall", "point_of_interest"],
    },
    {
      name: `${city} Indie Cinema`,
      placeId: `fallback_${city.replace(/\s+/g, "_").toLowerCase()}_cinema`,
      vicinity: `${city}, West District`,
      types: ["movie_theater", "point_of_interest"],
    },
  ];
}

async function resolveLocationFromAnalyzerCity(city: string) {
  const suggestions = await searchCities(city);
  if (!suggestions.length) return null;

  const bestMatch =
    suggestions.find(
      (item) => item.mainText.toLowerCase() === city.toLowerCase(),
    ) ?? suggestions[0];

  if (!bestMatch) return null;
  return geocodePlace(bestMatch.placeId);
}

/**
 * Looks up the template every AI-generated match plan hangs its mission off.
 *
 * This used to insert the row when it was missing, which could never work:
 * mission_templates is catalogue content and deliberately has no INSERT policy
 * (see 00008), so the write failed with 42501 every time — and it ran *after*
 * the LLM call, so each attempt burned a paid completion before dying. Because
 * every template seeded by 00007 is generated_by = 'manual', the lookup never
 * matched and the doomed insert path was the only path.
 *
 * The row is now seeded by migration 00014. Its absence means migrations have
 * not been applied, which is an operator problem, so it fails loudly here
 * rather than being papered over with a write that cannot succeed.
 */
async function getAiTemplateOrThrow(tx: any) {
  const [existingTemplate] = await tx
    .select()
    .from(missionTemplates)
    .where(eq(missionTemplates.generatedBy, "ai-match-plan"))
    .orderBy(desc(missionTemplates.createdAt))
    .limit(1);

  if (!existingTemplate) {
    throw new Error(
      "No mission template with generated_by = 'ai-match-plan'. " +
        "Apply supabase/migrations/00014_schema_drift_and_partner_policies.sql.",
    );
  }

  return existingTemplate;
}

async function getMatchOrThrow(
  ctx: {
    user: { id: string };
    secureDb: {
      rls: (callback: (tx: any) => Promise<unknown>) => Promise<unknown>;
    };
  },
  matchId: string,
) {
  const result = (await ctx.secureDb.rls(async (tx) => {
    return tx
      .select()
      .from(vibeMatches)
      .where(
        and(
          eq(vibeMatches.id, matchId),
          or(
            eq(vibeMatches.userAId, ctx.user.id),
            eq(vibeMatches.userBId, ctx.user.id),
          ),
        ),
      )
      .limit(1);
  })) as Array<typeof vibeMatches.$inferSelect>;

  const [match] = result;

  if (!match) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Match not found or not accessible.",
    });
  }

  return match;
}

export const generateMatchPlan = authedProcedure
  .input(generateMatchPlanInput)
  .mutation(async ({ ctx, input }) => {
    const match = await getMatchOrThrow(ctx as any, input.matchId);

    const [cachedRow] = await ctx.secureDb!.rls(async (tx) => {
      return tx
        .select()
        .from(matchPlanCache)
        .where(eq(matchPlanCache.matchId, input.matchId))
        .limit(1);
    });

    const [cachedMissionInstance] = await ctx.secureDb!.rls(async (tx) => {
      if (!cachedRow?.missionInstanceId) return [];

      return tx
        .select({
          id: missionInstances.id,
          status: missionInstances.status,
        })
        .from(missionInstances)
        .where(eq(missionInstances.id, cachedRow.missionInstanceId))
        .limit(1);
    });

    const canReuseCachedPlan =
      !input.forceRegenerate &&
      Boolean(cachedRow?.plan) &&
      (!cachedRow?.missionInstanceId ||
        (cachedMissionInstance
          ? reusableMissionStatuses.has(cachedMissionInstance.status)
          : false));

    if (canReuseCachedPlan) {
      let resolvedExpiresAt = cachedRow?.expiresAt ?? null;

      if (cachedRow?.expiresAt && cachedRow.expiresAt <= new Date()) {
        resolvedExpiresAt = new Date(Date.now() + cacheTtlMs);

        await ctx.secureDb!.rls(async (tx) => {
          await tx
            .update(matchPlanCache)
            .set({
              updatedAt: new Date(),
              expiresAt: resolvedExpiresAt,
            })
            .where(eq(matchPlanCache.matchId, input.matchId));
        });
      }

      const [progressRows, myProgress] = await ctx.secureDb!.rls(async (tx) => {
        const allProgress = cachedRow.missionInstanceId
          ? await tx
              .select()
              .from(userMissionProgress)
              .where(
                eq(userMissionProgress.instanceId, cachedRow.missionInstanceId),
              )
          : [];

        const mine = cachedRow.missionInstanceId
          ? await tx
              .select()
              .from(userMissionProgress)
              .where(
                and(
                  eq(
                    userMissionProgress.instanceId,
                    cachedRow.missionInstanceId,
                  ),
                  eq(userMissionProgress.userId, ctx.user.id),
                ),
              )
              .limit(1)
          : [];

        return [allProgress, mine[0] ?? null] as const;
      });

      const acceptedCount = progressRows.filter(
        (item) => item.hasAccepted,
      ).length;
      const totalParticipants = progressRows.length;

      return {
        ...(cachedRow.plan as Record<string, unknown>),
        missionInstanceId: cachedRow.missionInstanceId,
        cache: {
          hit: true,
          generatedAt: cachedRow.generatedAt,
          expiresAt: resolvedExpiresAt,
        },
        acceptance: {
          acceptedCount,
          totalParticipants,
          acceptedByCurrentUser: myProgress?.hasAccepted ?? false,
          revealUnlocked:
            totalParticipants > 0 && acceptedCount === totalParticipants,
        },
      };
    }

    const [profileA] = await ctx.secureDb!.rls(async (tx) => {
      return tx
        .select()
        .from(vibeProfiles)
        .where(
          and(
            eq(vibeProfiles.userId, match.userAId),
            eq(vibeProfiles.isActive, true),
          ),
        )
        .limit(1);
    });

    const [profileB] = await ctx.secureDb!.rls(async (tx) => {
      return tx
        .select()
        .from(vibeProfiles)
        .where(
          and(
            eq(vibeProfiles.userId, match.userBId),
            eq(vibeProfiles.isActive, true),
          ),
        )
        .limit(1);
    });

    if (!profileA || !profileB) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Both users must have active vibe profiles before generating a mission plan.",
      });
    }

    const [myLatestAnalyzerSession] = await ctx.secureDb!.rls(async (tx) => {
      return tx
        .select({ city: analyzerSessions.city })
        .from(analyzerSessions)
        .where(
          and(
            eq(analyzerSessions.userId, ctx.user.id),
            sql`${analyzerSessions.city} IS NOT NULL`,
          ),
        )
        .orderBy(desc(analyzerSessions.createdAt))
        .limit(1);
    });

    const counterpartUserId =
      match.userAId === ctx.user.id ? match.userBId : match.userAId;

    const [partnerLatestAnalyzerSession] = await ctx.secureDb!.rls(
      async (tx) => {
        return tx
          .select({ city: analyzerSessions.city })
          .from(analyzerSessions)
          .where(
            and(
              eq(analyzerSessions.userId, counterpartUserId),
              sql`${analyzerSessions.city} IS NOT NULL`,
            ),
          )
          .orderBy(desc(analyzerSessions.createdAt))
          .limit(1);
      },
    );

    const locationCity =
      myLatestAnalyzerSession?.city ??
      partnerLatestAnalyzerSession?.city ??
      defaultMatchCity;

    let environmentContext: {
      city: string;
      weather?: {
        temp: number;
        feelsLike: number;
        description: string;
        icon: string;
        humidity: number;
        windSpeed: number;
      };
      nearbyPlaces: PlaceResult[];
    } = {
      city: locationCity,
      nearbyPlaces: buildFallbackPlaces(locationCity),
    };

    try {
      const geocoded = await resolveLocationFromAnalyzerCity(locationCity);
      if (geocoded) {
        const fetched = await fetchEnvironmentContext(
          geocoded.lat,
          geocoded.lng,
        );
        if (fetched?.nearbyPlaces?.length) {
          environmentContext = {
            city: fetched.city || locationCity,
            weather: fetched.weather,
            nearbyPlaces: fetched.nearbyPlaces,
          };
        }
      }
    } catch {
      // Keep fallback city + places to avoid blocking mission generation.
    }

    const rainy = isRain(environmentContext.weather?.description);
    const rainFiltered = rainy
      ? environmentContext.nearbyPlaces.filter(isIndoorPlace)
      : environmentContext.nearbyPlaces;

    const selectedPlaces = (
      rainFiltered.length >= 5
        ? rainFiltered
        : [
            ...rainFiltered,
            ...environmentContext.nearbyPlaces.filter(
              (place) => !rainFiltered.includes(place),
            ),
          ]
    ).slice(0, 5);

    if (!selectedPlaces.length) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No suitable place candidates found for mission generation.",
      });
    }

    let rawVectorDistance: number | undefined;
    let vectorSimilarity: number | undefined;
    try {
      const simResult = await ctx.secureDb!.rls(async (tx) => {
        return tx.execute(sql`
          SELECT (a.embedding <=> b.embedding) AS distance
          FROM vibe_profiles a, vibe_profiles b
          WHERE a.user_id = ${match.userAId}
            AND b.user_id = ${match.userBId}
            AND a.embedding IS NOT NULL
            AND b.embedding IS NOT NULL
        `);
      });

      if (
        Array.isArray(simResult) &&
        simResult.length > 0 &&
        simResult[0] != null &&
        Number.isFinite(
          Number((simResult[0] as Record<string, unknown>).distance),
        )
      ) {
        rawVectorDistance = Number(
          (simResult[0] as Record<string, unknown>).distance,
        );
        vectorSimilarity = Math.max(0, Math.min(1, 1 - rawVectorDistance));
      }
    } catch {
      rawVectorDistance = undefined;
      vectorSimilarity = undefined;
    }

    const profileSummaryA = toProfileSummary(profileA);
    const profileSummaryB = toProfileSummary(profileB);

    const placeCandidates = toPlaceCandidates(selectedPlaces);
    const placeCandidatesWithPhotos = placeCandidates.map((candidate) => {
      const source = selectedPlaces.find(
        (place) => place.placeId === candidate.placeId,
      );

      return {
        ...candidate,
        photoUrl: source?.staticMapUrl,
      };
    });

    const llmResult = await evaluateMatch({
      profileA: profileSummaryA,
      profileB: profileSummaryB,
      vectorSimilarity,
      useMock: input.useMock,
      environmentContext: {
        city: environmentContext.city,
        weather: environmentContext.weather
          ? {
              condition: rainy ? "Rain" : "Clear",
              description: environmentContext.weather.description,
              temp: environmentContext.weather.temp,
            }
          : undefined,
      },
      placeCandidates,
    });

    const data = llmResult.data as LLMMissionPlanData;

    const selectedPlace = selectedPlaces.find(
      (place) => place.placeId === data.mission.locationId,
    );

    const [userA, userB] = await ctx.secureDb!.rls(async (tx) => {
      const usersResult = await tx
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(or(eq(users.id, match.userAId), eq(users.id, match.userBId)));

      return [
        usersResult.find((item) => item.id === match.userAId) ?? null,
        usersResult.find((item) => item.id === match.userBId) ?? null,
      ] as const;
    });

    const missionRecord = await ctx.secureDb!.rls(async (tx) => {
      const template = await getAiTemplateOrThrow(tx);

      const [createdInstance] = await tx
        .insert(missionInstances)
        .values({
          templateId: template.id,
          matchId: match.id,
          customTitle: data.mission.title,
          customObjectives: [{ step: 1, task: data.mission.task }],
          locationName: selectedPlace?.name,
          locationLat: selectedPlace?.lat,
          locationLng: selectedPlace?.lng,
          locationPlaceId: data.mission.locationId,
          status: "proposed",
        })
        .returning();

      await tx.insert(userMissionProgress).values([
        {
          instanceId: createdInstance.id,
          userId: match.userAId,
          hasAccepted: false,
        },
        {
          instanceId: createdInstance.id,
          userId: match.userBId,
          hasAccepted: false,
        },
      ]);

      return createdInstance;
    });

    const resolvedSimilarityScore =
      typeof data.similarityScore === "number"
        ? data.similarityScore
        : (vectorSimilarity ?? match.similarity);

    const responsePlan = {
      matchId: match.id,
      userA: {
        id: match.userAId,
        displayName:
          [userA?.firstName, userA?.lastName].filter(Boolean).join(" ") ||
          "User A",
        vibeName: profileA.vibeName,
      },
      userB: {
        id: match.userBId,
        displayName:
          [userB?.firstName, userB?.lastName].filter(Boolean).join(" ") ||
          "User B",
        vibeName: profileB.vibeName,
      },
      mission: {
        title: data.mission.title,
        task: data.mission.task,
        locationId: data.mission.locationId,
        locationName: selectedPlace?.name ?? null,
        locationDistrict: selectedPlace
          ? sanitizeDistrict(selectedPlace.vicinity)
          : null,
        photoUrl: selectedPlace?.staticMapUrl ?? null,
      },
      similarityScore: resolvedSimilarityScore,
      rawVectorDistance,
      successProbability: data.successProbability,
      narrative: data.narrative,
      weatherContext: environmentContext.weather
        ? {
            condition: rainy ? "Rain" : "Clear",
            description: environmentContext.weather.description,
            temp: environmentContext.weather.temp,
          }
        : null,
      placeCandidates,
      llmMeta: llmResult.meta,
    };

    responsePlan.placeCandidates = placeCandidatesWithPhotos;

    await ctx.secureDb!.rls(async (tx) => {
      await tx
        .update(vibeMatches)
        .set({
          similarity: resolvedSimilarityScore,
          compatibility: {
            ...((match.compatibility as Record<string, unknown>) ?? {}),
            narrative: responsePlan.narrative,
            successProbability: responsePlan.successProbability,
            rawVectorDistance,
            mission: responsePlan.mission,
            environment: {
              city: environmentContext.city,
              weather: responsePlan.weatherContext,
            },
          },
        })
        .where(eq(vibeMatches.id, match.id));

      await tx
        .insert(matchPlanCache)
        .values({
          matchId: match.id,
          missionInstanceId: missionRecord.id,
          plan: responsePlan,
          generatedAt: new Date(),
          updatedAt: new Date(),
          expiresAt: new Date(Date.now() + cacheTtlMs),
        })
        .onConflictDoUpdate({
          target: matchPlanCache.matchId,
          set: {
            missionInstanceId: missionRecord.id,
            plan: responsePlan,
            generatedAt: new Date(),
            updatedAt: new Date(),
            expiresAt: new Date(Date.now() + cacheTtlMs),
          },
        });
    });

    return {
      ...responsePlan,
      missionInstanceId: missionRecord.id,
      cache: {
        hit: false,
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + cacheTtlMs),
      },
      acceptance: {
        acceptedCount: 0,
        totalParticipants: 2,
        acceptedByCurrentUser: false,
        revealUnlocked: false,
      },
    };
  });

export const getMatchPlan = authedProcedure
  .input(getMatchPlanInput)
  .query(async ({ ctx, input }) => {
    await getMatchOrThrow(ctx as any, input.matchId);

    const [cachedRow] = await ctx.secureDb!.rls(async (tx) => {
      return tx
        .select()
        .from(matchPlanCache)
        .where(eq(matchPlanCache.matchId, input.matchId))
        .limit(1);
    });

    if (!cachedRow?.plan) {
      return null;
    }

    const [progressRows, myProgress] = await ctx.secureDb!.rls(async (tx) => {
      const allProgress = cachedRow.missionInstanceId
        ? await tx
            .select()
            .from(userMissionProgress)
            .where(
              eq(userMissionProgress.instanceId, cachedRow.missionInstanceId),
            )
        : [];

      const mine = cachedRow.missionInstanceId
        ? await tx
            .select()
            .from(userMissionProgress)
            .where(
              and(
                eq(userMissionProgress.instanceId, cachedRow.missionInstanceId),
                eq(userMissionProgress.userId, ctx.user.id),
              ),
            )
            .limit(1)
        : [];

      return [allProgress, mine[0] ?? null] as const;
    });

    const acceptedCount = progressRows.filter(
      (item) => item.hasAccepted,
    ).length;
    const totalParticipants = progressRows.length;

    return {
      ...(cachedRow.plan as Record<string, unknown>),
      missionInstanceId: cachedRow.missionInstanceId,
      cache: {
        hit: true,
        generatedAt: cachedRow.generatedAt,
        expiresAt: cachedRow.expiresAt,
      },
      acceptance: {
        acceptedCount,
        totalParticipants,
        acceptedByCurrentUser: myProgress?.hasAccepted ?? false,
        revealUnlocked:
          totalParticipants > 0 && acceptedCount === totalParticipants,
      },
    };
  });
