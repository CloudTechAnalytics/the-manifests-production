// Ambient declarations so the editor's TypeScript server (no Deno
// extension installed) stops flagging Deno-only syntax as errors. Real
// type-checking for these files happens under `deno check` / at deploy
// time via the Supabase CLI, not tsc — this file exists purely to quiet
// false-positive red squiggles in plain VS Code.

declare module "jsr:*";
declare module "npm:*";

declare global {
  const Deno: {
    env: {
      get(key: string): string | undefined;
    };
    serve(handler: (req: Request) => Response | Promise<Response>): void;
  };
}

export {};
