// ═══════════════════════════════════════════════════════════════════
//  StockLine · config.js
//
//  ► CA: Edita aquest fitxer per adaptar l'app al teu cas.
//  ► ES: Edita este archivo para adaptar la app a tu caso.
//  ► EN: Edit this file to adapt the app to your own use case.
// ═══════════════════════════════════════════════════════════════════

export const CONFIG = {
  appName: "StockLine",
  author: { name: "Querià Montserrat", url: "https://github.com/Querii9" },
  repoUrl: "https://github.com/Querii9/stockline",

  // "auto" follows the browser language. Options: "auto" | "ca" | "es" | "en"
  defaultLanguage: "auto",
  currency: "EUR",
  accentColor: "#6d4aff",

  // Add, remove or rename categories freely (the id is what gets stored).
  categories: [
    { id: "electronics", label: { ca: "Electrònica", es: "Electrónica", en: "Electronics" } },
    { id: "office", label: { ca: "Oficina", es: "Oficina", en: "Office" } },
    { id: "safety", label: { ca: "Seguretat", es: "Seguridad", en: "Safety" } },
    { id: "packaging", label: { ca: "Embalatge", es: "Embalaje", en: "Packaging" } },
    { id: "cleaning", label: { ca: "Neteja", es: "Limpieza", en: "Cleaning" } },
    { id: "other", label: { ca: "Altres", es: "Otros", en: "Other" } },
  ],

  // How the death line is calculated (all values in days).
  // death line = stock-out date − supplier lead time − safetyDays
  forecast: {
    windowDays: 30, // history used to measure usage
    recentWeight: 2, // the most recent half of the window counts ×2
    safetyDays: 2, // extra margin on top of the supplier lead time
    warningDays: 7, // "order soon" when the death line is closer than this
    coverDays: 30, // suggested orders cover this many days of usage
    deadStockDays: 45, // no usage for this long = dead stock
    defaultLeadTimeDays: 5,
  },

  ai: {
    model: "claude-opus-5",
    models: [
      { id: "claude-opus-5", label: "Claude Opus 5" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
    // Reasoning effort per feature: "low" | "medium" | "high" (lower = faster & cheaper)
    effort: { analysis: "medium", parse: "low", photo: "medium", chat: "medium" },
    // If the model declines a request, Anthropic retries it on its recommended fallback model.
    refusalFallback: true,
    // Official Anthropic SDK, loaded from a CDN only when AI is used (no build step needed).
    sdkUrl: "https://esm.sh/@anthropic-ai/sdk@0.127.0",
  },
};
