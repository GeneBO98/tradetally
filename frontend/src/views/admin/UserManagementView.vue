<template>
    <div class="content-wrapper py-8">
        <!-- Page Header + Stats -->
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
            <div>
                <h1 class="heading-page">User Management</h1>
                <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {{ statistics.totalUsers || totalUsers }} total users &middot; {{ activeUserCount }} active &middot; {{ pendingApprovalCount }} pending &middot; {{ proUserCount }} pro
                </p>
            </div>
            <div class="flex flex-wrap gap-2">
                <button @click="applyFilters" class="btn-primary">Apply Filters</button>
                <button @click="resetFilters" class="btn-secondary">Reset</button>
                <button
                    @click="exportUsersToCSV"
                    :disabled="loading || users.length === 0"
                    class="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Export CSV
                </button>
            </div>
        </div>

        <!-- Loading (initial only) -->
        <div v-if="initialLoading" class="flex justify-center py-12">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>

        <!-- Error -->
        <div v-else-if="error && !users.length" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
            <p class="text-sm text-red-800 dark:text-red-400">{{ error }}</p>
        </div>

        <template v-else>
            <!-- Subtle refresh indicator -->
            <div v-if="loading" class="flex justify-end mb-2">
                <div class="flex items-center space-x-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
                    <div class="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent"></div>
                    <span class="text-xs text-gray-600 dark:text-gray-400">Updating...</span>
                </div>
            </div>

            <!-- Filters & Table Card -->
            <div class="card">
                <!-- Filters -->
                <div class="border-b border-gray-200 dark:border-gray-700 px-4 py-3 sm:px-6">
                    <div class="grid gap-3 items-end grid-cols-2 md:grid-cols-3 xl:grid-cols-7">
                        <div class="col-span-2 md:col-span-3 xl:col-span-1">
                            <label class="label">Search</label>
                            <div class="relative">
                                <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <input
                                    v-model="searchQuery"
                                    @input="handleSearch"
                                    type="text"
                                    placeholder="Name, email..."
                                    class="input pl-9 pr-8"
                                />
                                <button
                                    v-if="searchQuery"
                                    @click="clearSearch"
                                    class="absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                >
                                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div>
                            <label class="label">Role</label>
                            <select v-model="filters.role" class="input">
                                <option value="all">All roles</option>
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                                <option value="owner">Owner</option>
                            </select>
                        </div>
                        <div>
                            <label class="label">Status</label>
                            <select v-model="filters.status" class="input">
                                <option value="all">All statuses</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                                <option value="pending_approval">Pending</option>
                                <option value="unverified">Unverified</option>
                            </select>
                        </div>
                        <div>
                            <label class="label">Tier</label>
                            <select v-model="filters.tier" class="input">
                                <option value="all">All tiers</option>
                                <option value="free">Free</option>
                                <option value="pro">Pro</option>
                                <option value="trial">Trial</option>
                            </select>
                        </div>
                        <div>
                            <label class="label">Marketing</label>
                            <select v-model="filters.marketing" class="input">
                                <option value="all">All</option>
                                <option value="subscribed">Subscribed</option>
                                <option value="unsubscribed">Unsubscribed</option>
                            </select>
                        </div>
                        <div>
                            <label class="label">Joined From</label>
                            <input v-model="filters.joinedFrom" type="date" class="input" />
                        </div>
                        <div>
                            <label class="label">Joined To</label>
                            <input v-model="filters.joinedTo" type="date" class="input" />
                        </div>
                    </div>
                </div>

                <!-- Result Summary Bar -->
                <div class="border-b border-gray-200 dark:border-gray-700 px-4 py-2 sm:px-6">
                    <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span>Showing {{ startIndex }}-{{ endIndex }} of {{ totalUsers }}<span v-if="activeFiltersCount > 0"> ({{ activeFiltersCount }} filter{{ activeFiltersCount === 1 ? "" : "s" }})</span></span>
                        <span>{{ formatNumber(pageTradeCount) }} trades &middot; {{ formatNumber(pageImportCount) }} imports &middot; {{ recentlyActiveCount }} active this week</span>
                    </div>
                </div>

                <!-- Table -->
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">User</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Role / Tier</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Last Active</th>
                                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Imports</th>
                                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Trades</th>
                                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                            <tr
                                v-for="user in users"
                                :key="user.id"
                                class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                            >
                                <!-- User -->
                                <td class="px-4 py-3 whitespace-nowrap">
                                    <div class="flex items-center gap-3">
                                        <div class="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-primary-600">
                                            <img v-if="user.avatar_url" class="h-full w-full object-cover" :src="user.avatar_url" :alt="user.username" />
                                            <div v-else class="flex h-full w-full items-center justify-center text-xs font-semibold uppercase text-white">
                                                {{ user.username?.charAt(0) || "U" }}
                                            </div>
                                        </div>
                                        <div class="min-w-0">
                                            <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ user.username }}</p>
                                            <p class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ user.email }}</p>
                                        </div>
                                    </div>
                                </td>

                                <!-- Role / Tier -->
                                <td class="px-4 py-3 whitespace-nowrap">
                                    <div class="flex items-center gap-2">
                                        <select
                                            :value="user.role"
                                            @change="updateUserRole(user, $event.target.value)"
                                            :disabled="isUpdating || (user.role === 'admin' && adminCount <= 1)"
                                            class="input py-1 px-2 text-xs w-20 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <option value="user">User</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                        <span :class="getTierBadgeClass(getUserDisplayTier(user))" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium">
                                            {{ getUserDisplayTier(user) }}
                                        </span>
                                        <span v-if="user.role === 'owner'" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400">
                                            owner
                                        </span>
                                    </div>
                                </td>

                                <!-- Status -->
                                <td class="px-4 py-3">
                                    <div class="flex flex-wrap gap-1 max-w-[220px]">
                                        <span :class="user.is_active ? successPillClass : dangerPillClass" class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium">
                                            <MdiIcon :icon="user.is_active ? mdiCheckCircle : mdiCloseCircle" :size="12" />
                                            {{ user.is_active ? "Active" : "Inactive" }}
                                        </span>
                                        <span :class="user.is_verified ? successPillClass : warnPillClass" class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium">
                                            <MdiIcon :icon="user.is_verified ? mdiCheckCircle : mdiCloseCircle" :size="12" />
                                            {{ user.is_verified ? "Verified" : "Unverified" }}
                                        </span>
                                        <span :class="user.admin_approved ? successPillClass : pendingPillClass" class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium">
                                            <MdiIcon :icon="user.admin_approved ? mdiCheckCircle : mdiCloseCircle" :size="12" />
                                            {{ user.admin_approved ? "Approved" : "Pending" }}
                                        </span>
                                        <button
                                            @click="toggleMarketingConsent(user)"
                                            :disabled="isUpdating"
                                            :class="user.marketing_consent ? successPillClass : mutedPillClass"
                                            class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <MdiIcon :icon="user.marketing_consent ? mdiCheckCircle : mdiCloseCircle" :size="12" />
                                            Mktg
                                        </button>
                                    </div>
                                </td>

                                <!-- Last Active -->
                                <td class="px-4 py-3 whitespace-nowrap">
                                    <p class="text-sm text-gray-900 dark:text-white">{{ formatRelativeTime(user.last_active_at) }}</p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">Joined {{ formatDate(user.created_at) }}</p>
                                </td>

                                <!-- Imports -->
                                <td class="px-4 py-3 text-right whitespace-nowrap">
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">{{ formatNumber(user.import_count) }}</p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatNumber(user.trades_imported_count) }} rows</p>
                                </td>

                                <!-- Trades -->
                                <td class="px-4 py-3 text-right whitespace-nowrap">
                                    <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ formatNumber(user.trade_count) }}</p>
                                </td>

                                <!-- Actions -->
                                <td class="px-4 py-3 text-right whitespace-nowrap">
                                    <div class="flex justify-end gap-1">
                                        <button
                                            v-if="!user.is_verified"
                                            @click="verifyUser(user)"
                                            :disabled="isUpdating"
                                            class="px-2 py-1 rounded text-xs font-medium text-primary-700 hover:bg-primary-50 transition disabled:opacity-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
                                        >
                                            Verify
                                        </button>
                                        <button
                                            v-if="!user.admin_approved"
                                            @click="approveUser(user)"
                                            :disabled="isUpdating"
                                            class="px-2 py-1 rounded text-xs font-medium text-green-700 hover:bg-green-50 transition disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/20"
                                        >
                                            Approve
                                        </button>
                                        <button
                                            v-if="!user.admin_approved ? false : !user.is_active"
                                            @click="toggleUserStatus(user)"
                                            :disabled="isUpdating || (user.role === 'admin' && adminCount <= 1 && user.is_active)"
                                            class="px-2 py-1 rounded text-xs font-medium text-green-700 hover:bg-green-50 transition disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/20"
                                        >
                                            Activate
                                        </button>
                                        <button
                                            v-if="user.is_active && user.admin_approved"
                                            @click="toggleUserStatus(user)"
                                            :disabled="isUpdating || (user.role === 'admin' && adminCount <= 1 && user.is_active)"
                                            class="px-2 py-1 rounded text-xs font-medium text-yellow-700 hover:bg-yellow-50 transition disabled:opacity-50 dark:text-yellow-400 dark:hover:bg-yellow-900/20"
                                        >
                                            Deactivate
                                        </button>
                                        <button
                                            @click="openTierModal(user)"
                                            :disabled="isUpdating"
                                            class="px-2 py-1 rounded text-xs font-medium text-violet-700 hover:bg-violet-50 transition disabled:opacity-50 dark:text-violet-400 dark:hover:bg-violet-900/20"
                                        >
                                            Tier
                                        </button>
                                        <button
                                            @click="confirmDeleteUser(user)"
                                            :disabled="isUpdating || user.id === currentUserId || (user.role === 'admin' && adminCount <= 1)"
                                            class="px-2 py-1 rounded text-xs font-medium text-red-700 hover:bg-red-50 transition disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>

                            <tr v-if="users.length === 0">
                                <td colspan="7" class="px-4 py-12 text-center">
                                    <p class="text-base font-medium text-gray-700 dark:text-gray-200">No users match the current filters.</p>
                                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Reset the filter set or broaden the date range.</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Pagination -->
                <div class="flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div class="text-sm text-gray-600 dark:text-gray-300">Page {{ currentPage }} of {{ totalPages }}</div>
                    <div class="flex items-center gap-1">
                        <button
                            @click="prevPage"
                            :disabled="currentPage === 1"
                            class="btn-secondary py-1.5 px-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Prev
                        </button>
                        <button
                            v-for="page in visiblePages"
                            :key="page.value"
                            @click="page.type === 'page' ? goToPage(page.value) : null"
                            :disabled="page.type === 'ellipsis'"
                            :class="pageClass(page)"
                            class="min-w-[2.25rem] rounded-md px-2.5 py-1.5 text-sm font-medium transition disabled:cursor-default"
                        >
                            {{ page.display }}
                        </button>
                        <button
                            @click="nextPage"
                            :disabled="currentPage === totalPages"
                            class="btn-secondary py-1.5 px-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </template>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 px-4">
        <div class="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
            </div>
            <h3 class="mt-3 text-lg font-semibold text-gray-900 dark:text-white">Delete {{ userToDelete?.username }}?</h3>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                This permanently removes the user and their related data. The action cannot be undone.
            </p>
            <div class="mt-5 flex justify-end gap-3">
                <button @click="showDeleteConfirm = false" class="btn-secondary">Cancel</button>
                <button @click="deleteUser" :disabled="isUpdating" class="btn-danger disabled:opacity-50 disabled:cursor-not-allowed">
                    {{ isUpdating ? "Deleting..." : "Delete User" }}
                </button>
            </div>
        </div>
    </div>

    <!-- Tier Modal -->
    <div v-if="showTierModal" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 px-4 py-8">
        <div class="w-full max-w-2xl rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div class="flex items-start justify-between gap-4">
                <div>
                    <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tier Controls</p>
                    <h3 class="mt-1 text-xl font-semibold text-gray-900 dark:text-white">Manage {{ selectedUser?.username }}</h3>
                </div>
                <button @click="closeTierModal" class="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div v-if="tierInfo" class="mt-5 space-y-4">
                <!-- Tier Info Cards -->
                <div class="grid gap-3 md:grid-cols-3">
                    <div class="rounded-md bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 p-3">
                        <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current Tier</p>
                        <div class="mt-2 flex items-center gap-2">
                            <span :class="getTierBadgeClass(tierInfo.tier)" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium">
                                {{ tierInfo.tier }}
                            </span>
                            <span v-if="tierInfo.override" class="text-xs font-medium text-amber-600 dark:text-amber-400">Override active</span>
                        </div>
                    </div>

                    <div v-if="tierInfo.subscription && tierInfo.subscription.status === 'active'" class="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 p-3">
                        <p class="text-xs font-medium text-green-700 dark:text-green-300 uppercase tracking-wider">Subscription</p>
                        <p class="mt-2 text-sm font-medium text-green-800 dark:text-green-200">Active</p>
                        <p class="mt-0.5 text-xs text-green-700 dark:text-green-300">Renews {{ formatDate(tierInfo.subscription.current_period_end) }}</p>
                    </div>

                    <div v-if="selectedUser && (selectedUser.role === 'admin' || selectedUser.role === 'owner')" class="rounded-md bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 p-3">
                        <p class="text-xs font-medium text-primary-700 dark:text-primary-300 uppercase tracking-wider">Role Bonus</p>
                        <p class="mt-2 text-sm font-medium text-primary-800 dark:text-primary-200">Admins keep Pro by default</p>
                    </div>
                </div>

                <!-- Override Info -->
                <div v-if="tierInfo.override" class="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3">
                    <p class="text-sm font-medium text-amber-800 dark:text-amber-200">
                        Override: {{ tierInfo.override.tier }}
                        <span v-if="tierInfo.override.expires_at"> until {{ formatDate(tierInfo.override.expires_at) }}</span>
                    </p>
                    <p v-if="tierInfo.override.reason" class="mt-0.5 text-xs text-amber-700 dark:text-amber-300">Reason: {{ tierInfo.override.reason }}</p>
                    <p v-if="tierInfo.override.created_by_username" class="mt-0.5 text-xs text-amber-700 dark:text-amber-300">Set by: {{ tierInfo.override.created_by_username }}</p>
                </div>

                <!-- Override Controls -->
                <div class="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div class="card card-body">
                        <p class="text-sm font-semibold text-gray-900 dark:text-white">Set tier override</p>
                        <div class="mt-3 space-y-3">
                            <select v-model="overrideTier" class="input">
                                <option value="free">Free</option>
                                <option value="pro">Pro</option>
                            </select>
                            <input v-model="overrideExpiry" type="date" class="input" />
                            <input v-model="overrideReason" type="text" placeholder="Reason for override" class="input" />
                            <button @click="setTierOverride" :disabled="isUpdating" class="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
                                Set Override
                            </button>
                        </div>
                    </div>

                    <div class="space-y-3">
                        <div class="card card-body">
                            <p class="text-sm font-semibold text-gray-900 dark:text-white">Trial access</p>
                            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Grant a 14-day Pro trial with a dated override.</p>
                            <button @click="grant14DayTrial" :disabled="isUpdating" class="btn-primary mt-3 w-full disabled:opacity-50 disabled:cursor-not-allowed">
                                Grant Trial
                            </button>
                        </div>

                        <div v-if="tierInfo.override" class="rounded-lg border border-red-200 dark:border-red-700 p-4">
                            <p class="text-sm font-semibold text-gray-900 dark:text-white">Remove override</p>
                            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Revert the user to their base tier rules.</p>
                            <button @click="removeTierOverride" :disabled="isUpdating" class="btn-danger mt-3 w-full disabled:opacity-50 disabled:cursor-not-allowed">
                                Remove Override
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import api from "@/services/api";
import { useNotification } from "@/composables/useNotification";
import { useAuthStore } from "@/stores/auth";
import MdiIcon from "@/components/MdiIcon.vue";
import { mdiCheckCircle, mdiCloseCircle } from "@mdi/js";

const { showError, showSuccess } = useNotification();
const authStore = useAuthStore();

const users = ref([]);
const loading = ref(true);
const initialLoading = ref(true);
const error = ref(null);
const isUpdating = ref(false);
const showDeleteConfirm = ref(false);
const userToDelete = ref(null);

const showTierModal = ref(false);
const selectedUser = ref(null);
const tierInfo = ref(null);
const overrideTier = ref("pro");
const overrideExpiry = ref("");
const overrideReason = ref("");

const currentPage = ref(1);
const totalPages = ref(1);
const totalUsers = ref(0);
const usersPerPage = ref(25);
const searchQuery = ref("");
const searchTimeout = ref(null);

const filters = ref({
    role: "all",
    status: "all",
    marketing: "all",
    tier: "all",
    joinedFrom: "",
    joinedTo: "",
});

const statistics = ref({
    totalUsers: 0,
    adminUsers: 0,
    activeUsers: 0,
    pendingApproval: 0,
    unverified: 0,
    proUsers: 0,
});

const successPillClass =
    "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
const dangerPillClass =
    "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
const warnPillClass =
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
const pendingPillClass =
    "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400";
const mutedPillClass =
    "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";

const currentUserId = computed(() => authStore.user?.id);
const adminCount = computed(() => statistics.value.adminUsers || 0);
const activeUserCount = computed(() => statistics.value.activeUsers || 0);
const pendingApprovalCount = computed(() => statistics.value.pendingApproval || 0);
const unverifiedCount = computed(() => statistics.value.unverified || 0);
const proUserCount = computed(() => statistics.value.proUsers || 0);

const activeFiltersCount = computed(() =>
    [
        searchQuery.value.trim(),
        filters.value.role !== "all" ? filters.value.role : "",
        filters.value.status !== "all" ? filters.value.status : "",
        filters.value.marketing !== "all" ? filters.value.marketing : "",
        filters.value.tier !== "all" ? filters.value.tier : "",
        filters.value.joinedFrom,
        filters.value.joinedTo,
    ].filter(Boolean).length,
);

const startIndex = computed(() => {
    if (totalUsers.value === 0) return 0;
    return (currentPage.value - 1) * usersPerPage.value + 1;
});

const endIndex = computed(() => {
    if (totalUsers.value === 0) return 0;
    return Math.min(startIndex.value + users.value.length - 1, totalUsers.value);
});

const pageTradeCount = computed(() =>
    users.value.reduce((sum, user) => sum + Number(user.trade_count || 0), 0),
);
const pageImportCount = computed(() =>
    users.value.reduce((sum, user) => sum + Number(user.import_count || 0), 0),
);
const pageImportedTradeCount = computed(() =>
    users.value.reduce(
        (sum, user) => sum + Number(user.trades_imported_count || 0),
        0,
    ),
);
const recentlyActiveCount = computed(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return users.value.filter((user) => {
        if (!user.last_active_at) return false;
        const ts = new Date(user.last_active_at).getTime();
        return Number.isFinite(ts) && ts >= cutoff;
    }).length;
});

const visiblePages = computed(() => {
    const pages = [];
    const delta = 2;
    const range = [];

    for (
        let page = Math.max(2, currentPage.value - delta);
        page <= Math.min(totalPages.value - 1, currentPage.value + delta);
        page++
    ) {
        range.push(page);
    }

    if (currentPage.value - delta > 2) range.unshift("...");
    if (currentPage.value + delta < totalPages.value - 1) range.push("...");

    if (totalPages.value >= 1) range.unshift(1);
    if (totalPages.value > 1) range.push(totalPages.value);

    let ellipsisIndex = 0;
    for (const item of range) {
        if (item === "...") {
            pages.push({
                type: "ellipsis",
                display: "...",
                value: `ellipsis-${ellipsisIndex++}`,
            });
        } else if (!pages.some((page) => page.value === item)) {
            pages.push({ type: "page", display: item, value: item });
        }
    }

    return pages;
});

function getUserDisplayTier(user) {
    if (user.role === "admin" || user.role === "owner") {
        return "pro";
    }

    if (user.is_trial) {
        return "trial";
    }

    return user.tier || "free";
}

function getTierBadgeClass(tier) {
    if (tier === "trial") {
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
    }

    if (tier === "pro") {
        return "bg-violet-100 text-violet-800 dark:bg-violet-900/20 dark:text-violet-400";
    }

    return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
}

function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function formatDate(dateString) {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "N/A";

    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function formatDateTime(dateString) {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "Never";

    return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatRelativeTime(dateString) {
    if (!dateString) return "Never";

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "Never";

    const deltaMs = date.getTime() - Date.now();
    const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    const minutes = Math.round(deltaMs / (1000 * 60));
    const hours = Math.round(deltaMs / (1000 * 60 * 60));
    const days = Math.round(deltaMs / (1000 * 60 * 60 * 24));

    if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
    if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
    return formatter.format(days, "day");
}

function pageClass(page) {
    if (page.type === "ellipsis") {
        return "border border-gray-300 text-gray-500 dark:border-gray-600 dark:text-gray-300";
    }

    if (page.value === currentPage.value) {
        return "border border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300 dark:border-primary-500";
    }

    return "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700";
}

async function fetchStatistics() {
    try {
        const response = await api.get("/users/admin/statistics");
        const stats = response.data;

        statistics.value = {
            totalUsers: stats.total_users || 0,
            adminUsers: stats.admin_users || 0,
            activeUsers: stats.active_users || 0,
            pendingApproval:
                (stats.total_users || 0) - (stats.approved_users || 0),
            unverified: (stats.total_users || 0) - (stats.verified_users || 0),
            proUsers: stats.pro_users || 0,
        };
    } catch (err) {
        console.error("Failed to fetch statistics:", err);
    }
}

async function fetchUsers(page = 1) {
    try {
        loading.value = true;
        error.value = null;

        const params = new URLSearchParams({
            page: String(page),
            limit: String(usersPerPage.value),
        });

        if (searchQuery.value.trim()) {
            params.append("search", searchQuery.value.trim());
        }

        Object.entries(filters.value).forEach(([key, value]) => {
            if (value && value !== "all") {
                params.append(key, value);
            }
        });

        const response = await api.get(`/users/admin/users?${params.toString()}`);

        users.value = response.data.users || [];
        totalUsers.value = response.data.total || 0;
        totalPages.value = response.data.totalPages || 1;
        currentPage.value = response.data.page || page;
        statistics.value = response.data.statistics
            ? {
                  totalUsers: response.data.statistics.total_users || 0,
                  adminUsers: response.data.statistics.admin_users || 0,
                  activeUsers: response.data.statistics.active_users || 0,
                  pendingApproval:
                      (response.data.statistics.total_users || 0) -
                      (response.data.statistics.approved_users || 0),
                  unverified:
                      (response.data.statistics.total_users || 0) -
                      (response.data.statistics.verified_users || 0),
                  proUsers: response.data.statistics.pro_users || 0,
              }
            : statistics.value;
    } catch (err) {
        error.value = err.response?.data?.error || "Failed to load users";
        showError("Error", error.value);
    } finally {
        loading.value = false;
        initialLoading.value = false;
    }
}

function handleSearch() {
    if (searchTimeout.value) {
        clearTimeout(searchTimeout.value);
    }

    searchTimeout.value = setTimeout(() => {
        fetchUsers(1);
    }, 300);
}

function clearSearch() {
    searchQuery.value = "";
    fetchUsers(1);
}

function applyFilters() {
    fetchUsers(1);
}

function resetFilters() {
    searchQuery.value = "";
    filters.value = {
        role: "all",
        status: "all",
        marketing: "all",
        tier: "all",
        joinedFrom: "",
        joinedTo: "",
    };
    fetchUsers(1);
}

function goToPage(page) {
    if (page >= 1 && page <= totalPages.value) {
        fetchUsers(page);
    }
}

function nextPage() {
    if (currentPage.value < totalPages.value) {
        fetchUsers(currentPage.value + 1);
    }
}

function prevPage() {
    if (currentPage.value > 1) {
        fetchUsers(currentPage.value - 1);
    }
}

async function refreshUsersAndStats(page = currentPage.value) {
    await fetchUsers(page);
    await fetchStatistics();
}

async function updateUserRole(user, newRole) {
    if (user.role === newRole) return;

    try {
        isUpdating.value = true;
        const response = await api.put(`/users/admin/users/${user.id}/role`, {
            role: newRole,
        });

        await refreshUsersAndStats();
        showSuccess("Success", response.data.message);
    } catch (err) {
        showError(
            "Error",
            err.response?.data?.error || "Failed to update user role",
        );
    } finally {
        isUpdating.value = false;
    }
}

async function toggleUserStatus(user) {
    try {
        isUpdating.value = true;
        const response = await api.put(`/users/admin/users/${user.id}/status`, {
            isActive: !user.is_active,
        });

        await refreshUsersAndStats();
        showSuccess("Success", response.data.message);
    } catch (err) {
        showError(
            "Error",
            err.response?.data?.error || "Failed to update user status",
        );
    } finally {
        isUpdating.value = false;
    }
}

async function toggleMarketingConsent(user) {
    try {
        isUpdating.value = true;
        const response = await api.put(
            `/users/admin/users/${user.id}/marketing-consent`,
            {
                marketingConsent: !user.marketing_consent,
            },
        );

        await refreshUsersAndStats();
        showSuccess("Success", response.data.message);
    } catch (err) {
        showError(
            "Error",
            err.response?.data?.error || "Failed to update marketing consent",
        );
    } finally {
        isUpdating.value = false;
    }
}

async function verifyUser(user) {
    try {
        isUpdating.value = true;
        const response = await api.post(`/users/admin/users/${user.id}/verify`);

        await refreshUsersAndStats();
        showSuccess("Success", response.data.message);
    } catch (err) {
        showError(
            "Error",
            err.response?.data?.error || "Failed to verify user",
        );
    } finally {
        isUpdating.value = false;
    }
}

async function approveUser(user) {
    try {
        isUpdating.value = true;
        const response = await api.post(`/users/admin/users/${user.id}/approve`);

        await refreshUsersAndStats();
        showSuccess("Success", response.data.message);
    } catch (err) {
        showError(
            "Error",
            err.response?.data?.error || "Failed to approve user",
        );
    } finally {
        isUpdating.value = false;
    }
}

function confirmDeleteUser(user) {
    userToDelete.value = user;
    showDeleteConfirm.value = true;
}

async function deleteUser() {
    if (!userToDelete.value) return;

    try {
        isUpdating.value = true;
        const response = await api.delete(
            `/users/admin/users/${userToDelete.value.id}`,
        );

        const nextPage =
            users.value.length === 1 && currentPage.value > 1
                ? currentPage.value - 1
                : currentPage.value;

        await refreshUsersAndStats(nextPage);
        showSuccess("Success", response.data.message);
        showDeleteConfirm.value = false;
        userToDelete.value = null;
    } catch (err) {
        showError(
            "Error",
            err.response?.data?.error || "Failed to delete user",
        );
    } finally {
        isUpdating.value = false;
    }
}

async function exportUsersToCSV() {
    try {
        loading.value = true;

        const params = new URLSearchParams({
            page: "1",
            limit: "10000",
        });

        if (searchQuery.value.trim()) {
            params.append("search", searchQuery.value.trim());
        }

        Object.entries(filters.value).forEach(([key, value]) => {
            if (value && value !== "all") {
                params.append(key, value);
            }
        });

        const response = await api.get(`/users/admin/users?${params.toString()}`);
        const allUsers = response.data.users || [];

        if (allUsers.length === 0) {
            showError("No Data", "No users to export");
            return;
        }

        const headers = [
            "ID",
            "Username",
            "Email",
            "Full Name",
            "Role",
            "Tier",
            "Status",
            "Verified",
            "Admin Approved",
            "Marketing Consent",
            "Join Date",
            "Last Login",
            "Last Import",
            "Last Active",
            "Trade Count",
            "Completed Imports",
            "Imported Trades",
        ];

        const rows = allUsers.map((user) => [
            user.id,
            user.username,
            user.email,
            user.full_name || "",
            user.role,
            getUserDisplayTier(user),
            user.is_active ? "Active" : "Inactive",
            user.is_verified ? "Yes" : "No",
            user.admin_approved ? "Yes" : "No",
            user.marketing_consent ? "Yes" : "No",
            user.created_at ? new Date(user.created_at).toISOString() : "",
            user.last_login_at ? new Date(user.last_login_at).toISOString() : "",
            user.last_import_at ? new Date(user.last_import_at).toISOString() : "",
            user.last_active_at ? new Date(user.last_active_at).toISOString() : "",
            user.trade_count || 0,
            user.import_count || 0,
            user.trades_imported_count || 0,
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map((row) =>
                row
                    .map((cell) => {
                        const value = String(cell ?? "");
                        if (
                            value.includes(",") ||
                            value.includes('"') ||
                            value.includes("\n")
                        ) {
                            return `"${value.replace(/"/g, '""')}"`;
                        }
                        return value;
                    })
                    .join(","),
            ),
        ].join("\n");

        const blob = new Blob([csvContent], {
            type: "text/csv;charset=utf-8;",
        });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().split("T")[0];

        link.setAttribute("href", url);
        link.setAttribute("download", `users_export_${timestamp}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showSuccess(
            "Export Complete",
            `Exported ${allUsers.length} users to CSV`,
        );
    } catch (err) {
        console.error("Export failed:", err);
        showError(
            "Export Failed",
            err.response?.data?.error || "Failed to export users",
        );
    } finally {
        loading.value = false;
    }
}

async function openTierModal(user) {
    selectedUser.value = user;
    showTierModal.value = true;
    await fetchTierInfo(user.id);
}

function closeTierModal() {
    showTierModal.value = false;
    selectedUser.value = null;
    tierInfo.value = null;
    overrideTier.value = "pro";
    overrideExpiry.value = "";
    overrideReason.value = "";
}

async function fetchTierInfo(userId) {
    try {
        const response = await api.get(`/users/admin/users/${userId}/tier`);
        tierInfo.value = response.data;
    } catch (err) {
        console.error("Failed to fetch tier info:", err);
        showError("Error", "Failed to fetch tier information");
    }
}

async function setTierOverride() {
    if (!selectedUser.value) return;

    try {
        isUpdating.value = true;
        const response = await api.post(
            `/users/admin/users/${selectedUser.value.id}/tier-override`,
            {
                tier: overrideTier.value,
                expiresAt: overrideExpiry.value || null,
                reason: overrideReason.value || null,
            },
        );

        await fetchTierInfo(selectedUser.value.id);
        await refreshUsersAndStats();
        showSuccess(
            "Success",
            response.data.message || "Tier override set successfully",
        );
    } catch (err) {
        showError(
            "Error",
            err.response?.data?.error || "Failed to set tier override",
        );
    } finally {
        isUpdating.value = false;
    }
}

async function grant14DayTrial() {
    if (!selectedUser.value) return;

    try {
        isUpdating.value = true;
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 14);

        await api.post(
            `/users/admin/users/${selectedUser.value.id}/tier-override`,
            {
                tier: "pro",
                expiresAt: trialEnd.toISOString(),
                reason: "14-day Pro trial",
            },
        );

        await fetchTierInfo(selectedUser.value.id);
        await refreshUsersAndStats();
        showSuccess("Success", "14-day Pro trial granted successfully");
    } catch (err) {
        showError(
            "Error",
            err.response?.data?.error || "Failed to grant trial",
        );
    } finally {
        isUpdating.value = false;
    }
}

async function removeTierOverride() {
    if (!selectedUser.value) return;

    try {
        isUpdating.value = true;
        const response = await api.delete(
            `/users/admin/users/${selectedUser.value.id}/tier-override`,
        );

        await fetchTierInfo(selectedUser.value.id);
        await refreshUsersAndStats();
        showSuccess(
            "Success",
            response.data.message || "Tier override removed successfully",
        );
    } catch (err) {
        showError(
            "Error",
            err.response?.data?.error || "Failed to remove tier override",
        );
    } finally {
        isUpdating.value = false;
    }
}

onMounted(async () => {
    await fetchUsers();
});
</script>
