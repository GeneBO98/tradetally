<template>
    <!-- Admin CUSIP AI Provider Settings -->
    <div class="card">
        <div class="card-body">
            <h3
                class="text-lg font-medium text-gray-900 dark:text-white mb-6"
            >
                Admin CUSIP AI Provider Settings
            </h3>
            <p
                class="text-sm text-gray-600 dark:text-gray-400 mb-6"
            >
                Configure default CUSIP resolution AI provider for
                all users. If not set, the main admin AI provider
                will be used.
            </p>

            <form
                @submit.prevent="$emit('submit')"
                class="space-y-6"
            >
                <div class="flex items-center mb-4">
                    <input
                        id="adminUseMainProviderForCusip"
                        v-model="form.useMainProvider"
                        type="checkbox"
                        class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        @change="onAdminCusipUseMainProviderChange"
                    />
                    <label
                        for="adminUseMainProviderForCusip"
                        class="ml-2 text-sm text-gray-700 dark:text-gray-300"
                    >
                        Use main admin AI provider for CUSIP
                        resolution
                    </label>
                </div>

                <div
                    v-if="!form.useMainProvider"
                    class="space-y-6"
                >
                    <div
                        class="grid grid-cols-1 gap-6 sm:grid-cols-2"
                    >
                        <div>
                            <label
                                for="adminCusipAiProvider"
                                class="label"
                                >Default CUSIP AI Provider</label
                            >
                            <BaseSelect
                                v-model="form.provider"
                                :options="AI_PROVIDER_OPTIONS"
                                placeholder="No provider"
                                @change="onAdminCusipProviderChange"
                            />
                        </div>

                        <div>
                            <label for="adminCusipAiModel" class="label">
                                Default Model{{ form.provider === "custom" ? "" : " (Optional)" }}
                            </label>
                            <input
                                id="adminCusipAiModel"
                                v-model="form.model"
                                type="text"
                                class="input"
                                :placeholder="
                                    getAdminCusipModelPlaceholder()
                                "
                                :required="form.provider === 'custom'"
                            />
                        </div>
                    </div>

                    <div
                        v-if="URL_REQUIRED_AI_PROVIDERS.includes(form.provider)"
                    >
                        <label for="adminCusipAiUrl" class="label"
                            >Default API URL</label
                        >
                        <input
                            id="adminCusipAiUrl"
                            v-model="form.url"
                            type="url"
                            class="input"
                            :placeholder="
                                form.provider ===
                                'ollama'
                                    ? 'http://localhost:11434'
                                    : form.provider ===
                                        'lmstudio'
                                      ? 'http://localhost:1234'
                                      : form.provider === 'custom'
                                        ? 'https://provider.example/v1'
                                        : 'http://localhost:8000'
                            "
                            required
                        />
                        <p
                            v-if="form.provider === 'custom'"
                            class="mt-3 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-200"
                        >
                            CUSIP prompts and relevant trading data are sent to this endpoint.
                            Configure only a service you trust.
                        </p>
                    </div>

                    <div
                        v-if="
                            form.provider &&
                            form.provider !== 'local'
                        "
                    >
                        <label
                            for="adminCusipAiApiKey"
                            class="label"
                            >Default API Key</label
                        >
                        <input
                            id="adminCusipAiApiKey"
                            v-model="form.apiKey"
                            type="password"
                            class="input"
                            :placeholder="
                                getAdminCusipApiKeyPlaceholder()
                            "
                            :required="
                                !!form.provider &&
                                !OPTIONAL_API_KEY_AI_PROVIDERS.includes(form.provider)
                            "
                        />
                    </div>
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
                        <span v-else
                            >Save Admin CUSIP AI Settings</span
                        >
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>

<script setup>
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

function onAdminCusipProviderChange() {
    props.form.apiKey = "";
    props.form.url = "";
    props.form.model = "";
}

function onAdminCusipUseMainProviderChange() {
    if (props.form.useMainProvider) {
        props.form.provider = "gemini";
        props.form.url = "";
        props.form.apiKey = "";
        props.form.model = "";
    }
}

function getAdminCusipModelPlaceholder() {
    switch (props.form.provider) {
        case "gemini":
            return "gemini-1.5-flash";
        case "claude":
            return "claude-3-5-sonnet-20241022";
        case "openai":
            return "gpt-4o";
        case "deepseek":
            return "deepseek-chat";
        case "kimi":
            return "moonshot-v1-8k";
        case "ollama":
            return "llama3.1";
        case "lmstudio":
            return "local-model (auto-detected)";
        case "perplexity":
            return "sonar";
        case "custom":
            return "llama-3.2-3b-instruct";
        case "local":
            return "custom-model";
        default:
            return "Leave blank for default";
    }
}

function getAdminCusipApiKeyPlaceholder() {
    switch (props.form.provider) {
        case "gemini":
            return "Enter Google Gemini API key";
        case "claude":
            return "Enter Anthropic Claude API key";
        case "openai":
            return "Enter OpenAI API key";
        case "deepseek":
            return "Enter DeepSeek API key";
        case "kimi":
            return "Enter Moonshot AI API key";
        case "ollama":
            return "Optional: Enter Ollama API key";
        case "custom":
            return "Optional API key";
        default:
            return "Enter API key";
    }
}
</script>
