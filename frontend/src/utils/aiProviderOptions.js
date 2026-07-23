export const AI_PROVIDER_OPTIONS = Object.freeze([
    { value: "gemini", label: "Google Gemini" },
    { value: "claude", label: "Anthropic Claude" },
    { value: "openai", label: "OpenAI" },
    { value: "deepseek", label: "DeepSeek" },
    { value: "kimi", label: "Kimi" },
    { value: "ollama", label: "Ollama" },
    { value: "lmstudio", label: "LM Studio" },
    { value: "perplexity", label: "Perplexity AI" },
    { value: "custom", label: "Custom (OpenAI-compatible)" },
    { value: "local", label: "Local (Legacy)" },
]);

export const URL_REQUIRED_AI_PROVIDERS = Object.freeze([
    "local",
    "ollama",
    "lmstudio",
    "custom",
]);

export const OPTIONAL_API_KEY_AI_PROVIDERS = Object.freeze([
    "ollama",
    "lmstudio",
    "custom",
]);
