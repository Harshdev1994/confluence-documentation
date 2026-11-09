import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { signInAction } from "@/app/actions";
import { isDevMode } from "@/server/dev-mode";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  if (isDevMode()) redirect("/spaces");
  const session = await auth();
  if (session?.user) redirect(callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/spaces");

  return (
    <div className="center-card">
      <h1>Docs Portal</h1>
      <p>Company documentation from Confluence. Sign in with your company account to continue.</p>
      {error && <div className="alert alert-error">Sign-in didn&apos;t complete. Please try again.</div>}
      <form action={signInAction}>
        <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/spaces"} />
        <button className="btn btn-primary" type="submit" style={{ width: "100%" }}>
          Sign in with Okta
        </button>
      </form>
    </div>
  );
}
