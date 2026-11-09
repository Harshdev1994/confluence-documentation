import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** Okta subject identifier. */
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
