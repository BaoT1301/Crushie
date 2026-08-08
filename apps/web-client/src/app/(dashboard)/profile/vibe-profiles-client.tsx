"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { VerificationBadge } from "@/components/verification-badge";
import { CardError } from "@/components/error-display";
import Link from "next/link";
import { Camera, Images, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";

type ProfileFormState = {
  vibeName: string;
  vibeSummary: string;
  bio: string;
  gender: "male" | "female" | "non-binary" | "prefer-not-to-say" | "";
  interestedIn: "male" | "female" | "non-binary" | "everyone" | "";
  interestTags: string;
};

const INITIAL_FORM: ProfileFormState = {
  vibeName: "",
  vibeSummary: "",
  bio: "",
  gender: "",
  interestedIn: "",
  interestTags: "",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read image"));
        return;
      }
      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("Invalid image data"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(",")[1] ?? "";
}

export default function VibeProfilesClient() {
  const trpc = useTRPC();
  const profileQuery = useQuery(trpc.vibeProfiles.getMe.queryOptions());
  const userQuery = useQuery(trpc.users.getMe.queryOptions());

  const updateMutation = useMutation(
    trpc.vibeProfiles.updateMyProfile.mutationOptions(),
  );
  const regenerateMutation = useMutation(
    trpc.llm.generateVibe.mutationOptions(),
  );
  const verificationMutation = useMutation(
    trpc.verification.requestVerification.mutationOptions(),
  );

  const [form, setForm] = useState<ProfileFormState>(INITIAL_FORM);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [capturedSelfie, setCapturedSelfie] = useState<string | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [regenerateMessage, setRegenerateMessage] = useState<string | null>(
    null,
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) return;

    setForm({
      vibeName: profile.vibeName ?? "",
      vibeSummary: profile.vibeSummary ?? "",
      bio: profile.bio ?? "",
      gender: (profile.gender as ProfileFormState["gender"]) ?? "",
      interestedIn:
        (profile.interestedIn as ProfileFormState["interestedIn"]) ?? "",
      interestTags: (profile.interestTags ?? []).join(", "),
    });
  }, [profileQuery.data]);

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    };
  }, []);

  const photoUrls = useMemo(
    () => profileQuery.data?.photoUrls ?? [],
    [profileQuery.data?.photoUrls],
  );
  const uploadedSelfiePreview = useMemo(() => {
    if (!selfieFile) return null;
    return URL.createObjectURL(selfieFile);
  }, [selfieFile]);

  useEffect(() => {
    return () => {
      if (uploadedSelfiePreview) {
        URL.revokeObjectURL(uploadedSelfiePreview);
      }
    };
  }, [uploadedSelfiePreview]);

  const setField = <K extends keyof ProfileFormState>(
    key: K,
    value: ProfileFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSavedMessage(null);
  };

  const resetVerificationState = (options?: { preserveError?: boolean }) => {
    setSelfieFile(null);
    setCapturedSelfie(null);
    setCameraError(null);
    if (!options?.preserveError) {
      setVerifyError(null);
    }
    stopCamera();
    verificationMutation.reset();

    if (uploadInputRef.current) {
      uploadInputRef.current.value = "";
    }
  };

  const onSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsedTags = form.interestTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 20);

    await updateMutation.mutateAsync({
      vibeName: form.vibeName || undefined,
      vibeSummary: form.vibeSummary || undefined,
      bio: form.bio || undefined,
      gender: form.gender || undefined,
      interestedIn: form.interestedIn || undefined,
      interestTags: parsedTags,
    });

    setSavedMessage("Your vibe profile is updated ✨");
    await profileQuery.refetch();
  };

  const enableCamera = async () => {
    setCameraError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
        },
        audio: false,
      });

      mediaStreamRef.current = stream;
      setCameraEnabled(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError(
        "Unable to access webcam. Please allow camera permission or upload a photo.",
      );
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setCameraEnabled(false);
  };

  const captureFromCamera = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 720;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedSelfie(dataUrl);
    setSelfieFile(null);
    stopCamera();
  };

  const onSelectUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    stopCamera();
    const file = event.target.files?.[0] ?? null;
    setSelfieFile(file);
    setCapturedSelfie(null);
    setVerifyError(null);
    verificationMutation.reset();
  };

  const onRegenerateFromCurrentPhotos = async () => {
    if (photoUrls.length === 0) return;

    setRegenerateMessage(null);

    const hintTags = (profileQuery.data?.interestTags ?? []).slice(0, 10);

    await regenerateMutation.mutateAsync({
      imageUrls: photoUrls,
      hintTags: hintTags.length > 0 ? hintTags : undefined,
      extraContext: profileQuery.data?.bio || undefined,
      photoUrls,
    });

    await profileQuery.refetch();
    setRegenerateMessage(
      "Vibe profile regenerated with your current photos ✨",
    );
  };

  const onVerify = async () => {
    let selfieBase64 = "";
    let selfieMimeType: "image/jpeg" | "image/png" | "image/webp" =
      "image/jpeg";

    if (capturedSelfie) {
      selfieBase64 = dataUrlToBase64(capturedSelfie);
      selfieMimeType = "image/jpeg";
    } else if (selfieFile) {
      selfieBase64 = await fileToBase64(selfieFile);
      selfieMimeType = (selfieFile.type || "image/jpeg") as
        | "image/jpeg"
        | "image/png"
        | "image/webp";
    }

    if (!selfieBase64) return;

    if (!capturedSelfie && !selfieFile) {
      setVerifyError("Please capture a selfie or upload one before verification.");
      return;
    }

    if (
      selfieMimeType !== "image/jpeg" &&
      selfieMimeType !== "image/png" &&
      selfieMimeType !== "image/webp"
    ) {
      setVerifyError("Unsupported image format. Please use JPEG, PNG, or WEBP.");
      return;
    }

    try {
      await verificationMutation.mutateAsync({
        selfieBase64,
        selfieMimeType,
      });

      setSelfieFile(null);
      setCapturedSelfie(null);
      setVerifyError(null);
      stopCamera();

      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }

      await userQuery.refetch();
    } catch (error) {
      setVerifyError(
        error instanceof Error
          ? error.message
          : "Verification failed. The form has been reset. Please try again.",
      );
      resetVerificationState({ preserveError: true });
    }
  };

  if (profileQuery.isLoading || userQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-56" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  /* A failed request is not an empty profile. Falling through to the block
     below told returning users their profile did not exist and sent them back
     through onboarding. */
  if (profileQuery.isError || userQuery.isError) {
    return (
      <CardError
        title="Couldn't load your vibe profile"
        message={
          profileQuery.error?.message ??
          userQuery.error?.message ??
          "Your profile is still there — we just couldn't reach it. Try again."
        }
        onRetry={() => {
          if (profileQuery.isError) void profileQuery.refetch();
          if (userQuery.isError) void userQuery.refetch();
        }}
      />
    );
  }

  if (!profileQuery.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vibe profile not found</CardTitle>
        </CardHeader>
        <CardContent>
          Please complete onboarding first, then come back to manage your vibe
          profile.
        </CardContent>
      </Card>
    );
  }

  const verifyResult = verificationMutation.data;
  const verificationReady = Boolean(selfieFile || capturedSelfie);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Vibe Profiles</h1>
          <p className="text-muted-foreground">
            View your vibe gallery, edit your profile, and verify your identity
            in one place.
          </p>
        </div>
        <VerificationBadge
          isVerified={Boolean(userQuery.data?.isVerified)}
          size="md"
        />
      </div>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Images className="h-4 w-4 text-primary" />
              Vibe Photos ({photoUrls.length})
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-primary/30 hover:bg-primary/10"
                disabled={
                  photoUrls.length === 0 || regenerateMutation.isPending
                }
                onClick={onRegenerateFromCurrentPhotos}
              >
                <RotateCcw className="h-4 w-4" />
                {regenerateMutation.isPending
                  ? "Regenerating..."
                  : "Re-generate from current photos"}
              </Button>
              <Button
                asChild
                type="button"
                variant="outline"
                className="border-primary/30 hover:bg-primary/10"
              >
                <Link href="/on-board">Rebuild with new photos</Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {regenerateMessage ? (
            <p className="mb-3 text-sm text-primary">{regenerateMessage}</p>
          ) : null}

          {regenerateMutation.error ? (
            <p className="mb-3 text-sm text-destructive">
              {regenerateMutation.error.message}
            </p>
          ) : null}

          {photoUrls.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No photos in your vibe profile yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="col-span-2 row-span-2 overflow-hidden rounded-xl border border-border/70 bg-muted/20 shadow-sm">
                <img
                  src={photoUrls[0]}
                  alt="Primary vibe photo"
                  className="h-full min-h-55 w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
                />
              </div>

              {photoUrls.slice(1).map((url, index) => (
                <div
                  key={`${url}-${index + 1}`}
                  className="overflow-hidden rounded-xl border border-border/70 bg-muted/20 shadow-sm"
                >
                  <img
                    src={url}
                    alt={`Vibe photo ${index + 2}`}
                    className="h-28 w-full object-cover transition-transform duration-300 hover:scale-[1.03] md:h-32"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Edit Vibe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSaveProfile}>
            <div className="space-y-2">
              <label className="text-sm font-medium">Vibe Label</label>
              <Input
                value={form.vibeName}
                onChange={(event) => setField("vibeName", event.target.value)}
                maxLength={100}
                placeholder="Your vibe label"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Vibe Summary</label>
              <textarea
                value={form.vibeSummary}
                onChange={(event) =>
                  setField("vibeSummary", event.target.value)
                }
                maxLength={500}
                rows={3}
                className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
                placeholder="A short summary of your vibe"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Bio</label>
              <textarea
                value={form.bio}
                onChange={(event) => setField("bio", event.target.value)}
                maxLength={500}
                rows={4}
                className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
                placeholder="Tell people who you are"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Gender</label>
                <select
                  value={form.gender}
                  onChange={(event) =>
                    setField(
                      "gender",
                      event.target.value as ProfileFormState["gender"],
                    )
                  }
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-xl border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
                >
                  <option value="">Choose</option>
                  <option value="male">♂ Male</option>
                  <option value="female">♀ Female</option>
                  <option value="non-binary">⚧ Non-binary</option>
                  <option value="prefer-not-to-say">◌ Prefer not to say</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Interested In</label>
                <select
                  value={form.interestedIn}
                  onChange={(event) =>
                    setField(
                      "interestedIn",
                      event.target.value as ProfileFormState["interestedIn"],
                    )
                  }
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-xl border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
                >
                  <option value="">Choose</option>
                  <option value="male">♂ Male</option>
                  <option value="female">♀ Female</option>
                  <option value="non-binary">⚧ Non-binary</option>
                  <option value="everyone">∞ Everyone</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Interests</label>
              <Input
                value={form.interestTags}
                onChange={(event) =>
                  setField("interestTags", event.target.value)
                }
                placeholder="music, coffee, gym, coding"
              />
              <p className="text-xs text-muted-foreground">
                Separate tags with commas.
              </p>
            </div>

            {savedMessage ? (
              <p className="text-sm text-primary">{savedMessage}</p>
            ) : null}

            {updateMutation.error ? (
              <p className="text-sm text-destructive">
                {updateMutation.error.message}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Get Verified
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Your selfie is processed by AI and deleted instantly. We never store
            your raw biometric data.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 shadow-xs">
              <p className="mb-3 text-sm font-medium">Option 1: Webcam</p>
              {cameraError ? (
                <p className="mb-3 text-xs text-destructive">{cameraError}</p>
              ) : null}
              {cameraEnabled ? (
                <div className="space-y-3">
                  <video
                    ref={videoRef}
                    className="h-56 w-full rounded-xl border object-cover"
                    muted
                    playsInline
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={captureFromCamera}
                      type="button"
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      Capture
                    </Button>
                    <Button
                      onClick={stopCamera}
                      type="button"
                      variant="outline"
                    >
                      Stop Camera
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={enableCamera}
                  type="button"
                  variant="outline"
                  className="gap-2 border-primary/30 hover:bg-primary/10"
                >
                  <Camera className="h-4 w-4" />
                  Open Webcam
                </Button>
              )}
            </div>

            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 shadow-xs">
              <p className="mb-3 text-sm font-medium">Option 2: Upload Photo</p>
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onSelectUpload}
                className="block w-full text-sm"
              />
            </div>
          </div>

          {verifyError ? (
            <p className="text-sm text-destructive">{verifyError}</p>
          ) : null}

          {capturedSelfie ? (
            <img
              src={capturedSelfie}
              alt="Captured selfie"
              className="max-h-64 w-full rounded-xl border border-border/70 object-cover shadow-sm"
            />
          ) : uploadedSelfiePreview ? (
            <img
              src={uploadedSelfiePreview}
              alt="Uploaded selfie"
              className="max-h-64 w-full rounded-xl border border-border/70 object-cover shadow-sm"
            />
          ) : null}

          <Button
            disabled={!verificationReady || verificationMutation.isPending}
            onClick={onVerify}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {verificationMutation.isPending
              ? "Verifying..."
              : "Start Verification"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => resetVerificationState()}
          >
            Reset Verification Form
          </Button>

          {verificationMutation.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : null}

          {verifyResult ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-medium">
                {verifyResult.verified
                  ? "You’re verified 🎉"
                  : "Verification was not conclusive"}
              </p>
              <p className="mt-1 text-muted-foreground">
                {verifyResult.reasoning}
              </p>
              <p className="mt-1 text-muted-foreground">
                Confidence: {(verifyResult.confidence * 100).toFixed(1)}%
              </p>
            </div>
          ) : null}

          {verifyResult && !verifyResult.verified ? (
            <p className="text-sm text-muted-foreground">
              The lighting might be too dark. Let&apos;s try again in a brighter
              spot!
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
