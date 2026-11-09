import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions";
import { getAppSession } from "@/server/auth/session";
import { isDevMode } from "@/server/dev-mode";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getAppSession();
  if (!session) redirect("/login");
  const confluenceName = session.confluence?.token.displayName;
  const devMode = isDevMode();

  return (
    <>
      <header className="app-header">
        <Link href="/spaces" className="brand">
          Docs Portal
        </Link>
        <nav className="header-nav">
          <Link href="/spaces">Spaces</Link>
        </nav>
        <div className="header-spacer" />
        <div className="user-chip">
          <Link href="/settings/token" title="Confluence connection">
            {confluenceName ? `Confluence: ${confluenceName}` : "Connect Confluence"}
          </Link>
          {devMode ? (
            <span className="badge" title="Okta sign-in is skipped. Only works with npm run dev.">
              Development mode
            </span>
          ) : (
            <>
              <span>{session.oktaUser.name ?? session.oktaUser.email}</span>
              <form action={signOutAction}>
                <button className="btn-link" type="submit">
                  Sign out
                </button>
              </form>
            </>
          )}
        </div>
      </header>
      {children}
    </>
  );
}
