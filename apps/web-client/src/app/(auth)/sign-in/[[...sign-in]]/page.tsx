import { Loader2 } from "lucide-react";
import { SignIn, ClerkLoaded, ClerkLoading } from "@clerk/nextjs";
import Logo from "@/services/vibe-profiles/components/logo";

/**
 * Clerk renders its form fields at 13px and 30px tall. Anything under 16px
 * makes iOS Safari zoom the page in on focus and it never zooms back out, so
 * on the first screen of the funnel the form ends up half off-screen. 16px
 * text and a 44px field height fix both that and the touch target.
 *
 * The font-size needs Tailwind's important modifier: Clerk styles these
 * fields with generated CSS-in-JS classes that outrank a plain utility, and
 * a min-height alone still leaves the 13px text that triggers the zoom.
 */
const AUTH_FIELD_APPEARANCE = {
  elements: {
    formFieldInput: "text-base! min-h-11 md:text-sm! md:min-h-0",
  },
} as const;

const SignInPage = () => {
  return (
    <div className="min-h-dvh grid grid-cols-1 lg:grid-cols-2">
      <div className="h-full lg:flex flex-col items-center justify-center px-4">
        <div className="text-center space-y-4 pt-16">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">Welcome back</h1>
          <p className="text-base text-muted-foreground">
            Pick up where you left off.
          </p>
          <div className=" flex items-center justify-center mt-8">
            <ClerkLoaded>
              <SignIn path="/sign-in" appearance={AUTH_FIELD_APPEARANCE} />
            </ClerkLoaded>
            <ClerkLoading>
              <Loader2 className="animate-spin text-muted-foreground" />
            </ClerkLoading>
          </div>
        </div>
      </div>
      <div className="h-full hidden lg:flex items-center justify-center bg-primary">
        <Logo />
      </div>
    </div>
  );
};

export default SignInPage;
