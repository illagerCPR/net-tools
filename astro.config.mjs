import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://net-tools.pages.dev",
  output: "static",
  compressHTML: true,
  devToolbar: { enabled: false },
  build: {
    inlineStylesheets: "auto",
  },
});
