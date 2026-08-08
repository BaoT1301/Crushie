import Logo from "@/services/vibe-profiles/components/logo";
import { ClerkLoaded, ClerkLoading, SignUp } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";

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

const SignUpPage = () => {
  return (
    <div className="min-h-dvh grid grid-cols-1 lg:grid-cols-2">
      <div className="h-full lg:flex flex-col items-center justify-center px-4">
        <div className="text-center space-y-4 pt-16">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">Make your Crushie account</h1>
          <p className="text-base text-muted-foreground">
            One screenshot in, and you will know what to say.
          </p>
          <div className="flex items-center justify-center mt-8">
            <ClerkLoaded>
              <SignUp path="/sign-up" appearance={AUTH_FIELD_APPEARANCE} />
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

export default SignUpPage;
