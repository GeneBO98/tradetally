<template>
    <div class="content-wrapper py-8">
        <div class="mb-8">
            <h1 class="heading-page">Billing & Subscription</h1>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Manage your subscription and billing details.
            </p>
        </div>

        <!-- Billing Not Available -->
        <div v-if="!billingStatus.billing_available" class="card">
            <div class="card-body text-center">
                <div class="text-gray-500 dark:text-gray-400 mb-4">
                    <svg
                        class="w-16 h-16 mx-auto"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                </div>
                <h3
                    class="text-lg font-medium text-gray-900 dark:text-white mb-2"
                >
                    Self-Hosted Instance
                </h3>
                <p class="text-gray-600 dark:text-gray-400">
                    This is a self-hosted instance of TradeTally. Billing and
                    subscriptions are not applicable.
                </p>
            </div>
        </div>

        <!-- Loading State -->
        <div v-else-if="loading" class="card">
            <div class="card-body text-center py-12">
                <div
                    class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"
                ></div>
                <p class="mt-4 text-gray-600 dark:text-gray-400">
                    Loading subscription details...
                </p>
            </div>
        </div>

        <!-- Billing Content -->
        <div v-else class="space-y-8">
            <!-- Current Subscription -->
            <div class="card">
                <div class="card-body">
                    <div class="flex items-center justify-between mb-6">
                        <h3 class="heading-card">Current Plan</h3>
                        <span
                            v-if="subscription.subscription"
                            :class="
                                getStatusBadgeClass(
                                    subscription.subscription.status,
                                )
                            "
                            class="px-3 py-1 rounded-full text-sm font-medium"
                        >
                            {{ formatStatus(subscription.subscription.status) }}
                        </span>
                    </div>

                    <div
                        v-if="subscription.subscription"
                        class="grid grid-cols-1 md:grid-cols-2 gap-6"
                    >
                        <div>
                            <h4
                                class="text-sm font-medium text-gray-900 dark:text-white mb-2"
                            >
                                Plan Details
                            </h4>
                            <div
                                class="space-y-2 text-sm text-gray-600 dark:text-gray-400"
                            >
                                <div class="flex justify-between">
                                    <span>Plan:</span>
                                    <span class="font-medium">{{
                                        subscription.subscription.plan_name ||
                                        "Pro Plan"
                                    }}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>Price:</span>
                                    <span class="font-medium"
                                        >${{ getSubscriptionPrice() }}/{{
                                            getSubscriptionInterval()
                                        }}</span
                                    >
                                </div>
                            </div>
                        </div>

                        <div>
                            <h4
                                class="text-sm font-medium text-gray-900 dark:text-white mb-2"
                            >
                                Billing Cycle
                            </h4>
                            <div
                                class="space-y-2 text-sm text-gray-600 dark:text-gray-400"
                            >
                                <div class="flex justify-between">
                                    <span>Current Period:</span>
                                    <span class="font-medium">{{
                                        formatDate(
                                            subscription.subscription
                                                .current_period_start,
                                        )
                                    }}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>Next Billing:</span>
                                    <span class="font-medium">{{
                                        formatDate(
                                            subscription.subscription
                                                .current_period_end,
                                        )
                                    }}</span>
                                </div>
                                <div
                                    v-if="
                                        subscription.subscription
                                            .cancel_at_period_end
                                    "
                                    class="flex justify-between"
                                >
                                    <span>Cancels On:</span>
                                    <span class="font-medium text-red-600">{{
                                        formatDate(
                                            subscription.subscription
                                                .current_period_end,
                                        )
                                    }}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- No Subscription -->
                    <div v-else class="text-center py-8">
                        <div class="text-gray-500 dark:text-gray-400 mb-4">
                            <svg
                                class="w-12 h-12 mx-auto"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                                />
                            </svg>
                        </div>
                        <h4
                            class="text-lg font-medium text-gray-900 dark:text-white mb-2"
                        >
                            No Active Subscription
                        </h4>
                        <p class="text-gray-600 dark:text-gray-400 mb-4">
                            You're currently on the
                            {{ subscription.tier.tier_name }} tier.
                        </p>
                        <router-link to="/pricing" class="btn btn-primary">
                            View Plans
                        </router-link>
                    </div>
                </div>
            </div>

            <!-- Actions -->
            <div v-if="subscription.subscription" class="card">
                <div class="card-body">
                    <h3
                        class="text-lg font-medium text-gray-900 dark:text-white mb-6"
                    >
                        Manage Subscription
                    </h3>

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <button
                            @click="openCustomerPortal"
                            :disabled="portalLoading"
                            class="btn btn-secondary"
                        >
                            <span
                                v-if="portalLoading"
                                class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"
                            ></span>
                            Customer Portal
                        </button>

                        <router-link to="/pricing" class="btn btn-secondary text-center">
                            Change Plan
                        </router-link>

                        <button
                            v-if="subscription.subscription && !subscription.subscription.cancel_at_period_end && (subscription.subscription.status === 'active' || subscription.subscription.status === 'trialing')"
                            @click="showCancelModal = true"
                            class="btn btn-secondary border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                        >
                            Cancel Subscription
                        </button>

                        <button
                            v-if="subscription.subscription && subscription.subscription.cancel_at_period_end"
                            @click="reactivateSubscription"
                            :disabled="reactivateLoading"
                            class="btn btn-primary"
                        >
                            <span
                                v-if="reactivateLoading"
                                class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"
                            ></span>
                            Reactivate Subscription
                        </button>
                    </div>

                    <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">
                        Use the customer portal to update payment methods,
                        download invoices, and view billing history.
                    </p>
                </div>
            </div>

            <!-- Billing Error -->
            <div
                v-if="billingError"
                class="card border-red-200 bg-red-50 dark:bg-red-900/20"
            >
                <div class="card-body">
                    <p class="text-sm font-medium text-red-800 dark:text-red-200">{{ billingError }}</p>
                </div>
            </div>

            <!-- Checkout Verifying -->
            <div
                v-if="checkoutVerifying"
                class="card border-primary-200 bg-primary-50 dark:bg-primary-900/20"
            >
                <div class="card-body">
                    <div class="flex items-center">
                        <div class="animate-spin rounded-full h-6 w-6 border-2 border-primary-200 border-t-primary-600 mr-3"></div>
                        <p class="text-primary-800 dark:text-primary-200 font-medium">
                            Verifying your payment...
                        </p>
                    </div>
                </div>
            </div>

            <!-- Checkout Error -->
            <div
                v-if="checkoutError"
                class="card border-amber-200 bg-amber-50 dark:bg-amber-900/20"
            >
                <div class="card-body">
                    <div class="flex items-start">
                        <svg class="w-6 h-6 text-amber-500 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        <div>
                            <h4 class="text-sm font-medium text-amber-800 dark:text-amber-200">
                                Payment Verification
                            </h4>
                            <p class="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                {{ checkoutError }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Success Message -->
            <div
                v-if="checkoutSuccess"
                class="card border-green-200 bg-green-50 dark:bg-green-900/20"
            >
                <div class="card-body">
                    <div class="flex items-center">
                        <div class="text-green-500 mr-3">
                            <svg
                                class="w-6 h-6"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>
                        <div>
                            <h4
                                class="text-lg font-medium text-green-800 dark:text-green-200"
                            >
                                Subscription Activated!
                            </h4>
                            <p class="text-green-700 dark:text-green-300">
                                Your subscription has been successfully
                                activated. Welcome to TradeTally Pro!
                            </p>
                            <p
                                v-if="redirectMessage"
                                class="text-green-700 dark:text-green-300 mt-2"
                            >
                                {{ redirectMessage }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Cancel Confirmation Modal -->
        <div
            v-if="showCancelModal"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            @click.self="closeCancelModal"
        >
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Cancel Subscription
                </h3>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Are you sure you want to cancel your subscription? You will
                    continue to have access to Pro features until the end of your
                    current billing period on
                    <strong>{{
                        formatDate(
                            subscription.subscription?.current_period_end,
                        )
                    }}</strong>.
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-500 mb-6">
                    You can reactivate at any time before the billing period ends.
                </p>
                <div class="mb-6">
                    <label class="block text-sm font-medium text-gray-900 dark:text-white mb-3">
                        What is the main reason you are canceling?
                    </label>
                    <div class="space-y-2">
                        <label
                            v-for="option in cancellationReasonOptions"
                            :key="option.value"
                            class="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 cursor-pointer"
                        >
                            <input
                                v-model="cancelReason"
                                :value="option.value"
                                type="radio"
                                class="mt-1"
                            />
                            <span class="text-sm text-gray-700 dark:text-gray-300">
                                {{ option.label }}
                            </span>
                        </label>
                    </div>
                </div>
                <div class="mb-6">
                    <label
                        for="cancel-feedback"
                        class="block text-sm font-medium text-gray-900 dark:text-white mb-2"
                    >
                        Anything else you want to share? Optional
                    </label>
                    <textarea
                        id="cancel-feedback"
                        v-model="cancelFeedback"
                        rows="4"
                        maxlength="2000"
                        class="input w-full"
                        placeholder="What was missing, frustrating, or not worth the cost?"
                    ></textarea>
                </div>
                <div class="flex justify-end space-x-3">
                    <button
                        @click="closeCancelModal"
                        class="btn btn-secondary"
                    >
                        Keep Subscription
                    </button>
                    <button
                        @click="cancelSubscription"
                        :disabled="cancelLoading || !cancelReason"
                        class="btn bg-red-600 text-white hover:bg-red-700"
                    >
                        <span
                            v-if="cancelLoading"
                            class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"
                        ></span>
                        Confirm Cancellation
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import api from "@/services/api";

const cancellationReasonOptions = [
    { value: "too_expensive", label: "Too expensive" },
    { value: "not_using_enough", label: "I am not using it enough" },
    { value: "missing_features", label: "Missing features I need" },
    { value: "bugs_or_reliability", label: "Bugs, reliability, or performance issues" },
    { value: "switching_tools", label: "Switching to another tool" },
    { value: "temporary_break", label: "Temporary break from trading" },
    { value: "other", label: "Other" },
    { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export default {
    name: "BillingView",
    setup() {
        const route = useRoute();
        const router = useRouter();
        const loading = ref(true);
        const portalLoading = ref(false);
        const cancelLoading = ref(false);
        const reactivateLoading = ref(false);
        const showCancelModal = ref(false);
        const cancelReason = ref("");
        const cancelFeedback = ref("");
        const billingStatus = ref({
            billing_enabled: false,
            billing_available: false,
        });
        const subscription = ref({
            subscription: null,
            tier: { tier_name: "free" },
        });
        const checkoutSuccess = ref(false);
        const checkoutError = ref("");
        const checkoutVerifying = ref(false);
        const redirectMessage = ref("");
        const billingError = ref("");

        const loadBillingStatus = async () => {
            try {
                const response = await api.get("/billing/status");
                billingStatus.value = response.data.data;
            } catch (error) {
                console.error("Error loading billing status:", error);
            }
        };

        const loadSubscription = async () => {
            if (!billingStatus.value.billing_available) {
                loading.value = false;
                return;
            }

            try {
                const response = await api.get("/billing/subscription");
                subscription.value = response.data.data;
            } catch (error) {
                console.error("Error loading subscription:", error);
                if (error.response?.data?.error === "billing_unavailable") {
                    billingStatus.value.billing_available = false;
                }
            } finally {
                loading.value = false;
            }
        };

        const openCustomerPortal = async () => {
            portalLoading.value = true;
            try {
                const response = await api.post("/billing/portal");
                window.location.href = response.data.data.portal_url;
            } catch (error) {
                console.error("Error opening customer portal:", error);
                billingError.value = "Failed to open customer portal. Please try again.";
                setTimeout(() => { billingError.value = ""; }, 8000);
            } finally {
                portalLoading.value = false;
            }
        };

        const closeCancelModal = () => {
            showCancelModal.value = false;
            cancelReason.value = "";
            cancelFeedback.value = "";
        };

        const cancelSubscription = async () => {
            if (!cancelReason.value) return;

            cancelLoading.value = true;
            try {
                await api.post("/billing/cancel", {
                    cancellationReason: cancelReason.value,
                    feedbackText: cancelFeedback.value,
                });
                closeCancelModal();
                // Reload subscription to reflect cancellation state
                await loadSubscription();
            } catch (error) {
                console.error("Error canceling subscription:", error);
                billingError.value = error.response?.data?.message || "Failed to cancel subscription. Please try again.";
                setTimeout(() => { billingError.value = ""; }, 8000);
            } finally {
                cancelLoading.value = false;
            }
        };

        const reactivateSubscription = async () => {
            reactivateLoading.value = true;
            try {
                await api.post("/billing/reactivate");
                // Reload subscription to reflect reactivation
                await loadSubscription();
            } catch (error) {
                console.error("Error reactivating subscription:", error);
                billingError.value = error.response?.data?.message || "Failed to reactivate subscription. Please try again.";
                setTimeout(() => { billingError.value = ""; }, 8000);
            } finally {
                reactivateLoading.value = false;
            }
        };

        const checkCheckoutSuccess = async () => {
            const sessionId = route.query.session_id;
            const redirectUrl = route.query.redirect;

            if (sessionId) {
                checkoutVerifying.value = true;
                try {
                    const response = await api.get(
                        `/billing/checkout/${sessionId}`,
                    );
                    if (response.data.data.status === "complete") {
                        checkoutSuccess.value = true;
                        // Reload subscription data
                        await loadSubscription();

                        // If there's a redirect URL, navigate to it after a short delay
                        if (redirectUrl) {
                            redirectMessage.value =
                                "Redirecting you back to your requested page...";
                            setTimeout(() => {
                                router.push(redirectUrl);
                            }, 2000);
                        }
                    } else {
                        checkoutError.value =
                            "Your payment is still being processed. Please refresh in a moment.";
                    }
                } catch (error) {
                    console.error("Error checking checkout session:", error);
                    checkoutError.value =
                        "Unable to verify your payment. If you were charged, your subscription will activate shortly. Please refresh the page.";
                } finally {
                    checkoutVerifying.value = false;
                }
            }
        };

        const getStatusBadgeClass = (status) => {
            const classes = {
                active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                trialing:
                    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
                past_due:
                    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
                canceled:
                    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
                unpaid: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
            };
            return (
                classes[status] ||
                "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
            );
        };

        const formatStatus = (status) => {
            const formatted = {
                active: "Active",
                trialing: "Trial",
                past_due: "Past Due",
                canceled: "Canceled",
                unpaid: "Unpaid",
            };
            return formatted[status] || status;
        };

        const formatDate = (dateString) => {
            if (!dateString) return "N/A";
            return new Date(dateString).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
            });
        };

        const getSubscriptionPrice = () => {
            if (
                !subscription.value.subscription ||
                !subscription.value.subscription.items
            )
                return "0";
            const firstItem = subscription.value.subscription.items[0];
            if (!firstItem || !firstItem.amount) return "0";
            return (firstItem.amount / 100).toFixed(0); // Convert from cents to dollars
        };

        const getSubscriptionInterval = () => {
            if (
                !subscription.value.subscription ||
                !subscription.value.subscription.items
            )
                return "month";
            const firstItem = subscription.value.subscription.items[0];
            return firstItem?.interval || "month";
        };

        onMounted(async () => {
            await loadBillingStatus();
            await loadSubscription();
            await checkCheckoutSuccess();
        });

        return {
            loading,
            portalLoading,
            cancelLoading,
            reactivateLoading,
            showCancelModal,
            cancelReason,
            cancelFeedback,
            cancellationReasonOptions,
            billingStatus,
            subscription,
            checkoutSuccess,
            checkoutError,
            checkoutVerifying,
            redirectMessage,
            billingError,
            openCustomerPortal,
            closeCancelModal,
            cancelSubscription,
            reactivateSubscription,
            getStatusBadgeClass,
            formatStatus,
            formatDate,
            getSubscriptionPrice,
            getSubscriptionInterval,
        };
    },
};
</script>
