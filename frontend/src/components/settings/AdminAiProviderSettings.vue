<template>
    <!-- Admin AI Provider Settings -->
    <div class="card">
        <div class="card-body">
            <h3
                class="text-lg font-medium text-gray-900 dark:text-white mb-6"
            >
                Admin AI Provider Settings
            </h3>
            <p
                class="text-sm text-gray-600 dark:text-gray-400 mb-6"
            >
                Configure default AI provider settings for all
                users. Users can override these settings for their
                own accounts.
            </p>

            <form
                @submit.prevent="$emit('submit')"
                class="space-y-6"
            >
                <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                        <label for="adminAiProvider" class="label"
                            >Default AI Provider</label
                        >
                        <BaseSelect
                            v-model="form.provider"
                            :options="[
                                { value: 'gemini', label: 'Google Gemini' },
                                { value: 'claude', label: 'Anthropic Claude' },
                                { value: 'openai', label: 'OpenAI' },
                                { value: 'deepseek', label: 'DeepSeek' },
                                { value: 'kimi', label: 'Kimi' },
                                { value: 'ollama', label: 'Ollama' },
                                { value: 'lmstudio', label: 'LM Studio' },
                                { value: 'perplexity', label: 'Perplexity AI' },
                                { value: 'local', label: 'Local/Custom' }
                            ]"
                            placeholder="No provider"
                            @change="onAdminProviderChange"
                        />
                        <p
                            class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                        >
                            Default AI provider for all users
                            (unless they override it).
                        </p>
                    </div>

                    <div>
                        <label for="adminAiModel" class="label"
                            >Default Model (Optional)</label
                        >
                        <input
                            id="adminAiModel"
                            v-model="form.model"
                            type="text"
                            class="input"
                            :placeholder="
                                getAdminModelPlaceholder()
                            "
                        />
                        <p
                            class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                        >
                            Default model to use. Leave blank for
                            provider default.
                        </p>
                    </div>
                </div>

                <div
                    v-if="
                        form.provider === 'local' ||
                        form.provider === 'ollama' ||
                        form.provider === 'lmstudio'
                    "
                >
                    <label for="adminAiUrl" class="label"
                        >Default API URL</label
                    >
                    <input
                        id="adminAiUrl"
                        v-model="form.url"
                        type="url"
                        class="input"
                        :placeholder="
                            form.provider === 'ollama'
                                ? 'http://localhost:11434'
                                : form.provider ===
                                    'lmstudio'
                                  ? 'http://localhost:1234'
                                  : 'http://localhost:8000'
                        "
                        required
                    />
                    <p
                        class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                    >
                        Default
                        {{
                            form.provider === "ollama"
                                ? "Ollama server URL"
                                : "custom AI API endpoint URL"
                        }}
                        for all users.
                    </p>
                </div>

                <div
                    v-if="
                        form.provider &&
                        form.provider !== 'local'
                    "
                >
                    <label for="adminAiApiKey" class="label"
                        >Default API Key</label
                    >
                    <input
                        id="adminAiApiKey"
                        v-model="form.apiKey"
                        type="password"
                        class="input"
                        :placeholder="getAdminApiKeyPlaceholder()"
                        :required="
                            !!form.provider &&
                            !['ollama', 'lmstudio'].includes(
                                form.provider,
                            )
                        "
                    />
                    <p
                        class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                    >
                        {{ getAdminApiKeyHelp() }}
                    </p>
                </div>

                <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <div
                        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                        <div>
                            <h4
                                class="text-base font-medium text-gray-900 dark:text-white"
                            >
                                Follow-up Question Checker
                            </h4>
                            <p
                                class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                            >
                                Optional smaller model used to
                                approve trading-related follow-up
                                questions before the default model
                                runs.
                            </p>
                        </div>
                        <label
                            for="adminAiClassifierEnabled"
                            class="inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                            <input
                                id="adminAiClassifierEnabled"
                                v-model="
                                    form.classifierEnabled
                                "
                                type="checkbox"
                                class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                            />
                            Enabled
                        </label>
                    </div>

                    <fieldset
                        class="mt-6 space-y-6"
                        :class="
                            !form.classifierEnabled
                                ? 'opacity-60'
                                : ''
                        "
                        :disabled="!form.classifierEnabled"
                    >
                        <div
                            class="grid grid-cols-1 gap-6 sm:grid-cols-2"
                        >
                            <div>
                                <label
                                    for="adminAiClassifierProvider"
                                    class="label"
                                >
                                    Checking Provider
                                </label>
                                <BaseSelect
                                    v-model="form.classifierProvider"
                                    :options="[
                                        { value: 'gemini', label: 'Google Gemini' },
                                        { value: 'claude', label: 'Anthropic Claude' },
                                        { value: 'openai', label: 'OpenAI' },
                                { value: 'deepseek', label: 'DeepSeek' },
                                { value: 'kimi', label: 'Kimi' },
                                        { value: 'ollama', label: 'Ollama' },
                                        { value: 'lmstudio', label: 'LM Studio' },
                                        { value: 'perplexity', label: 'Perplexity AI' },
                                        { value: 'local', label: 'Local/Custom' }
                                    ]"
                                    placeholder="Use default provider"
                                    @change="onAdminClassifierProviderChange"
                                />
                            </div>

                            <div>
                                <label
                                    for="adminAiClassifierModel"
                                    class="label"
                                >
                                    Checking Model
                                </label>
                                <input
                                    id="adminAiClassifierModel"
                                    v-model="
                                        form.classifierModel
                                    "
                                    type="text"
                                    class="input"
                                    :placeholder="
                                        getAdminClassifierModelPlaceholder()
                                    "
                                />
                            </div>
                        </div>

                        <div
                            v-if="
                                form.classifierProvider ===
                                    'local' ||
                                form.classifierProvider ===
                                    'ollama' ||
                                form.classifierProvider ===
                                    'lmstudio'
                            "
                        >
                            <label
                                for="adminAiClassifierUrl"
                                class="label"
                            >
                                Checking API URL
                            </label>
                            <input
                                id="adminAiClassifierUrl"
                                v-model="
                                    form.classifierUrl
                                "
                                type="url"
                                class="input"
                                :placeholder="
                                    getAdminClassifierUrlPlaceholder()
                                "
                            />
                        </div>

                        <div
                            v-if="
                                form.classifierProvider &&
                                form.classifierProvider !==
                                    'local'
                            "
                        >
                            <label
                                for="adminAiClassifierApiKey"
                                class="label"
                            >
                                Checking API Key
                            </label>
                            <input
                                id="adminAiClassifierApiKey"
                                v-model="
                                    form.classifierApiKey
                                "
                                type="password"
                                class="input"
                                :placeholder="
                                    getAdminClassifierApiKeyPlaceholder()
                                "
                            />
                        </div>
                    </fieldset>
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
                        <span v-else>Save Admin AI Settings</span>
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>

<script setup>
import BaseSelect from "@/components/common/BaseSelect.vue";

const props = defineProps({
    form: { type: Object, required: true },
    loading: { type: Boolean, default: false },
});

defineEmits(["submit"]);

function onAdminProviderChange() {
    // Clear API key and URL when provider changes
    props.form.apiKey = "";
    props.form.url = "";
    props.form.model = "";
    if (!props.form.classifierProvider) {
        props.form.classifierApiKey = "";
        props.form.classifierUrl = "";
    }
}

// eslint-disable-next-line no-unused-vars
function onAdminClassifierEnabledChange() {
    if (!props.form.classifierEnabled) {
        props.form.classifierProvider = "";
        props.form.classifierApiKey = "";
        props.form.classifierUrl = "";
        props.form.classifierModel = "";
    }
}

function onAdminClassifierProviderChange() {
    props.form.classifierApiKey = "";
    props.form.classifierUrl = "";
    props.form.classifierModel = "";
}

function getEffectiveAdminClassifierProvider() {
    return props.form.classifierProvider || props.form.provider;
}

function getAdminClassifierModelPlaceholder() {
    switch (getEffectiveAdminClassifierProvider()) {
        case "gemini":
            return "gemini-1.5-flash";
        case "claude":
            return "claude-3-haiku-20240307";
        case "openai":
            return "gpt-4o-mini";
        case "deepseek":
            return "deepseek-chat";
        case "kimi":
            return "moonshot-v1-8k";
        case "ollama":
            return "llama3.1";
        case "lmstudio":
            return "local-model";
        case "perplexity":
            return "sonar";
        case "local":
            return "custom-model";
        default:
            return "Smaller checking model";
    }
}

function getAdminClassifierUrlPlaceholder() {
    switch (props.form.classifierProvider) {
        case "ollama":
            return "http://localhost:11434";
        case "lmstudio":
            return "http://localhost:1234";
        case "local":
            return "http://localhost:8000";
        default:
            return "API URL";
    }
}

function getAdminClassifierApiKeyPlaceholder() {
    switch (props.form.classifierProvider) {
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
        case "perplexity":
            return "Enter Perplexity API key";
        case "ollama":
        case "lmstudio":
            return "Optional API key";
        default:
            return "Enter API key";
    }
}

function getAdminModelPlaceholder() {
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
        case "local":
            return "custom-model";
        default:
            return "Leave blank for default";
    }
}

function getAdminApiKeyPlaceholder() {
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
        default:
            return "Enter API key";
    }
}

function getAdminApiKeyHelp() {
    switch (props.form.provider) {
        case "gemini":
            return "Get your free API key at: https://aistudio.google.com/app/apikey";
        case "claude":
            return "Get your API key at: https://console.anthropic.com/";
        case "openai":
            return "Get your API key at: https://platform.openai.com/api-keys";
        case "deepseek":
            return "Get your API key at: https://platform.deepseek.com/api_keys";
        case "kimi":
            return "Get your API key at: https://platform.moonshot.ai/console/api-keys";
        case "ollama":
            return "API key is optional for Ollama. Leave blank if not needed.";
        default:
            return "API key for your chosen provider";
    }
}
</script>
