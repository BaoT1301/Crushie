"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import {
  Camera,
  Crown,
  Gift,
  Heart,
  Loader2,
  MapPin,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardError } from "@/components/error-display";
import { DemoProfileBadge } from "@/components/discover/demo-profile-badge";
import { supabaseBrowser } from "@/lib/supabase-browser";

// ── Types ───────────────────────────────────────────────────────────────

type Candidate = {
  userId: string;
  vibeName?: string;
  vibeSummary?: string;
  energy?: "chill" | "moderate" | "high" | "chaotic";
  interestTags?: string[];
  styleTags?: string[];
  moodTags?: string[];
  /** Set server-side for the seeded sample profiles. See DemoProfileBadge. */
  isDemo?: boolean;
};

type MatchUserProfile = {
  id: string;
  displayName: string;
  gender: string | null;
  imageUrl: string | null;
  vibeName: string | null;
  vibeSummary: string | null;
  bio: string | null;
  energy: string | null;
  photoUrls: string[];
  interestTags: string[];
  isVerified: boolean;
  /** Seeded sample profile — labelled in the chat header. */
  isDemo?: boolean;
};

type EnrichedMatch = {
  id: string;
  userAId: string;
  userBId: string;
  similarity: number;
  compatibility: any;
  isMutual: boolean;
  matchedAt: string | Date;
  userA: MatchUserProfile;
  userB: MatchUserProfile;
};

// ── Helpers ─────────────────────────────────────────────────────────────

function toCandidate(item: any): Candidate | null {
  const userId =
    item?.userId ??
    item?.profile?.userId ??
    item?.id ??
    item?.profile?.id ??
    null;
  if (!userId) return null;
  const profile = item?.profile ?? item;
  return {
    userId,
    vibeName: profile?.vibeName,
    vibeSummary: profile?.vibeSummary,
    energy: profile?.energy,
    interestTags: Array.isArray(profile?.interestTags)
      ? profile.interestTags
      : [],
    styleTags: Array.isArray(profile?.styleTags) ? profile.styleTags : [],
    moodTags: Array.isArray(profile?.moodTags) ? profile.moodTags : [],
    isDemo: profile?.isDemo === true,
  };
}

function genderLabel(gender: string | null) {
  if (!gender) return null;
  const map: Record<string, string> = {
    male: "♂ Male",
    female: "♀ Female",
    "non-binary": "⚧ Non-binary",
    "prefer-not-to-say": "Not specified",
  };
  return map[gender] ?? gender;
}

/**
 * Vector similarity is a cosine score. Showing "Sim: 0.87" to someone using a
 * dating app leaks the implementation and means nothing to them, so it is
 * bucketed into language they can act on.
 */
function similarityLabel(score: number) {
  if (score >= 0.85) return "Strong match";
  if (score >= 0.7) return "Good match";
  if (score >= 0.55) return "Some overlap";
  return "Worth a look";
}

function energyColor(energy: string | null) {
  switch (energy) {
    case "chill":
      return "bg-primary/10 text-primary/75";
    case "moderate":
      return "bg-primary/[0.18] text-primary";
    case "high":
      return "bg-primary/[0.28] text-primary";
    case "chaotic":
      return "bg-primary text-primary-foreground";
    default:
      return "";
  }
}

function AvatarImg({
  profile,
  size = "md",
}: {
  profile: MatchUserProfile;
  size?: "sm" | "md" | "lg";
}) {
  const src = profile.photoUrls?.[0] ?? profile.imageUrl;
  const sizeClass =
    size === "lg" ? "h-16 w-16" : size === "md" ? "h-10 w-10" : "h-8 w-8";

  return src ? (
    <img
      src={src}
      alt={profile.displayName}
      className={`${sizeClass} rounded-full object-cover ring-2 ring-border`}
    />
  ) : (
    <div
      className={`${sizeClass} flex items-center justify-center rounded-full bg-primary/10 ring-2 ring-border`}
    >
      <Users className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

/**
 * The side of the match that is not the signed-in user.
 *
 * This used to infer "me" as the id shared by every match, which needs at least
 * two matches to be decidable — so on a user's very first match it fell back to
 * `userB` and showed them their own profile roughly half the time. The id now
 * comes from `users.getMe`, which is correct at one match.
 */
function getOtherUser(
  match: EnrichedMatch,
  myId: string | null,
): MatchUserProfile {
  if (!myId) return match.userB;
  return myId === match.userAId ? match.userB : match.userA;
}

// ═══════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════

export default function DiscoverPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const defaultTab = searchParams.get("tab") ?? "discover";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [autogenMatchId, setAutogenMatchId] = useState<string | null>(null);
  const [selectedPlaceByMatch, setSelectedPlaceByMatch] = useState<
    Record<string, string>
  >({});
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [uploadedProofUrl, setUploadedProofUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ═══════════════════════════════════════════════════════════════════
  // Queries
  // ═══════════════════════════════════════════════════════════════════

  const meQuery = useQuery(trpc.users.getMe.queryOptions());
  const vibeMatchQuery = useQuery(trpc.llm.vibeMatch.queryOptions({}));
  const connectionsQuery = useQuery(
    trpc.social.listConnections.queryOptions({ status: "pending" }),
  );
  const matchesQuery = useQuery(
    trpc.social.listMatches.queryOptions({ limit: 20 }),
  );
  const pointsQuery = useQuery(trpc.social.getMyPoints.queryOptions());
  const pointsHistoryQuery = useQuery(
    trpc.social.getPointsHistory.queryOptions({ limit: 10 }),
  );
  const levelQuery = useQuery(trpc.academy.getMyLevel.queryOptions());
  const rewardsQuery = useQuery(trpc.academy.listRewards.queryOptions());
  const myRewardsQuery = useQuery(trpc.academy.getMyRewards.queryOptions());

  const messagesQuery = useQuery(
    trpc.chat.listMessages.queryOptions(
      { matchId: selectedMatchId ?? "", limit: 50 },
      { enabled: Boolean(selectedMatchId) },
    ),
  );

  const planQuery = useQuery(
    trpc.social.getMatchPlan.queryOptions(
      { matchId: selectedMatchId ?? "" },
      { enabled: Boolean(selectedMatchId) },
    ),
  );

  // ═══════════════════════════════════════════════════════════════════
  // Mutations
  // ═══════════════════════════════════════════════════════════════════

  const evaluateMatchMutation = useMutation(
    trpc.llm.evaluateMatch.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.social.listMatches.queryFilter({ limit: 20 }),
        );
        await queryClient.invalidateQueries(trpc.llm.vibeMatch.queryFilter({}));
      },
    }),
  );

  const connectMutation = useMutation(
    trpc.social.sendRequest.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries(
          trpc.social.listConnections.queryFilter({ status: "pending" }),
        );
        if ((result as any)?.mutual && (result as any)?.targetUserId) {
          await evaluateMatchMutation.mutateAsync({
            targetUserId: (result as any).targetUserId,
          });
          await queryClient.invalidateQueries(
            trpc.social.listMatches.queryFilter({ limit: 20 }),
          );
          await matchesQuery.refetch();
          setActiveTab("connected");
        }
      },
    }),
  );

  const generatePlanMutation = useMutation(
    trpc.social.generateMatchPlan.mutationOptions({
      onSuccess: async () => {
        if (!selectedMatchId) return;
        await queryClient.invalidateQueries(
          trpc.social.getMatchPlan.queryFilter({ matchId: selectedMatchId }),
        );
      },
    }),
  );

  const acceptMissionMutation = useMutation(
    trpc.missions.accept.mutationOptions({
      onSuccess: async () => {
        if (!selectedMatchId) return;
        generatePlanMutation.reset();
        await queryClient.invalidateQueries(
          trpc.social.getMatchPlan.queryFilter({ matchId: selectedMatchId }),
        );
        await queryClient.invalidateQueries(
          trpc.social.listMatches.queryFilter({ limit: 20 }),
        );
      },
    }),
  );

  const uploadProofMutation = useMutation(
    trpc.uploads.uploadProofImage.mutationOptions({}),
  );

  const checkinMutation = useMutation(
    trpc.missions.checkin.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries(
          trpc.social.getMyPoints.queryFilter(),
        );
        await queryClient.invalidateQueries(
          trpc.social.getPointsHistory.queryFilter({ limit: 10 }),
        );
        await queryClient.invalidateQueries(
          trpc.academy.getMyLevel.queryFilter(),
        );
        const matchId = (result as any)?.matchId ?? selectedMatchId;
        if (matchId) {
          await queryClient.invalidateQueries(
            trpc.social.getMatchPlan.queryFilter({ matchId }),
          );
          if ((result as any)?.completed) {
            generatePlanMutation.reset();
            await generatePlanMutation.mutateAsync({
              matchId,
              forceRegenerate: true,
            });
            await queryClient.invalidateQueries(
              trpc.social.getMatchPlan.queryFilter({ matchId }),
            );
          }
        }
        setProofFile(null);
        setProofPreview(null);
        setUploadedProofUrl(null);
      },
    }),
  );

  const sendMessageMutation = useMutation(
    trpc.chat.sendMessage.mutationOptions({
      onSuccess: async () => {
        setChatInput("");
        if (selectedMatchId) {
          await queryClient.invalidateQueries(
            trpc.chat.listMessages.queryFilter({
              matchId: selectedMatchId,
              limit: 50,
            }),
          );
        }
      },
    }),
  );

  const redeemRewardMutation = useMutation(
    trpc.academy.redeemReward.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.academy.getMyLevel.queryFilter(),
        );
        await queryClient.invalidateQueries(
          trpc.social.getMyPoints.queryFilter(),
        );
        await queryClient.invalidateQueries(
          trpc.academy.getMyRewards.queryFilter(),
        );
        await queryClient.invalidateQueries(
          trpc.academy.listRewards.queryFilter(),
        );
      },
    }),
  );

  // ═══════════════════════════════════════════════════════════════════
  // Derived
  // ═══════════════════════════════════════════════════════════════════

  const response = vibeMatchQuery.data as any;
  const candidates = useMemo(() => {
    const raw = Array.isArray(response?.data)
      ? response.data
      : Array.isArray(response?.data?.matches)
        ? response.data.matches
        : Array.isArray(response?.data?.topMatches)
          ? response.data.topMatches
          : Array.isArray(response?.topMatches)
            ? response.topMatches
            : [];
    return raw.map(toCandidate).filter(Boolean) as Candidate[];
  }, [response]);

  const myId = meQuery.data?.id ?? null;
  /* Memoised for the same reason as `messages` below — the effects that pick a
     default match depend on it, and an inline `?? []` re-ran them every render. */
  const matches = useMemo(
    () => (matchesQuery.data ?? []) as EnrichedMatch[],
    [matchesQuery.data],
  );
  const pendingIncoming = (connectionsQuery.data ?? []) as Array<any>;
  const plan = (planQuery.data ?? generatePlanMutation.data ?? null) as any;
  /* Memoised because `data?.items ?? []` is a new array on every render, and
     the auto-scroll effect below depends on it — an unmemoised fallback made
     the chat smooth-scroll the document continuously. */
  const messages = useMemo(
    () => messagesQuery.data?.items ?? [],
    [messagesQuery.data],
  );

  const selectedMatch = matches.find((m) => m.id === selectedMatchId);

  const canAcceptMission =
    Boolean(plan?.missionInstanceId) &&
    !plan?.acceptance?.acceptedByCurrentUser &&
    !acceptMissionMutation.isPending;

  const isMissionLoading =
    planQuery.isLoading ||
    generatePlanMutation.isPending ||
    acceptMissionMutation.isPending ||
    checkinMutation.isPending;

  const topPlaceCandidates = (
    Array.isArray(plan?.placeCandidates) ? plan.placeCandidates : []
  ).slice(0, 3) as Array<{
    name: string;
    placeId: string;
    district: string;
    placeType: string;
    isIndoor: boolean;
    photoUrl?: string;
  }>;

  const selectedPlaceId = selectedMatchId
    ? selectedPlaceByMatch[selectedMatchId]
    : undefined;

  // ═══════════════════════════════════════════════════════════════════
  // Effects
  // ═══════════════════════════════════════════════════════════════════

  useEffect(() => {
    const fromQuery = searchParams.get("matchId");
    if (fromQuery) {
      setSelectedMatchId(fromQuery);
      setActiveTab("connected");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!selectedMatchId && matches.length > 0) {
      setSelectedMatchId(matches[0]!.id);
    }
  }, [matches, selectedMatchId]);

  useEffect(() => {
    if (!matches.length) return;
    const latestMatch = matches[0]!;
    if (autogenMatchId === latestMatch.id) return;
    setAutogenMatchId(latestMatch.id);
    setSelectedMatchId(latestMatch.id);
  }, [matches, autogenMatchId]);

  /* Auto-generate the plan at most once per match id.
     `generatePlanMutation` is a new object on every state transition, so having
     it in the dependency array re-ran this effect the instant a request failed,
     which re-fired an expensive LLM + Places procedure in an unbounded loop.
     The ref is the guard; the mutation is deliberately not a dependency. */
  const autogenRequestedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!autogenMatchId) return;
    if (plan) return;
    if (autogenRequestedRef.current === autogenMatchId) return;
    autogenRequestedRef.current = autogenMatchId;
    generatePlanMutation.mutate({ matchId: autogenMatchId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autogenMatchId, plan]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Supabase Realtime
  useEffect(() => {
    if (!selectedMatchId) return;
    const channel = supabaseBrowser
      .channel(`chat:${selectedMatchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `match_id=eq.${selectedMatchId}`,
        },
        () => {
          queryClient.invalidateQueries(
            trpc.chat.listMessages.queryFilter({
              matchId: selectedMatchId!,
              limit: 50,
            }),
          );
        },
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [selectedMatchId, queryClient, trpc]);

  // ═══════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofFile(file);
    setUploadedProofUrl(null);
    const reader = new FileReader();
    reader.onload = () => setProofPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCheckin = async () => {
    if (!plan?.missionInstanceId) return;
    let selfieUrl = uploadedProofUrl;
    if (proofFile && !uploadedProofUrl) {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] ?? "");
        };
        reader.readAsDataURL(proofFile);
      });
      const uploadResult = await uploadProofMutation.mutateAsync({
        base64,
        fileName: proofFile.name,
        mimeType: proofFile.type as
          | "image/jpeg"
          | "image/png"
          | "image/webp"
          | "image/heic",
      });
      selfieUrl = uploadResult.url;
      setUploadedProofUrl(uploadResult.url);
    }
    checkinMutation.mutate({
      instanceId: plan.missionInstanceId as string,
      proof: {
        ts: new Date().toISOString(),
        ...(selfieUrl ? { selfieUrl } : {}),
      },
    });
  };

  const retryGeneratePlan = () => {
    const matchId = selectedMatchId ?? autogenMatchId;
    if (!matchId) return;
    autogenRequestedRef.current = matchId;
    generatePlanMutation.mutate({ matchId });
  };

  const handleSendMessage = () => {
    if (!selectedMatchId || !chatInput.trim()) return;
    sendMessageMutation.mutate({
      matchId: selectedMatchId,
      content: chatInput.trim(),
    });
  };

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Match Center
        </h1>
        <p className="text-sm text-muted-foreground">
          Discover vibes, connect with matches, complete real-life missions, and
          level up your academy.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="discover" className="gap-1.5">
            <Heart className="h-4 w-4" />
            <span className="hidden sm:inline">Discover</span>
          </TabsTrigger>
          <TabsTrigger value="connected" className="gap-1.5">
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Connected</span>
            {matches.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-5 px-1 text-xs"
              >
                {matches.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="mission" className="gap-1.5">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Mission</span>
          </TabsTrigger>
          <TabsTrigger value="academy" className="gap-1.5">
            <Crown className="h-4 w-4" />
            <span className="hidden sm:inline">Academy</span>
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════ DISCOVER TAB ═══════════════════ */}
        <TabsContent value="discover" className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-foreground">
                Vibe Candidates
              </CardTitle>
              <CardDescription>
                Ranked by vibe compatibility. Connect mutually to unlock chat &
                missions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {vibeMatchQuery.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-40 rounded-xl bg-muted" />
                  ))}
                </div>
              ) : vibeMatchQuery.isError ? (
                /* Without this branch a failed query fell through to the empty
                   state and told the user to complete a profile they already
                   have. */
                <CardError
                  title="Couldn't load candidates"
                  message={
                    vibeMatchQuery.error?.message ??
                    "We couldn't reach the matching service."
                  }
                  onRetry={() => vibeMatchQuery.refetch()}
                />
              ) : candidates.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <Sparkles className="h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    No candidates yet. Complete your vibe profile first.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {candidates.slice(0, 8).map((candidate) => {
                    const incoming = pendingIncoming.find(
                      (conn: any) => conn.requesterId === candidate.userId,
                    );
                    const outgoing = pendingIncoming.find(
                      (conn: any) => conn.addresseeId === candidate.userId,
                    );
                    const alreadyMatched = matches.some(
                      (m) =>
                        m.userAId === candidate.userId ||
                        m.userBId === candidate.userId,
                    );

                    return (
                      <div
                        key={candidate.userId}
                        className="group overflow-hidden rounded-xl border border-border bg-card p-4 transition hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-lg font-semibold text-foreground">
                                {candidate.vibeName ?? "Unknown Vibe"}
                              </p>
                              {/* Sample profiles never reply. Saying so beats
                                  letting someone wait for a message that
                                  cannot come. */}
                              {candidate.isDemo && (
                                <DemoProfileBadge className="shrink-0" />
                              )}
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {candidate.vibeSummary ?? "No summary"}
                            </p>
                          </div>
                          {candidate.energy && (
                            <Badge
                              variant="secondary"
                              className={`shrink-0 ${energyColor(candidate.energy)}`}
                            >
                              <Zap className="mr-1 h-3 w-3" />
                              {candidate.energy}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1">
                          {(candidate.interestTags ?? [])
                            .slice(0, 4)
                            .map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="text-xs"
                              >
                                {tag}
                              </Badge>
                            ))}
                          {(candidate.interestTags?.length ?? 0) > 4 && (
                            <Badge variant="outline" className="text-xs">
                              +{(candidate.interestTags?.length ?? 0) - 4}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            size="sm"
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                            disabled={
                              connectMutation.isPending ||
                              Boolean(outgoing) ||
                              alreadyMatched
                            }
                            onClick={() =>
                              connectMutation.mutate({
                                userId: candidate.userId,
                              })
                            }
                          >
                            {connectMutation.isPending ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Heart className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {alreadyMatched
                              ? "Matched ✓"
                              : outgoing
                                ? "Sent"
                                : incoming
                                  ? "Accept & Match"
                                  : "Connect"}
                          </Button>
                          {incoming && (
                            <span className="text-xs text-muted-foreground">
                              They connected with you!
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════ CONNECTED TAB ═══════════════════ */}
        <TabsContent value="connected" className="space-y-4">
          {/* meQuery gates the list too: getOtherUser needs the real user id,
              and rendering before it lands would briefly show the user their
              own profile. */}
          {matchesQuery.isLoading || meQuery.isLoading ? (
            <Skeleton className="h-64 rounded-xl bg-muted" />
          ) : matchesQuery.isError ? (
            <CardError
              title="Couldn't load your matches"
              message={
                matchesQuery.error?.message ??
                "We couldn't reach your match list."
              }
              onRetry={() => matchesQuery.refetch()}
            />
          ) : matches.length === 0 ? (
            <Card className="border-border">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No matches yet. Head to Discover and connect with someone.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab("discover")}
                >
                  Go to Discover
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Match sidebar */}
              <div className="space-y-2 lg:col-span-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Your Matches ({matches.length})
                </p>
                {matches.map((match) => {
                  const other = getOtherUser(match, myId);
                  const isActive = selectedMatchId === match.id;
                  return (
                    <button
                      key={match.id}
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                        isActive
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-card hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedMatchId(match.id)}
                    >
                      <AvatarImg profile={other} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">
                          {other.displayName}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {other.vibeName && (
                            <span className="truncate text-xs text-muted-foreground">
                              {other.vibeName}
                            </span>
                          )}
                          {other.isVerified && (
                            <ShieldCheck className="h-3 w-3 shrink-0 text-primary" />
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1">
                          {other.gender && (
                            <Badge
                              variant="outline"
                              className="h-4 px-1 text-[10px]"
                            >
                              {genderLabel(other.gender)}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {similarityLabel(Number(match.similarity ?? 0))}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Chat + Profile */}
              <div className="space-y-4 lg:col-span-2">
                {!selectedMatch ? (
                  <Card className="border-border">
                    <CardContent className="py-12 text-center">
                      <p className="text-sm text-muted-foreground">
                        Select a match to start chatting.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Partner profile card */}
                    {(() => {
                      const other = getOtherUser(selectedMatch, myId);
                      return (
                        <Card className="overflow-hidden border-border">
                          <div className="flex flex-col gap-4 p-4 sm:flex-row">
                            <div className="flex gap-2 overflow-x-auto">
                              {other.photoUrls.length > 0 ? (
                                other.photoUrls
                                  .slice(0, 3)
                                  .map((url, i) => (
                                    <img
                                      key={i}
                                      src={url}
                                      alt={`${other.displayName} photo ${i + 1}`}
                                      className="h-28 w-28 shrink-0 rounded-xl object-cover ring-1 ring-border"
                                    />
                                  ))
                              ) : other.imageUrl ? (
                                <img
                                  src={other.imageUrl}
                                  alt={other.displayName}
                                  className="h-28 w-28 shrink-0 rounded-xl object-cover ring-1 ring-border"
                                />
                              ) : (
                                <div className="flex h-28 w-28 items-center justify-center rounded-xl bg-muted">
                                  <Users className="h-8 w-8 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <h3 className="text-lg font-semibold text-foreground">
                                  {other.displayName}
                                </h3>
                                {other.isVerified && (
                                  <ShieldCheck className="h-4 w-4 text-primary" />
                                )}
                                {/* Labelled here as well as on the card: the
                                    chat is where someone would otherwise wait
                                    for a reply from what they took to be a
                                    person. */}
                                {other.isDemo && <DemoProfileBadge />}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {other.gender && (
                                  <Badge variant="secondary">
                                    {genderLabel(other.gender)}
                                  </Badge>
                                )}
                                {other.energy && (
                                  <Badge
                                    variant="secondary"
                                    className={energyColor(other.energy)}
                                  >
                                    <Zap className="mr-1 h-3 w-3" />
                                    {other.energy}
                                  </Badge>
                                )}
                                {other.vibeName && (
                                  <Badge variant="outline">
                                    {other.vibeName}
                                  </Badge>
                                )}
                              </div>
                              {other.bio && (
                                <p className="text-sm text-muted-foreground">
                                  {other.bio}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-1">
                                {other.interestTags.slice(0, 6).map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Similarity:{" "}
                                <span className="font-semibold text-primary">
                                  {Number(
                                    selectedMatch.similarity ?? 0,
                                  ).toFixed(2)}
                                </span>
                              </p>
                            </div>
                          </div>
                        </Card>
                      );
                    })()}

                    {/* Chat */}
                    <Card className="border-border">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base text-foreground">
                          <MessageCircle className="h-4 w-4" />
                          Chat
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-3 h-72 space-y-2 overflow-y-auto rounded-xl border border-border bg-muted/20 p-3">
                          {messagesQuery.isLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                          ) : messages.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-8 text-center">
                              <MessageCircle className="h-8 w-8 text-muted-foreground/30" />
                              <p className="text-xs text-muted-foreground">
                                No messages yet. Say hi!
                              </p>
                            </div>
                          ) : (
                            messages.map((msg: any) => {
                              const isMine =
                                msg.senderId !== selectedMatch.userAId
                                  ? msg.senderId === selectedMatch.userBId
                                  : false;
                              return (
                                <div
                                  key={msg.id}
                                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                                >
                                  <div
                                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                                      isMine
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-foreground"
                                    }`}
                                  >
                                    <p>{msg.content}</p>
                                    <p className="mt-0.5 text-[10px] opacity-60">
                                      {new Date(
                                        msg.createdAt,
                                      ).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </p>
                                  </div>
                                </div>
                              );
                            })
                          )}
                          <div ref={chatEndRef} />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Type a message..."
                            // text-base below md: iOS Safari zooms in on any
                            // input under 16px, and a chat field is the one
                            // people focus most.
                            className="min-w-0 flex-1 rounded-full border border-input bg-background px-4 py-2 text-base outline-none focus:ring-2 focus:ring-ring md:text-sm"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                              }
                            }}
                          />
                          <Button
                            size="icon"
                            className="h-9 w-9 shrink-0 rounded-full"
                            aria-label="Send message"
                            disabled={
                              !chatInput.trim() || sendMessageMutation.isPending
                            }
                            onClick={handleSendMessage}
                          >
                            {sendMessageMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════ MISSION TAB ═══════════════════ */}
        <TabsContent value="mission" className="space-y-4">
          {matches.length > 0 && myId && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {matches.map((match) => {
                const other = getOtherUser(match, myId);
                return (
                  <button
                    key={match.id}
                    type="button"
                    className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                      selectedMatchId === match.id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    }`}
                    onClick={() => setSelectedMatchId(match.id)}
                  >
                    <AvatarImg profile={other} size="sm" />
                    <span className="truncate">{other.displayName}</span>
                  </button>
                );
              })}
            </div>
          )}

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-foreground">
                <Target className="h-4 w-4" />
                Mission Briefing
              </CardTitle>
              <CardDescription>
                Auto-generated after mutual match. Both accept to reveal
                details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isMissionLoading && !plan ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 rounded-xl bg-muted" />
                  <Skeleton className="h-32 rounded-xl bg-muted" />
                </div>
              ) : !selectedMatchId ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <Target className="h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    Connect with someone to unlock missions.
                  </p>
                </div>
              ) : !plan && generatePlanMutation.isError ? (
                <CardError
                  title="Mission planning failed 💔"
                  message={
                    generatePlanMutation.error?.message ??
                    "We couldn't build your mission. Give it another try."
                  }
                  onRetry={retryGeneratePlan}
                />
              ) : !plan ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Preparing your mission...
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card p-4">
                      <p className="text-xs text-muted-foreground">
                        Vibe overlap
                      </p>
                      <p className="font-display text-2xl font-semibold text-primary">
                        {Math.round(Number(plan.similarityScore ?? 0) * 100)}%
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <p className="text-xs text-muted-foreground">
                        Success Probability
                      </p>
                      <p className="text-2xl font-bold text-primary">
                        {Math.round(Number(plan.successProbability ?? 0))}%
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
                      <Target className="h-4 w-4" /> Mission
                    </p>
                    <p className="font-semibold text-foreground">
                      {plan.mission?.title}
                    </p>
                    <p
                      className={`mt-2 text-sm leading-relaxed ${
                        plan?.acceptance?.revealUnlocked
                          ? "text-foreground"
                          : "text-muted-foreground blur-sm select-none"
                      }`}
                    >
                      {plan.mission?.task}
                    </p>
                    <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {plan.mission?.locationName ?? "TBD"}
                      {plan.mission?.locationDistrict
                        ? ` • ${plan.mission.locationDistrict}`
                        : ""}
                    </p>
                  </div>

                  {topPlaceCandidates.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Suggested Places
                      </p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {topPlaceCandidates.map((place) => (
                          <button
                            key={place.placeId}
                            type="button"
                            className={`overflow-hidden rounded-xl border text-left transition ${
                              selectedPlaceId === place.placeId
                                ? "border-primary bg-primary/10 shadow-sm"
                                : "border-border bg-card hover:bg-muted"
                            }`}
                            onClick={() => {
                              if (!selectedMatchId) return;
                              setSelectedPlaceByMatch((c) => ({
                                ...c,
                                [selectedMatchId]: place.placeId,
                              }));
                            }}
                          >
                            {place.photoUrl ? (
                              <img
                                src={place.photoUrl}
                                alt={place.name}
                                className="h-24 w-full object-cover"
                              />
                            ) : (
                              <div className="h-24 w-full bg-muted" />
                            )}
                            <div className="space-y-1 p-2">
                              <p className="text-sm font-medium text-foreground">
                                {place.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {place.district} • {place.placeType}
                              </p>
                              <Badge variant="secondary" className="text-xs">
                                {place.isIndoor ? "Indoor" : "Outdoor"}
                              </Badge>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                    <p className="text-muted-foreground">
                      Accepted: {plan.acceptance?.acceptedCount ?? 0}/
                      {plan.acceptance?.totalParticipants ?? 2}
                    </p>
                    <p
                      className={`mt-2 leading-relaxed ${
                        plan?.acceptance?.revealUnlocked
                          ? "text-foreground"
                          : "text-muted-foreground blur-sm select-none"
                      }`}
                    >
                      {plan.narrative}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {canAcceptMission && (
                      <Button
                        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() =>
                          acceptMissionMutation.mutate({
                            instanceId: plan.missionInstanceId as string,
                          })
                        }
                      >
                        {acceptMissionMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        Accept Mission
                      </Button>
                    )}

                    {plan?.missionInstanceId &&
                      plan?.acceptance?.revealUnlocked && (
                        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                          <p className="text-sm font-medium text-foreground">
                            Mission Check-in
                          </p>
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground">
                              Take a photo as proof (optional)
                            </label>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={handlePhotoSelect}
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                              >
                                <Camera className="mr-1.5 h-4 w-4" />
                                {proofPreview ? "Change Photo" : "Take Photo"}
                              </Button>
                              {uploadProofMutation.isPending && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Uploading...
                                </span>
                              )}
                            </div>
                            {proofPreview && (
                              <div className="relative inline-block">
                                <img
                                  src={proofPreview}
                                  alt="Proof preview"
                                  className="h-32 w-auto rounded-xl object-cover ring-1 ring-border"
                                />
                                <button
                                  type="button"
                                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs"
                                  onClick={() => {
                                    setProofFile(null);
                                    setProofPreview(null);
                                    setUploadedProofUrl(null);
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            )}
                          </div>
                          <Button
                            className="w-full"
                            disabled={
                              checkinMutation.isPending ||
                              uploadProofMutation.isPending
                            }
                            onClick={handleCheckin}
                          >
                            {checkinMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Trophy className="mr-2 h-4 w-4" />
                            )}
                            Complete Real-life Mission
                          </Button>
                        </div>
                      )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════ ACADEMY TAB ═══════════════════ */}
        <TabsContent value="academy" className="space-y-4">
          {/* Level */}
          <Card className="overflow-hidden border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-foreground">
                <Crown className="h-4 w-4" />
                Your Academy Level
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {levelQuery.isLoading ? (
                <Skeleton className="h-24 rounded-xl bg-muted" />
              ) : (
                <>
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-3xl">
                      {levelQuery.data?.currentLevel?.badgeIcon ?? "🏅"}
                    </div>
                    <div className="flex-1">
                      <p className="text-lg font-bold text-foreground">
                        {levelQuery.data?.currentLevel?.name ?? "Unranked"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {levelQuery.data?.totalPoints ?? 0} total points
                      </p>
                    </div>
                  </div>
                  {levelQuery.data?.nextLevel && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{levelQuery.data.currentLevel?.name}</span>
                        <span>
                          {levelQuery.data.pointsToNext} pts to{" "}
                          {levelQuery.data.nextLevel.name}{" "}
                          {levelQuery.data.nextLevel.badgeIcon}
                        </span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{
                            width: `${levelQuery.data.progressPercent ?? 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {Array.isArray(levelQuery.data?.currentLevel?.perks) &&
                    (levelQuery.data!.currentLevel!.perks as string[]).length >
                      0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          Your Perks
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(
                            levelQuery.data!.currentLevel!.perks as string[]
                          ).map((perk) => (
                            <Badge
                              key={perk}
                              variant="secondary"
                              className="text-xs"
                            >
                              <Star className="mr-1 h-3 w-3" />
                              {perk}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Points History */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-foreground">
                <Trophy className="h-4 w-4" />
                Points History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pointsHistoryQuery.isLoading ? (
                <Skeleton className="h-32 rounded-xl bg-muted" />
              ) : !(pointsHistoryQuery.data as any)?.length ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Trophy className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    Complete missions to earn your first points.
                  </p>
                </div>
              ) : (
                (pointsHistoryQuery.data as any[]).map((entry: any) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          entry.delta > 0
                            ? "bg-green-500/10 text-green-600"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {entry.reason === "mission-completed" ? (
                          <Trophy className="h-4 w-4" />
                        ) : entry.reason === "reward-redeemed" ? (
                          <Gift className="h-4 w-4" />
                        ) : (
                          <Star className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {entry.reason === "mission-completed"
                            ? "Mission Completed"
                            : entry.reason === "reward-redeemed"
                              ? "Reward Redeemed"
                              : entry.reason}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={
                        entry.delta > 0
                          ? "bg-green-500/10 text-green-700"
                          : "bg-destructive/10 text-destructive"
                      }
                    >
                      {entry.delta > 0 ? "+" : ""}
                      {entry.delta}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Reward Store */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-foreground">
                <Gift className="h-4 w-4" />
                Reward Store
              </CardTitle>
              <CardDescription>
                Spend academy points on badges, power-ups, and features.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rewardsQuery.isLoading ? (
                <Skeleton className="h-40 rounded-xl bg-muted" />
              ) : !(rewardsQuery.data as any)?.length ? (
                <p className="text-sm text-muted-foreground">
                  No rewards available yet.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(rewardsQuery.data as any[]).map((reward: any) => {
                    const canAfford =
                      (levelQuery.data?.totalPoints ?? 0) >= reward.cost;
                    return (
                      <div
                        key={reward.id}
                        className="rounded-xl border border-border bg-card p-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-xl">
                            {reward.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground">
                              {reward.title}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {reward.description}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <Badge variant="outline">
                            <Star className="mr-1 h-3 w-3" />
                            {reward.cost} pts
                          </Badge>
                          <Button
                            size="sm"
                            variant={canAfford ? "default" : "outline"}
                            disabled={
                              !canAfford || redeemRewardMutation.isPending
                            }
                            onClick={() =>
                              redeemRewardMutation.mutate({
                                rewardId: reward.id,
                              })
                            }
                          >
                            {redeemRewardMutation.isPending ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : null}
                            {canAfford ? "Redeem" : "Not enough"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* My Rewards */}
          {(myRewardsQuery.data as any)?.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-foreground">
                  <Star className="h-4 w-4" />
                  My Rewards
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {(myRewardsQuery.data as any[]).map((reward: any) => (
                    <div
                      key={reward.id}
                      className="flex shrink-0 items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5"
                    >
                      <span className="text-lg">{reward.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {reward.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(reward.redeemedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
