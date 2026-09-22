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
    // Provider used by default. Each visitor can switch it in ⚙️ Settings.
    provider: "anthropic",
    // Reasoning effort per feature: "low" | "medium" | "high" (lower = faster & cheaper).
    // Mapped to each provider's own setting (effort / reasoning.effort / thinking_level).
    effort: { analysis: "medium", parse: "low", photo: "medium", chat: "medium" },

    // Every provider's official SDK is loaded from a CDN only when it's used (no build step).
    providers: {
      anthropic: {
        label: "Claude",
        company: "Anthropic",
        model: "claude-opus-5",
        models: [
          { id: "claude-opus-5", label: "Claude Opus 5" },
          { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
          { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
        ],
        keyUrl: "https://console.anthropic.com/settings/keys",
        keyHint: "sk-ant-…",
        sdkUrl: "https://esm.sh/@anthropic-ai/sdk@0.127.0",
        // If the model declines a request, Anthropic retries it on its recommended fallback model.
        refusalFallback: true,
      },
      openai: {
        label: "OpenAI",
        company: "OpenAI",
        model: "gpt-5.6",
        models: [
          { id: "gpt-5.6", label: "GPT-5.6" },
          { id: "gpt-6-astra", label: "GPT-6 Astra" },
          { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
          { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
        ],
        keyUrl: "https://platform.openai.com/api-keys",
        keyHint: "sk-…",
        sdkUrl: "https://esm.sh/openai@7.21.0",
      },
      gemini: {
        label: "Gemini",
        company: "Google",
        model: "gemini-3.8-flash",
        models: [
          { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
          { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
          { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" },
        ],
        keyUrl: "https://aistudio.google.com/apikey",
        keyHint: "AIza…",
        sdkUrl: "https://esm.sh/@google/genai@2.24.0",
      },
    },
  },
};
