"use server";

import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { clearTokenCookie, getAppSession, saveTokenCookie } from "@/server/auth/session";
import { ConfluenceError } from "@/server/confluence/client";
import { getCurrentUser } from "@/server/confluence/service";

function safeCallback(url: FormDataEntryValue | null | undefined, fallback: string) {
  const value = typeof url === "string" ? url : "";
  // Only allow same-site relative paths, never "//host" or absolute URLs.
  return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export async function signInAction(formData: FormData) {
  await signIn("okta", { redirectTo: safeCallback(formData.get("callbackUrl"), "/spaces") });
}

export async function signOutAction() {
  await clearTokenCookie();
  await signOut({ redirectTo: "/login" });
}

export interface TokenFormState {
  error?: string;
}

/** Verifies the PAT against Confluence, then stores it encrypted in a cookie. */
export async function saveTokenAction(_prev: TokenFormState, formData: FormData): Promise<TokenFormState> {
  const session = await getAppSession();
  if (!session) redirect("/login");

  const pat = String(formData.get("pat") ?? "").trim();
  if (!pat) return { error: "Paste your Confluence personal access token." };
  if (pat.length > 512 || /\s/.test(pat)) return { error: "That doesn't look like a personal access token." };

  try {
    const user = await getCurrentUser(pat);
    await saveTokenCookie({
      pat,
      sub: session.oktaUser.id,
      username: user.username,
      displayName: user.displayName,
    });
  } catch (err) {
    if (err instanceof ConfluenceError) {
      if (err.status === 401 || err.status === 403) {
        return { error: "Confluence rejected this token. Check that it's copied in full and hasn't expired." };
      }
      if (err.status === 0) {
        return { error: "The server can't reach Confluence right now. Try again, or contact the app admin." };
      }
      return { error: `Confluence returned an error (${err.status}). Try again in a moment.` };
    }
    throw err;
  }
  redirect(safeCallback(formData.get("callbackUrl"), "/spaces"));
}

export async function removeTokenAction() {
  await clearTokenCookie();
  redirect("/settings/token");
}
