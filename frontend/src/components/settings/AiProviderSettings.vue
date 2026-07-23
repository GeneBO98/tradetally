<template>
    <!-- AI Provider Settings -->
    <div class="card">
        <div class="card-body">
            <h3
                class="text-lg font-medium text-gray-900 dark:text-white mb-6"
            >
                AI Provider Settings
            </h3>
            <p
                class="text-sm text-gray-600 dark:text-gray-400 mb-6"
            >
                Configure which AI provider to use for analytics
                recommendations and CUSIP lookups.
                <span
                    v-if="authStore.user?.role === 'admin'"
                    class="block mt-2 text-primary-600 dark:text-primary-400 font-medium"
                >
                    Note: As an admin, you can also configure
                    default settings for all users below.
                </span>
                <span
                    v-else
                    class="block mt-2 text-primary-600 dark:text-primary-400 font-medium"
                >
                    Note: If you leave these settings empty,
                    admin-configured defaults will be used.
                </span>
            </p>

            <form
                @submit.prevent="$emit('submit')"
                class="space-y-6"
            >
                <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                        <label for="aiProvider" class="label"
                            >AI Provider</label
                        >
                        <BaseSelect
                            v-model="form.provider"
                            :options="AI_PROVIDER_OPTIONS"
                            placeholder="No provider"
                            @change="onProviderChange"
                        />
                        <p
                            class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                        >
                            Choose your preferred AI provider for
                            analytics and CUSIP resolution.
                        </p>
                    </div>

                    <div>
                        <label for="aiModel" class="label">
                            Model{{ form.provider === "custom" ? "" : " (Optional)" }}
                        </label>
                        <input
                            id="aiModel"
                            v-model="form.model"
                            type="text"
                            class="input"
                            :placeholder="getModelPlaceholder()"
                            :required="form.provider === 'custom'"
                        />
                        <p
                            class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                        >
                            <template v-if="form.provider === 'custom'">
                                Exact model identifier expected by the endpoint.
                            </template>
                            <template v-else>
                                Specific model to use. Leave blank for default.
                            </template>
                        </p>
                    </div>
                </div>

                <div
                    v-if="URL_REQUIRED_AI_PROVIDERS.includes(form.provider)"
                >
                    <label for="aiUrl" class="label">API URL</label>
                    <input
                        id="aiUrl"
                        v-model="form.url"
                        type="url"
                        class="input"
                        :placeholder="
                            form.provider === 'ollama'
                                ? 'http://localhost:11434'
                                : form.provider === 'lmstudio'
                                  ? 'http://localhost:1234'
                                  : form.provider === 'custom'
                                    ? 'https://provider.example/v1'
                                    : 'http://localhost:8000'
                        "
                        required
                    />
                    <p
                        class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                    >
                        {{
                            form.provider === "ollama"
                                ? "Ollama server URL"
                                : form.provider === "custom"
                                  ? "OpenAI-compatible base URL or full chat completions endpoint"
                                  : "Legacy local AI endpoint URL"
                        }}
                    </p>
                    <p
                        v-if="form.provider === 'custom'"
                        class="mt-3 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-200"
                    >
                        TradeTally sends AI prompts and relevant trading data to this endpoint.
                        Use a service you trust.
                    </p>
                </div>

                <div
                    v-if="
                        form.provider &&
                        form.provider !== 'local'
                    "
                >
                    <label for="aiApiKey" class="label"
                        >API Key</label
                    >
                    <input
                        id="aiApiKey"
                        v-model="form.apiKey"
                        type="password"
                        class="input"
                        :placeholder="getApiKeyPlaceholder()"
                        :required="
                            !!form.provider &&
                            !OPTIONAL_API_KEY_AI_PROVIDERS.includes(form.provider)
                        "
                    />
                    <p
                        class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                    >
                        {{ getApiKeyHelp() }}
                    </p>
                </div>

                <div class="flex justify-end">
                    <button
                        type="submit"
                        :disabled="loading"
                        class="btn-primary"
                    >
                        <span
                            v-if="loading"
                            class="flex items-center"
                        >
                            <div
                                class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
                            ></div>
                            Saving...
                        </span>
                        <span v-else>Save AI Settings</span>
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>

<script setup>
import { useAuthStore } from "@/stores/auth";
import BaseSelect from "@/components/common/BaseSelect.vue";
import {
    AI_PROVIDER_OPTIONS,
    OPTIONAL_API_KEY_AI_PROVIDERS,
    URL_REQUIRED_AI_PROVIDERS,
} from "@/utils/aiProviderOptions";

const props = defineProps({
    form: { type: Object, required: true },
    loading: { type: Boolean, default: false },
});

defineEmits(["submit"]);

const authStore = useAuthStore();

function getModelPlaceholder() {
    switch (props.form.provider) {
        case "gemini":
            return "e.g., gemini-1.5-pro";
        case "claude":
            return "e.g., claude-3-5-sonnet";
        case "openai":
            return "e.g., gpt-4o";
        case "deepseek":
            return "e.g., deepseek-chat";
        case "kimi":
            return "e.g., moonshot-v1-8k";
        case "ollama":
            return "e.g., llama3.1";
        case "lmstudio":
            return "e.g., local-model (auto-detected)";
        case "perplexity":
            return "e.g., sonar";
        case "custom":
            return "e.g., llama-3.2-3b-instruct";
        case "local":
            return "e.g., custom-model";
        default:
            return "Model name";
    }
}

function getApiKeyPlaceholder() {
    switch (props.form.provider) {
        case "gemini":
            return "AIza...";
        case "claude":
            return "sk-ant-...";
        case "openai":
            return "sk-...";
        case "deepseek":
            return "sk-...";
        case "kimi":
            return "sk-...";
        case "ollama":
            return "Optional API key";
        case "perplexity":
            return "pplx-...";
        case "lmstudio":
            return "Optional API key";
        case "custom":
            return "Optional API key";
        case "local":
            return "Enter API key";
        default:
            return "Enter API key";
    }
}

function getApiKeyHelp() {
    switch (props.form.provider) {
        case "gemini":
            return "Get your API key from Google AI Studio";
        case "claude":
            return "Get your API key from Anthropic Console";
        case "openai":
            return "Get your API key from OpenAI Dashboard";
        case "deepseek":
            return "Get your API key from DeepSeek Platform";
        case "kimi":
            return "Get your API key from Moonshot AI Platform";
        case "ollama":
            return "API key is optional for Ollama";
        case "perplexity":
            return "Get your API key from Perplexity AI Settings";
        case "lmstudio":
            return "API key is optional for LM Studio";
        case "custom":
            return "Optional. Sent as a Bearer token when provided";
        case "local":
            return "Enter your custom API key if required";
        default:
            return "Enter your API key";
    }
}

function onProviderChange() {
    // Clear URL and API key when provider changes
    props.form.url = "";
    props.form.apiKey = "";
    props.form.model = "";
}
</script>
