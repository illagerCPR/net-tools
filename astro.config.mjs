import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://net-tools.illageraris.dpdns.org",
  output: "static",
  compressHTML: true,
  devToolbar: { enabled: false },
  build: {
    inlineStylesheets: "auto",
  },
});
