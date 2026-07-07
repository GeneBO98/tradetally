<template>
    <!-- Broker Commission Settings -->
    <div class="card">
        <div class="card-body">
            <h3
                class="text-lg font-medium text-gray-900 dark:text-white mb-4"
            >
                Broker Commission & Fee Settings
            </h3>
            <p
                class="text-sm text-gray-600 dark:text-gray-400 mb-6"
            >
                Configure default commission and fee rates for
                brokers that don't include this data in their CSV
                exports (e.g., Tradovate). These rates will be
                automatically applied during import.
            </p>

            <!-- Existing Broker Settings -->
            <div
                v-if="settings.length > 0"
                class="mb-6 space-y-3"
            >
                <div
                    v-for="setting in settings"
                    :key="setting.id"
                    class="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                    <div class="flex-1">
                        <div class="flex items-center space-x-2">
                            <span
                                class="text-sm font-medium text-gray-900 dark:text-white capitalize"
                                >{{ setting.broker }}</span
                            >
                            <span
                                v-if="setting.instrument"
                                class="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200 rounded"
                            >
                                {{ setting.instrument }}
                            </span>
                            <span
                                v-else
                                class="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded"
                            >
                                All Instruments
                            </span>
                            <span
                                class="text-xs text-gray-500 dark:text-gray-400"
                            >
                                Total: ${{
                                    calculateTotalFees(
                                        setting,
                                    ).toFixed(6)
                                }}/contract/side
                            </span>
                        </div>
                        <div
                            class="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-400"
                        >
                            <span
                                v-if="
                                    setting.commissionPerContract >
                                    0
                                "
                                >Commission: ${{
                                    setting.commissionPerContract
                                }}/contract</span
                            >
                            <span
                                v-if="setting.commissionPerSide > 0"
                                >Per Side: ${{
                                    setting.commissionPerSide
                                }}</span
                            >
                            <span
                                v-if="
                                    setting.exchangeFeePerContract >
                                    0
                                "
                                >Exchange: ${{
                                    setting.exchangeFeePerContract
                                }}/contract</span
                            >
                            <span
                                v-if="setting.nfaFeePerContract > 0"
                                >NFA: ${{
                                    setting.nfaFeePerContract
                                }}/contract</span
                            >
                            <span
                                v-if="
                                    setting.clearingFeePerContract >
                                    0
                                "
                                >Clearing: ${{
                                    setting.clearingFeePerContract
                                }}/contract</span
                            >
                            <span
                                v-if="
                                    setting.platformFeePerContract >
                                    0
                                "
                                >Platform: ${{
                                    setting.platformFeePerContract
                                }}/contract</span
                            >
                        </div>
                        <p
                            v-if="setting.notes"
                            class="mt-1 text-xs text-gray-500 dark:text-gray-400 italic"
                        >
                            {{ setting.notes }}
                        </p>
                    </div>
                    <div class="flex items-center space-x-2 ml-4">
                        <button
                            @click="$emit('edit', setting)"
                            class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                            title="Edit"
                            aria-label="Edit broker fee"
                        >
                            <svg
                                class="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                            </svg>
                        </button>
                        <button
                            @click="$emit('delete', setting.id)"
                            class="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            title="Delete"
                        >
                            <svg
                                class="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Add/Edit Broker Fee Form -->
            <div
                class="border-t border-gray-200 dark:border-gray-700 pt-6"
            >
                <h4
                    class="text-sm font-medium text-gray-900 dark:text-white mb-4"
                >
                    {{
                        editing
                            ? "Edit Broker Fees"
                            : "Add Broker Fees"
                    }}
                </h4>

                <form
                    @submit.prevent="$emit('submit')"
                    class="space-y-4"
                >
                    <div
                        class="grid grid-cols-1 md:grid-cols-2 gap-4"
                    >
                        <div>
                            <label for="brokerName" class="label"
                                >Broker</label
                            >
                            <BaseSelect
                                v-model="form.broker"
                                :disabled="editing"
                                :options="[
                                    { value: 'avatrade', label: 'AvaTrade' },
                                    { value: 'tradovate', label: 'Tradovate' },
                                    { value: 'ninjatrader', label: 'NinjaTrader' },
                                    { value: 'thinkorswim', label: 'ThinkorSwim' },
                                    { value: 'ibkr', label: 'Interactive Brokers' },
                                    { value: 'schwab', label: 'Charles Schwab' },
                                    { value: 'lightspeed', label: 'Lightspeed' },
                                    { value: 'webull', label: 'Webull' },
                                    { value: 'etrade', label: 'E*TRADE' },
                                    { value: 'other', label: 'Other' }
                                ]"
                                placeholder="Select a broker"
                            />
                        </div>

                        <div>
                            <label for="instrument" class="label"
                                >Instrument (optional)</label
                            >
                            <input
                                type="text"
                                id="instrument"
                                v-model="form.instrument"
                                class="input uppercase"
                                :disabled="editing"
                                placeholder="e.g., MES, NQ, ES (leave blank for all)"
                            />
                            <p
                                class="mt-1 text-xs text-gray-500 dark:text-gray-400"
                            >
                                Leave blank to set default fees for
                                all instruments with this broker
                            </p>
                        </div>

                        <div>
                            <label
                                for="commissionPerContract"
                                class="label"
                                >Commission per Contract</label
                            >
                            <div class="relative">
                                <span
                                    class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400"
                                    >$</span
                                >
                                <input
                                    type="number"
                                    id="commissionPerContract"
                                    v-model.number="
                                        form.commissionPerContract
                                    "
                                    step="0.000001"
                                    min="0"
                                    class="input pl-7"
                                />
                            </div>
                        </div>

                        <div>
                            <label for="exchangeFee" class="label"
                                >Exchange Fee per Contract</label
                            >
                            <div class="relative">
                                <span
                                    class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400"
                                    >$</span
                                >
                                <input
                                    type="number"
                                    id="exchangeFee"
                                    v-model.number="
                                        form.exchangeFeePerContract
                                    "
                                    step="0.000001"
                                    min="0"
                                    class="input pl-7"
                                />
                            </div>
                            <p
                                class="mt-1 text-xs text-gray-500 dark:text-gray-400"
                            >
                                CME, CBOT, etc.
                            </p>
                        </div>

                        <div>
                            <label for="nfaFee" class="label"
                                >NFA Fee per Contract</label
                            >
                            <div class="relative">
                                <span
                                    class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400"
                                    >$</span
                                >
                                <input
                                    type="number"
                                    id="nfaFee"
                                    v-model.number="
                                        form.nfaFeePerContract
                                    "
                                    step="0.000001"
                                    min="0"
                                    class="input pl-7"
                                />
                            </div>
                            <p
                                class="mt-1 text-xs text-gray-500 dark:text-gray-400"
                            >
                                Typically $0.02/contract
                            </p>
                        </div>

                        <div>
                            <label for="clearingFee" class="label"
                                >Clearing Fee per Contract</label
                            >
                            <div class="relative">
                                <span
                                    class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400"
                                    >$</span
                                >
                                <input
                                    type="number"
                                    id="clearingFee"
                                    v-model.number="
                                        form.clearingFeePerContract
                                    "
                                    step="0.000001"
                                    min="0"
                                    class="input pl-7"
                                />
                            </div>
                        </div>

                        <div>
                            <label for="platformFee" class="label"
                                >Platform Fee per Contract</label
                            >
                            <div class="relative">
                                <span
                                    class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400"
                                    >$</span
                                >
                                <input
                                    type="number"
                                    id="platformFee"
                                    v-model.number="
                                        form.platformFeePerContract
                                    "
                                    step="0.000001"
                                    min="0"
                                    class="input pl-7"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label for="feeNotes" class="label"
                            >Notes (optional)</label
                        >
                        <input
                            type="text"
                            id="feeNotes"
                            v-model="form.notes"
                            class="input"
                            placeholder="e.g., Micro E-mini rates, updated Jan 2025"
                        />
                    </div>

                    <!-- Total Preview -->
                    <div
                        class="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-md"
                    >
                        <div
                            class="flex justify-between items-center"
                        >
                            <span
                                class="text-sm text-primary-800 dark:text-primary-200"
                                >Total fees per contract per
                                side:</span
                            >
                            <span
                                class="text-lg font-bold text-primary-900 dark:text-primary-100"
                            >
                                ${{
                                    calculateTotalFees(
                                        form,
                                    ).toFixed(6)
                                }}
                            </span>
                        </div>
                        <p
                            class="text-xs text-primary-700 dark:text-primary-300 mt-1"
                        >
                            For a round-trip trade, total fees = ${{
                                (
                                    calculateTotalFees(
                                        form,
                                    ) * 2
                                ).toFixed(6)
                            }}
                            per contract
                        </p>
                    </div>

                    <div class="flex justify-end space-x-3">
                        <button
                            v-if="editing"
                            type="button"
                            @click="$emit('cancel-edit')"
                            class="btn-secondary"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            :disabled="
                                !form.broker ||
                                loading
                            "
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
                                >{{
                                    editing
                                        ? "Update"
                                        : "Add"
                                }}
                                Broker Fees</span
                            >
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</template>

<script setup>
import BaseSelect from "@/components/common/BaseSelect.vue";

defineProps({
    settings: { type: Array, default: () => [] },
    form: { type: Object, required: true },
    loading: { type: Boolean, default: false },
    editing: { default: null },
});

defineEmits(["submit", "edit", "delete", "cancel-edit"]);

function calculateTotalFees(setting) {
    return (
        (parseFloat(setting.commissionPerContract) || 0) +
        (parseFloat(setting.commissionPerSide) || 0) +
        (parseFloat(setting.exchangeFeePerContract) || 0) +
        (parseFloat(setting.nfaFeePerContract) || 0) +
        (parseFloat(setting.clearingFeePerContract) || 0) +
        (parseFloat(setting.platformFeePerContract) || 0)
    );
}
</script>
