"use client";

import { useActionState } from "react";
import { saveTokenAction, type TokenFormState } from "@/app/actions";

export function TokenForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction, pending] = useActionState<TokenFormState, FormData>(saveTokenAction, {});

  return (
    <form action={formAction}>
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
      {state.error && (
        <div className="alert alert-error" role="alert">
          {state.error}
        </div>
      )}
      <div className="field">
        <label htmlFor="pat">Personal access token</label>
        <input
          id="pat"
          name="pat"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          placeholder="Paste token"
        />
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Checking with Confluence…" : "Save and continue"}
      </button>
    </form>
  );
}
