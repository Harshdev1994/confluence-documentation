import { notFound, redirect } from "next/navigation";
import { handlePageError, requireConfluence } from "@/server/auth/session";
import { findPageByTitle } from "@/server/confluence/service";

/** Resolves Confluence "/display/SPACE/Page+Title" links to a page in this app. */
export default async function ResolvePage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string; title?: string }>;
}) {
  const { space, title } = await searchParams;
  if (!space || !title) notFound();
  const { confluence } = await requireConfluence();

  let id: string | null;
  try {
    id = await findPageByTitle(confluence.ctx, space, title);
  } catch (err) {
    handlePageError(err);
  }
  if (!id) notFound();
  redirect(`/pages/${id}`);
}
