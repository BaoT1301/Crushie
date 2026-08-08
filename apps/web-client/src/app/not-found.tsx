import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The page you are looking for does not exist.
      </p>
      <Link href="/" className="mt-6 underline underline-offset-4">
        Go back home
      </Link>
    </main>
  );
}
