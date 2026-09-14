// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      // Pin these into one eager pre-bundling pass. Without this, Vite's dev
      // server discovers them lazily as pages request them, and its on-disk
      // deps cache can get invalidated mid-session (dev server restarts,
      // package installs) — the symptom is components using these libs
      // (SubmitButton's useFormStatus, shadcn's radix-ui Select) rendering
      // blank or throwing "Cannot read properties of null" during SSR.
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "radix-ui",
        "@radix-ui/react-slot",
        "clsx",
        "tailwind-merge",
        "class-variance-authority",
        "lucide-react",
      ],
    },
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
