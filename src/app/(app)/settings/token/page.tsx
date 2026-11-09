import { removeTokenAction } from "@/app/actions";
import { getAppSession } from "@/server/auth/session";
import { env } from "@/server/env";
import { isDevMode } from "@/server/dev-mode";
import { getConfluenceInfo } from "@/server/confluence/service";
import { TokenForm } from "./token-form";

export const metadata = { title: "Confluence connection" };

export default async function TokenSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; callbackUrl?: string }>;
}) {
  const { reason, callbackUrl } = await searchParams;
  const session = await getAppSession();
  const connected = session?.confluence?.token;
  const baseUrl = env().CONFLUENCE_BASE_URL;
  const info = await getConfluenceInfo();

  if (isDevMode()) {
    return (
      <div className="center-card wide">
        <h1>Development mode</h1>
        {reason === "dev-rejected" ? (
          <div className="alert alert-error">
            Confluence rejected DEV_CONFLUENCE_PAT from .env.local. Check it was copied in full, or create a new token in
            Confluence, then restart <code>npm run dev</code>.
          </div>
        ) : (
          <div className="alert alert-info">
            Using the personal access token from <code>.env.local</code>. Okta sign-in is skipped.
          </div>
        )}
        <p>
          {info.version
            ? `Connected to Confluence ${info.version} at ${baseUrl}.`
            : `Can't reach Confluence at ${baseUrl}. Check the URL, your network/VPN, and the certificate note in the README.`}
        </p>
        <p className="hint" style={{ marginBottom: 0 }}>
          This mode only works with <code>npm run dev</code>. A production build ignores DEV_CONFLUENCE_PAT and uses
          Okta sign-in, with each person connecting their own token.
        </p>
      </div>
    );
  }

  return (
    <div className="center-card wide">
      <h1>Connect your Confluence account</h1>
      <p>
        The portal reads and edits Confluence as you, using your personal access token, so you see exactly the pages
        your Confluence account can see.
      </p>

      {reason === "expired" && (
        <div className="alert alert-error">Confluence no longer accepts your saved token. Please add a new one.</div>
      )}

      {connected && reason !== "expired" && (
        <div className="connected">
          <span>
            <strong>Connected</strong> as {connected.displayName} ({connected.username})
          </span>
          <form action={removeTokenAction}>
            <button className="btn btn-small" type="submit">
              Disconnect
            </button>
          </form>
        </div>
      )}

      <ol className="steps">
        <li>
          Open{" "}
          <a href={`${baseUrl}/plugins/personalaccesstokens/usertokens.action`} target="_blank" rel="noopener noreferrer">
            Personal Access Tokens in Confluence
          </a>{" "}
          (Profile → Settings → Personal Access Tokens).
        </li>
        <li>Create a token. Choose an expiry that suits you; you&apos;ll be asked for a new one when it expires.</li>
        <li>Copy it and paste it below. It&apos;s shown only once in Confluence.</li>
      </ol>

      <TokenForm callbackUrl={callbackUrl} />

      <p className="hint" style={{ marginTop: 20, marginBottom: 0 }}>
        Your token is encrypted and kept in a secure browser cookie. It&apos;s never shown to other users or stored in a
        database. {info.version ? `Confluence ${info.version}.` : ""}
      </p>
    </div>
  );
}
