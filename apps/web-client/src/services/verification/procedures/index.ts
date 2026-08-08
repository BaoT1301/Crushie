import { createTRPCRouter } from "@/server/init";
import { getMyStatus } from "./get-my-status";
import { isVerified } from "./is-verified";
import { request } from "./request";
import { requestVerification } from "./request-verification";
import { getBadges } from "./get-badges";
import { listAnalyzerSessions, getAnalyzerSession } from "./analyzer-sessions";

export const verificationRouter = createTRPCRouter({
  getMyStatus,
  isVerified,
  request,
  requestVerification,
  getBadges,
  listAnalyzerSessions,
  getAnalyzerSession,
});
