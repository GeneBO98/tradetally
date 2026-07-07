<template>
    <!-- CUSIP AI Provider Settings -->
    <div class="card">
        <div class="card-body">
            <h3
                class="text-lg font-medium text-gray-900 dark:text-white mb-6"
            >
                CUSIP Resolution AI Provider
            </h3>
            <p
                class="text-sm text-gray-600 dark:text-gray-400 mb-6"
            >
                Optionally configure a separate AI provider
                specifically for CUSIP resolution. If not
                configured, the main AI provider above will be used.
            </p>

            <form
                @submit.prevent="$emit('submit')"
                class="space-y-6"
            >
                <div class="flex items-center mb-4">
                    <input
                        id="useMainProviderForCusip"
                        v-model="form.useMainProvider"
                        type="checkbox"
                        class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        @change="onCusipUseMainProviderChange"
                    />
                    <label
                        for="useMainProviderForCusip"
                        class="ml-2 text-sm text-gray-700 dark:text-gray-300"
                    >
                        Use main AI provider for CUSIP resolution
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
                                for="cusipAiProvider"
                                class="label"
                                >CUSIP AI Provider</label
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
                                @change="onCusipProviderChange"
                            />
                        </div>

                        <div>
                            <label for="cusipAiModel" class="label"
                                >Model (Optional)</label
                            >
                            <input
                                id="cusipAiModel"
                                v-model="form.model"
                                type="text"
                                class="input"
                                :placeholder="
                                    getCusipModelPlaceholder()
                                "
                            />
                        </div>
                    </div>

                    <div
                        v-if="
                            form.provider === 'local' ||
                            form.provider === 'ollama' ||
                            form.provider === 'lmstudio'
                        "
                    >
                        <label for="cusipAiUrl" class="label"
                            >API URL</label
                        >
                        <input
                            id="cusipAiUrl"
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
                    </div>

                    <div
                        v-if="
                            form.provider &&
                            form.provider !== 'local'
                        "
                    >
                        <label for="cusipAiApiKey" class="label"
                            >API Key</label
                        >
                        <input
                            id="cusipAiApiKey"
                            v-model="form.apiKey"
                            type="password"
                            class="input"
                            :placeholder="
                                getCusipApiKeyPlaceholder()
                            "
                            :required="
                                !!form.provider &&
                                !['ollama', 'lmstudio'].includes(
                                    form.provider,
                                )
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
                        <span v-else>Save CUSIP AI Settings</span>
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

function getCusipModelPlaceholder() {
    switch (props.form.provider) {
        case "gemini":
            return "e.g., gemini-1.5-pro";
        case "claude":
            return "e.g., claude-3-5-sonnet-20241022";
        case "openai":
            return "e.g., gpt-4o";
        case "deepseek":
            return "e.g., deepseek-chat";
        case "kimi":
            return "e.g., moonshot-v1-8k";
        case "ollama":
            return "e.g., llama3.2";
        case "perplexity":
            return "e.g., llama-3.1-sonar-large-128k-online";
        case "lmstudio":
            return "e.g., local-model";
        default:
            return "Model name";
    }
}

function getCusipApiKeyPlaceholder() {
    switch (props.form.provider) {
        case "gemini":
            return "Your Google AI API key";
        case "claude":
            return "Your Anthropic API key";
        case "openai":
            return "Your OpenAI API key";
        case "deepseek":
            return "Your DeepSeek API key";
        case "kimi":
            return "Your Moonshot AI API key";
        case "perplexity":
            return "Your Perplexity API key";
        default:
            return "API key (if required)";
    }
}

function onCusipProviderChange() {
    props.form.url = "";
    props.form.apiKey = "";
    props.form.model = "";
}

function onCusipUseMainProviderChange() {
    if (props.form.useMainProvider) {
        props.form.provider = "gemini";
        props.form.url = "";
        props.form.apiKey = "";
        props.form.model = "";
    }
}
</script>
