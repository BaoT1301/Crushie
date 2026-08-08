"use client";

import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CardError } from "@/components/error-display";
import Link from "next/link";
import {
  Crown,
  Heart,
  MapPin,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

// ── Stat Card ───────────────────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${accent ?? "bg-primary/10 text-primary"}`}
        >
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {sub && (
            <p className="mt-0.5 text-[10px] text-muted-foreground/70">{sub}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const trpc = useTRPC();

  const matchesQuery = useQuery(
    trpc.social.listMatches.queryOptions({ limit: 50 }),
  );
  const pointsQuery = useQuery(trpc.social.getMyPoints.queryOptions());
  const levelQuery = useQuery(trpc.academy.getMyLevel.queryOptions());
  const historyQuery = useQuery(
    trpc.social.getPointsHistory.queryOptions({ limit: 5 }),
  );

  const matches = (matchesQuery.data ?? []) as any[];
  const totalPoints = (pointsQuery.data as any)?.total ?? 0;
  const level = levelQuery.data;
  const history = (historyQuery.data ?? []) as any[];

  const loading =
    matchesQuery.isLoading ||
    pointsQuery.isLoading ||
    levelQuery.isLoading ||
    historyQuery.isLoading;

  /* Without this, a failed query renders as "0 matches / Unranked" — the stat
     tiles have no way to say "we don't know" and quietly report zero instead. */
  const statsError =
    matchesQuery.isError ||
    pointsQuery.isError ||
    levelQuery.isError ||
    historyQuery.isError;

  const refetchStats = () => {
    void matchesQuery.refetch();
    void pointsQuery.refetch();
    void levelQuery.refetch();
    void historyQuery.refetch();
  };

  const totalMatches = matches.length;
  const mutualMatches = matches.filter((m: any) => m.isMutual).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Your vibe journey at a glance.
        </p>
      </div>

      {/* Hero Stats */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl bg-muted" />
          ))}
        </div>
      ) : statsError ? (
        <CardError
          title="Couldn't load your stats"
          message={
            matchesQuery.error?.message ??
            pointsQuery.error?.message ??
            levelQuery.error?.message ??
            historyQuery.error?.message ??
            "Your numbers are safe — we just couldn't fetch them."
          }
          onRetry={refetchStats}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Heart className="h-5 w-5" />}
            label="Total Matches"
            value={totalMatches}
            sub={`${mutualMatches} mutual`}
            accent="bg-pink-500/10 text-pink-600"
          />
          <StatCard
            icon={<Target className="h-5 w-5" />}
            label="Academy Points"
            value={totalPoints}
            sub={`${level?.currentLevel?.name ?? "Unranked"} ${level?.currentLevel?.badgeIcon ?? ""}`}
            accent="bg-primary/10 text-primary"
          />
          <StatCard
            icon={<Crown className="h-5 w-5" />}
            label="Level Progress"
            value={`${level?.progressPercent ?? 0}%`}
            sub={
              level?.nextLevel
                ? `${level.pointsToNext} pts to ${level.nextLevel.name}`
                : "Max level"
            }
            accent="bg-primary/10 text-primary"
          />
          <StatCard
            icon={<Zap className="h-5 w-5" />}
            label="Recent Earnings"
            value={
              history
                .filter((h: any) => h.delta > 0)
                .reduce((sum: number, h: any) => sum + h.delta, 0) ?? 0
            }
            sub="from recent activity"
            accent="bg-primary/10 text-primary"
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Level Progress Card */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-foreground">
              <Crown className="h-4 w-4" />
              Academy Level
            </CardTitle>
            <CardDescription>
              Earn points by completing real-life missions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {levelQuery.isLoading ? (
              <Skeleton className="h-20 rounded-lg bg-muted" />
            ) : levelQuery.isError ? (
              <CardError
                title="Couldn't load your level"
                message={
                  levelQuery.error?.message ?? "The academy service is down."
                }
                onRetry={() => void levelQuery.refetch()}
              />
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-3xl">
                    {level?.currentLevel?.badgeIcon ?? "🏅"}
                  </div>
                  <div className="flex-1">
                    <p className="text-lg font-bold text-foreground">
                      {level?.currentLevel?.name ?? "Unranked"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {totalPoints} total points
                    </p>
                  </div>
                </div>
                {level?.nextLevel && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{level.currentLevel?.name}</span>
                      <span>
                        {level.pointsToNext} pts to {level.nextLevel.name}{" "}
                        {level.nextLevel.badgeIcon}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500"
                        style={{
                          width: `${level.progressPercent ?? 0}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                {Array.isArray(level?.currentLevel?.perks) &&
                  (level!.currentLevel!.perks as string[]).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(level!.currentLevel!.perks as string[]).map((perk) => (
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
                  )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-foreground">
              <Trophy className="h-4 w-4" />
              Recent Activity
            </CardTitle>
            <CardDescription>
              Your latest point earnings and spending.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {historyQuery.isLoading ? (
              <Skeleton className="h-40 rounded-lg bg-muted" />
            ) : historyQuery.isError ? (
              /* Distinct from the empty state below: "nothing happened yet" and
                 "we could not check" are different answers. */
              <CardError
                title="Couldn't load recent activity"
                message={
                  historyQuery.error?.message ??
                  "We couldn't reach your activity feed."
                }
                onRetry={() => void historyQuery.refetch()}
              />
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Trophy className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  Complete your first mission to see activity here.
                </p>
              </div>
            ) : (
              history.map((entry: any) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        entry.delta > 0
                          ? "bg-green-500/10 text-green-600"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {entry.delta > 0 ? (
                        <Trophy className="h-4 w-4" />
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
                        ? "bg-green-500/10 text-green-600"
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
      </div>

      {/* Quick Actions */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-foreground">
            <Sparkles className="h-4 w-4" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link href="/discover">
              <Button variant="outline" className="gap-2">
                <Heart className="h-4 w-4" />
                Find Matches
              </Button>
            </Link>
            <Link href="/discover?tab=connected">
              <Button variant="outline" className="gap-2">
                <Users className="h-4 w-4" />
                Chat with Matches
              </Button>
            </Link>
            <Link href="/discover?tab=mission">
              <Button variant="outline" className="gap-2">
                <MapPin className="h-4 w-4" />
                Current Mission
              </Button>
            </Link>
            <Link href="/discover?tab=academy">
              <Button variant="outline" className="gap-2">
                <Crown className="h-4 w-4" />
                Academy & Rewards
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
