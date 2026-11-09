/**
 * Development-only shortcut for trying the portal before Okta is set up.
 *
 * When the app runs with `npm run dev` and DEV_CONFLUENCE_PAT is set (in
 * .env.local), Okta sign-in is skipped and every request uses that one
 * personal access token.
 *
 * It never activates in a production build (`npm run build` + `npm start`),
 * because then everyone would see Confluence as the token's owner.
 */
export function devConfluencePat(): string | undefined {
  const pat = process.env.DEV_CONFLUENCE_PAT?.trim();
  if (!pat) return undefined;
  if (process.env.NODE_ENV !== "development") {
    if (!warned) {
      warned = true;
      console.warn("[dev-mode] DEV_CONFLUENCE_PAT is set but ignored: it only works with `npm run dev`.");
    }
    return undefined;
  }
  return pat;
}

let warned = false;

export const isDevMode = () => devConfluencePat() !== undefined;

export const DEV_USER_ID = "dev-mode-user";
