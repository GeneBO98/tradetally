<template>
  <div class="content-wrapper py-8">
    <header class="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div class="max-w-3xl">
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <h1 class="text-3xl font-bold text-gray-950 dark:text-white">Retirement Planner</h1>
          <span
            v-if="retirementStore.hasSavedPlan"
            class="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-800 dark:bg-primary-900/30 dark:text-primary-300"
          >
            Saved plan
          </span>
        </div>
        <p class="text-base leading-7 text-gray-600 dark:text-gray-300">
          Turn your tracked portfolios, future contributions, and retirement goals into a practical
          range of outcomes.
        </p>
      </div>

      <button
        v-if="retirementStore.hasSavedPlan"
        type="button"
        class="btn-secondary shrink-0"
        :disabled="retirementStore.saving"
        @click="confirmReset"
      >
        <TrashIcon class="mr-2 h-4 w-4" />
        Reset saved plan
      </button>
    </header>

    <div v-if="initialLoading" class="flex justify-center py-16">
      <div class="text-center">
        <div class="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600"></div>
        <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">Preparing your retirement plan...</p>
      </div>
    </div>

    <div v-else class="relative">
      <div
        v-if="retirementStore.calculating || retirementStore.loading"
        class="absolute right-0 top-0 z-10 flex items-center gap-2 rounded-full border border-gray-200 bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/90"
      >
        <div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
        <span class="text-xs text-gray-600 dark:text-gray-300">Updating...</span>
      </div>

      <div
        v-if="retirementStore.error"
        role="alert"
        class="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
      >
        <div class="flex items-start gap-3">
          <ExclamationTriangleIcon class="mt-0.5 h-5 w-5 shrink-0" />
          <div class="flex-1">
            <p class="font-semibold">The retirement projection could not be updated.</p>
            <p class="mt-1">{{ retirementStore.error }}</p>
          </div>
          <button type="button" class="font-semibold underline" @click="retirementStore.clearError">
            Dismiss
          </button>
        </div>
      </div>

      <div
        v-if="!retirementStore.hasSavedPlan"
        data-testid="starter-banner"
        class="mb-6 rounded-xl border border-primary-200 bg-primary-50 p-4 dark:border-primary-800 dark:bg-primary-900/20"
      >
        <div class="flex items-start gap-3">
          <InformationCircleIcon class="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400" />
          <div>
            <p class="text-sm font-semibold text-primary-900 dark:text-primary-200">
              These are starting assumptions, not your plan yet.
            </p>
            <p class="mt-1 text-sm text-primary-800 dark:text-primary-300">
              Work down the form from your ages to your goal. The projection updates as you type.
              Save when the status on the right reflects your situation.
            </p>
          </div>
        </div>
      </div>

      <div
        v-if="isFiltered"
        class="mb-6 rounded-xl border border-primary-200 bg-primary-50 p-4 dark:border-primary-800 dark:bg-primary-900/20"
      >
        <div class="flex items-start gap-3">
          <InformationCircleIcon class="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400" />
          <div>
            <p class="text-sm font-semibold text-primary-900 dark:text-primary-200">
              Account-only preview: {{ selectedAccountLabel }}
            </p>
            <p class="mt-1 text-sm text-primary-800 dark:text-primary-300">
              The saved assumptions remain account-independent. Choose All Accounts for the canonical
              household projection.
            </p>
          </div>
        </div>
      </div>

      <section
        v-if="availableAccounts.length > 0"
        ref="accountPickerContainer"
        class="relative mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="flex items-center justify-between gap-4">
          <div class="flex min-w-0 items-center gap-3">
            <BuildingLibraryIcon class="h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400" />
            <div class="min-w-0">
              <h2 class="truncate text-sm font-semibold text-gray-950 dark:text-white">
                Accounts included in the projection
              </h2>
              <p class="truncate text-xs text-gray-500 dark:text-gray-400">
                {{ accountScopeLabel }} · this choice is not saved with the plan
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="account-picker-trigger"
            class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-primary-700 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-gray-600 dark:text-primary-300 dark:hover:bg-primary-900/20"
            :aria-expanded="accountPickerOpen"
            aria-controls="retirement-account-picker"
            @click="accountPickerOpen = !accountPickerOpen"
            @keydown.esc.stop="accountPickerOpen = false"
          >
            <AdjustmentsHorizontalIcon class="h-4 w-4" />
            Manage
          </button>
        </div>

        <div
          v-show="accountPickerOpen"
          id="retirement-account-picker"
          data-testid="account-picker"
          class="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-600 dark:bg-gray-800 sm:left-auto sm:w-[30rem]"
        >
          <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
            <div>
              <p class="text-sm font-semibold text-gray-950 dark:text-white">Choose portfolio accounts</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">Changes recalculate the entire projection.</p>
            </div>
            <button
              v-if="!isFiltered && !allAccountsIncluded"
              type="button"
              class="text-xs font-semibold text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
              @click="includeAllAccounts"
            >
              Include all
            </button>
          </div>

          <div class="max-h-72 overflow-y-auto py-1">
            <label
              v-for="account in selectableAccounts"
              :key="account.account_identifier"
              class="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <input
                :data-testid="`retirement-account-${account.account_identifier}`"
                type="checkbox"
                class="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900"
                :checked="isAccountIncluded(account.account_identifier)"
                :disabled="isFiltered || (isAccountIncluded(account.account_identifier) && includedAccountIds.length === 1)"
                @change="toggleAccount(account.account_identifier)"
              />
              <span class="min-w-0 flex-1">
                <span class="flex items-baseline justify-between gap-3">
                  <span class="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {{ accountDisplayName(account) }}
                  </span>
                  <span class="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                    {{ accountSecondaryLabel(account) }}
                  </span>
                </span>
                <span class="block truncate text-xs text-gray-500 dark:text-gray-400">
                  {{ [account.broker, ...account.sources.map(accountSourceLabel)].filter(Boolean).join(" · ") }}
                </span>
              </span>
            </label>
          </div>

          <div class="border-t border-gray-100 bg-gray-50 px-4 py-2.5 text-xs leading-5 text-gray-500 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400">
            Accounts come from investment lots and eligible open long positions. Accounts that exist
            in Settings but contain none of those records are not included.
            {{ isFiltered ? " Choose All Accounts in the global filter to customize this list." : " At least one must remain included." }}
          </div>
        </div>
      </section>

      <div class="grid gap-6 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.6fr)]">
        <form class="space-y-5" @submit.prevent>
          <section class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div class="mb-5 flex items-center gap-3">
              <StepBadge :step="1" :icon="CalendarDaysIcon" />
              <div>
                <h2 class="font-semibold text-gray-950 dark:text-white">When</h2>
                <p class="text-xs text-gray-500 dark:text-gray-400">Your age today and the age you want to stop working.</p>
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block">
                <span class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">Current age</span>
                <input v-model.number="form.current_age" class="input" type="number" min="18" max="99" required />
              </label>
              <label class="block">
                <span class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">Retirement age</span>
                <input
                  v-model.number="form.target_retirement_age"
                  class="input"
                  type="number"
                  :min="Number(form.current_age) + 1"
                  max="100"
                  required
                />
              </label>
            </div>
            <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {{ yearsToRetirement }} {{ yearsToRetirement === 1 ? "year" : "years" }} to grow the portfolio.
            </p>
          </section>

          <section class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div class="mb-5 flex items-center gap-3">
              <StepBadge :step="2" :icon="BanknotesIcon" />
              <div>
                <h2 class="font-semibold text-gray-950 dark:text-white">What you have</h2>
                <p class="text-xs text-gray-500 dark:text-gray-400">Your starting balance, tracked and untracked.</p>
              </div>
            </div>

            <div class="space-y-4">
              <div
                data-testid="tracked-portfolio"
                class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-200">Tracked in TradeTally</p>
                    <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {{ retirementStore.portfolio?.position_count || 0 }}
                      {{ (retirementStore.portfolio?.position_count || 0) === 1 ? "position" : "positions" }}
                      · {{ accountScopeLabel }}
                    </p>
                  </div>
                  <p class="shrink-0 text-xl font-bold text-gray-950 dark:text-white">
                    {{ formatCurrency(retirementStore.portfolio?.tracked_portfolio_value || 0, { compact: true }) }}
                  </p>
                </div>
                <p
                  v-if="!retirementStore.portfolio?.position_count"
                  class="mt-3 text-xs leading-5 text-gray-600 dark:text-gray-300"
                >
                  No tracked positions yet. Connect a broker or add investment lots to include them here,
                  or enter your savings below to plan without them.
                </p>
                <div
                  v-else-if="retirementStore.portfolio?.price_stale_position_count"
                  class="mt-3 flex items-center justify-between gap-3"
                >
                  <p class="text-xs font-medium text-amber-700 dark:text-amber-400">
                    {{ retirementStore.portfolio.price_stale_position_count }} quotes are still refreshing.
                  </p>
                  <button
                    type="button"
                    class="text-xs font-semibold text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
                    :disabled="retirementStore.calculating"
                    @click="recalculateNow"
                  >
                    Refresh now
                  </button>
                </div>
              </div>

              <div
                v-if="linkedSavingsAccounts.length > 0"
                data-testid="linked-savings"
                class="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
              >
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-200">Linked bank accounts</p>
                    <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Tick the ones that are retirement money. Ticked balances are added to your starting balance.</p>
                  </div>
                  <p class="shrink-0 text-xl font-bold text-gray-950 dark:text-white">
                    {{ formatCurrency(linkedSavingsTotal, { compact: true }) }}
                  </p>
                </div>
                <ul class="mt-3 space-y-1.5">
                  <li v-for="account in linkedSavingsAccounts" :key="account.id">
                    <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                      <input
                        type="checkbox"
                        class="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900"
                        :checked="account.include_in_retirement_savings"
                        :disabled="savingsAccountBusy === account.id"
                        @change="toggleSavingsAccount(account, $event.target.checked)"
                      />
                      <span class="min-w-0 flex-1 truncate">
                        {{ account.account_name }}<span v-if="account.mask"> ••••{{ account.mask }}</span>
                        <span class="text-gray-500 dark:text-gray-400"> · {{ account.account_subtype }}</span>
                      </span>
                      <span
                        class="shrink-0 font-medium"
                        :class="account.include_in_retirement_savings ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'"
                      >
                        {{ formatCurrency(account.current_balance || 0, { compact: true }) }}
                      </span>
                    </label>
                  </li>
                </ul>
              </div>

              <MoneyField
                v-model="form.additional_retirement_savings"
                label="Other retirement savings"
                :currency-symbol="currencySymbol"
                :help="linkedSavingsAccounts.length > 0
                  ? 'Anything not tracked or linked above, such as a 401(k) at another provider.'
                  : 'Retirement assets not tracked in TradeTally, such as a 401(k) or IRA held elsewhere.'"
              />

              <div
                v-if="affordability?.available && affordability.debt?.count > 0"
                data-testid="linked-debts"
                class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-900/20"
              >
                <div class="flex items-center justify-between gap-3">
                  <p class="font-semibold text-amber-900 dark:text-amber-200">
                    Debts: {{ formatCurrency(affordability.debt.total_balance, { compact: true }) }} across
                    {{ affordability.debt.count }} {{ affordability.debt.count === 1 ? "account" : "accounts" }}
                  </p>
                  <p class="shrink-0 text-amber-800 dark:text-amber-300">
                    {{ formatWholeCurrency(affordability.debt.monthly_minimum_payments) }}/mo minimums
                  </p>
                </div>
                <ul class="mt-1.5 space-y-0.5 text-amber-800 dark:text-amber-300">
                  <li v-for="item in affordability.debt.items.slice(0, 4)" :key="item.id" class="flex justify-between gap-3">
                    <span class="truncate">
                      {{ item.account_name }} · {{ liabilityLabel(item.liability_type) }}<span v-if="item.apr_percent != null"> · {{ formatPercent(item.apr_percent) }} APR</span>
                      <span v-if="item.is_overdue" class="font-semibold"> · overdue</span>
                    </span>
                    <span class="shrink-0">{{ formatCurrency(item.current_balance || 0, { compact: true }) }}</span>
                  </li>
                </ul>
                <p class="mt-1.5 text-amber-800/80 dark:text-amber-300/80">
                  Debt payments count against what you can save. Paying these off frees that amount for retirement.
                </p>
              </div>

              <div class="flex items-center justify-between border-t border-gray-200 pt-3 text-sm dark:border-gray-700">
                <span class="text-gray-600 dark:text-gray-300">Starting balance</span>
                <span data-testid="starting-balance" class="font-semibold text-gray-950 dark:text-white">
                  {{ formatCurrency(startingBalance, { compact: true }) }}
                </span>
              </div>
            </div>
          </section>

          <section class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div class="mb-5 flex items-center gap-3">
              <StepBadge :step="3" :icon="ArrowTrendingUpIcon" />
              <div>
                <h2 class="font-semibold text-gray-950 dark:text-white">What you add</h2>
                <p class="text-xs text-gray-500 dark:text-gray-400">The lever you control most directly.</p>
              </div>
            </div>

            <div class="space-y-4">
              <MoneyField
                v-model="form.monthly_contribution"
                label="Monthly contribution"
                :currency-symbol="currencySymbol"
              />
              <label class="block">
                <span class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Yearly contribution increase
                </span>
                <div class="relative">
                  <input
                    v-model.number="form.annual_contribution_increase_percent"
                    class="input pr-10"
                    type="number"
                    min="-99"
                    max="100"
                    step="0.1"
                  />
                  <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-500">%</span>
                </div>
                <span class="mt-1.5 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Raise your contribution each year, for example to match expected raises.
                </span>
              </label>

              <RetirementCashflowPanel
                :affordability="affordability"
                :transactions="retirementStore.affordabilityTransactions"
                :categories="retirementStore.affordabilityCategories"
                :loading="retirementStore.affordabilityLoading"
                :format-currency="formatCurrency"
                @apply="applySuggestion"
                @refresh="refreshAffordability"
                @categorize="categorizeTransaction"
                @open-review="loadAffordabilityTransactions"
              />
            </div>
          </section>

          <section class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div class="mb-5 flex items-center gap-3">
              <StepBadge :step="4" :icon="HomeIcon" />
              <div>
                <h2 class="font-semibold text-gray-950 dark:text-white">What you want</h2>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  Your retirement spending sets the portfolio goal.
                </p>
              </div>
            </div>

            <div class="space-y-4">
              <MoneyField
                v-model="form.desired_annual_retirement_spending"
                label="Desired yearly retirement spending"
                :currency-symbol="currencySymbol"
                help="In today's dollars. The plan adjusts it for inflation."
                required
              />

              <div
                v-if="affordability?.available && affordability.suggestions?.current_annual_cost_of_living > 0"
                data-testid="spending-suggestion"
                class="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300"
              >
                <span>
                  Your linked accounts show about
                  {{ formatCurrency(affordability.suggestions.current_annual_cost_of_living, { compact: true }) }}
                  a year in spending and debt payments.
                </span>
                <button
                  type="button"
                  class="rounded-lg border border-gray-200 bg-white px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  @click="applySuggestion({ field: 'desired_annual_retirement_spending', value: affordability.suggestions.desired_annual_retirement_spending })"
                >
                  Use {{ affordability.suggestions.retirement_spending_ratio_percent }}% of spending without debt
                  ({{ formatCurrency(affordability.suggestions.desired_annual_retirement_spending, { compact: true }) }})
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-gray-200 bg-white px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  @click="applySuggestion({ field: 'current_annual_cost_of_living', value: affordability.suggestions.current_annual_cost_of_living })"
                >
                  Set cost of living
                </button>
              </div>

              <details class="group rounded-xl border border-gray-200 dark:border-gray-700" :open="advancedGoalOpen">
                <summary
                  class="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 marker:content-none hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/40"
                  @click.prevent="advancedGoalOpen = !advancedGoalOpen"
                >
                  <span>Advanced goal options</span>
                  <ChevronDownIcon class="h-4 w-4 text-gray-500 transition-transform" :class="{ 'rotate-180': advancedGoalOpen }" />
                </summary>
                <div class="space-y-4 border-t border-gray-200 px-4 pb-4 pt-4 dark:border-gray-700">
                  <MoneyField
                    v-model="form.current_annual_cost_of_living"
                    label="Current yearly cost of living"
                    :currency-symbol="currencySymbol"
                    help="For reference only. It does not change the goal."
                  />
                  <MoneyField
                    v-model="form.target_portfolio_balance"
                    label="Minimum portfolio goal override"
                    :currency-symbol="currencySymbol"
                    :nullable="true"
                    help="Leave blank to use the spending-based goal. A value here only raises the goal; a lower value will not reduce it."
                  />
                </div>
              </details>

              <div
                v-if="projection?.goal"
                class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40"
              >
                <div class="flex items-start gap-3">
                  <CalculatorIcon class="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400" />
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-gray-900 dark:text-white">How the portfolio goal is calculated</p>
                    <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                      All values in this breakdown use today’s purchasing power.
                    </p>

                    <dl class="mt-3 space-y-2 text-xs">
                      <div class="flex items-center justify-between gap-4">
                        <dt class="text-gray-600 dark:text-gray-300">Desired yearly retirement spending</dt>
                        <dd class="font-medium text-gray-900 dark:text-white">
                          {{ formatCurrency(projection.goal.desired_annual_retirement_spending_today || 0, { compact: true }) }}
                        </dd>
                      </div>
                      <div class="flex items-center justify-between gap-4">
                        <dt class="text-gray-600 dark:text-gray-300">Less yearly retirement income once it begins</dt>
                        <dd class="font-medium text-gray-900 dark:text-white">
                          −{{ formatCurrency(projection.goal.other_annual_retirement_income_today || 0, { compact: true }) }}
                        </dd>
                      </div>
                      <div class="flex items-center justify-between gap-4 border-t border-gray-200 pt-2 dark:border-gray-700">
                        <dt class="text-gray-600 dark:text-gray-300">Yearly spending the portfolio must support</dt>
                        <dd class="font-semibold text-gray-900 dark:text-white">
                          {{ formatCurrency(projection.goal.annual_spending_gap_today || 0, { compact: true }) }}
                        </dd>
                      </div>
                      <div class="flex items-center justify-between gap-4">
                        <dt class="text-gray-600 dark:text-gray-300">
                          Portfolio needed using a {{ formatPercent(form.withdrawal_rate_percent) }} withdrawal rate
                          <button
                            type="button"
                            class="ml-1 font-semibold text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
                            @click="scrollToAssumptions"
                          >
                            Change
                          </button>
                        </dt>
                        <dd class="font-medium text-gray-900 dark:text-white">
                          {{ formatCurrency(ongoingPortfolioNeed, { compact: true }) }}
                        </dd>
                      </div>
                      <div
                        v-if="Number(projection.goal.bridge_reserve_today) > 0"
                        class="flex items-center justify-between gap-4"
                      >
                        <dt class="text-gray-600 dark:text-gray-300">
                          Income bridge before age {{ form.other_income_start_age }}
                        </dt>
                        <dd class="font-medium text-gray-900 dark:text-white">
                          +{{ formatCurrency(projection.goal.bridge_reserve_today, { compact: true }) }}
                        </dd>
                      </div>
                      <div
                        v-if="projection.goal.explicit_target_today != null"
                        class="flex items-center justify-between gap-4"
                      >
                        <dt class="text-gray-600 dark:text-gray-300">Your minimum goal override</dt>
                        <dd class="font-medium text-gray-900 dark:text-white">
                          {{ formatCurrency(projection.goal.explicit_target_today, { compact: true }) }}
                        </dd>
                      </div>
                      <div class="flex items-center justify-between gap-4 border-t border-gray-300 pt-2 dark:border-gray-600">
                        <dt class="font-semibold text-gray-900 dark:text-white">Goal used by this plan</dt>
                        <dd class="font-bold text-primary-700 dark:text-primary-300">
                          {{ formatCurrency(projection.goal.effective_target_today || 0, { compact: true }) }}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div class="mb-5 flex items-center gap-3">
              <StepBadge :step="5" :icon="BuildingLibraryIcon" />
              <div>
                <h2 class="font-semibold text-gray-950 dark:text-white">Other retirement income</h2>
                <p class="text-xs text-gray-500 dark:text-gray-400">Social Security, pension, rental, or other yearly income. Leave at zero if none.</p>
              </div>
            </div>

            <div class="space-y-4">
              <div>
                <MoneyField
                  v-model="form.other_annual_retirement_income"
                  label="Estimated yearly income"
                  :currency-symbol="currencySymbol"
                />
                <a
                  href="https://www.ssa.gov/benefits/calculators/"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="mt-1.5 inline-flex items-center text-xs font-semibold text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
                >
                  Estimate Social Security benefits
                  <ArrowTopRightOnSquareIcon class="ml-1.5 h-3.5 w-3.5" />
                </a>
              </div>
              <label class="block">
                <span class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">Income starts at age</span>
                <input
                  v-model.number="form.other_income_start_age"
                  class="input"
                  type="number"
                  min="18"
                  max="100"
                />
              </label>
            </div>
          </section>

          <section
            ref="assumptionsSection"
            class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <div class="mb-5 flex items-center gap-3">
              <StepBadge :step="6" :icon="AdjustmentsHorizontalIcon" />
              <div>
                <h2 class="font-semibold text-gray-950 dark:text-white">Assumptions</h2>
                <p class="text-xs text-gray-500 dark:text-gray-400">Starting estimates, not recommendations.</p>
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <PercentField
                v-model="form.custom_return_rate_percent"
                label="Custom yearly return"
                :min="-99"
                :max="100"
                help="Used only by the Custom assumption. Historical scenarios replace this with the portfolio’s measured return."
              />
              <PercentField
                v-model="form.inflation_rate_percent"
                label="Custom future inflation"
                :min="0"
                :max="20"
                help="Used only by the Custom assumption. Historical scenarios use U.S. CPI-U inflation from their matching period."
              />
              <PercentField
                v-model="form.withdrawal_rate_percent"
                label="Withdrawal rate"
                :min="0.1"
                :max="20"
                help="Used by every scenario to calculate the portfolio goal. It does not change investment growth."
              />
            </div>
          </section>

          <p v-if="formError" role="alert" class="text-sm font-medium text-red-600 dark:text-red-400">
            {{ formError }}
          </p>

          <div class="sticky bottom-4 z-10 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/95">
            <p
              data-testid="projection-sync-status"
              class="mb-2 flex items-center gap-2 px-1 text-xs"
              :class="projectionOutOfDate ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'"
            >
              <span
                class="h-1.5 w-1.5 shrink-0 rounded-full"
                :class="projectionOutOfDate ? 'bg-amber-500' : 'bg-green-500'"
              ></span>
              {{ projectionSyncLabel }}
            </p>
            <button
              type="button"
              class="btn-primary w-full justify-center"
              :disabled="!formIsValid || retirementStore.saving || retirementStore.calculating"
              @click="savePlan"
            >
              <BookmarkSquareIcon class="mr-2 h-4 w-4" />
              {{ retirementStore.saving ? "Saving..." : hasUnsavedChanges ? "Save plan" : "Plan saved" }}
            </button>
          </div>
        </form>

        <div class="min-w-0 space-y-6">
          <section
            ref="statusSection"
            data-testid="plan-status"
            class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 max-w-2xl">
                <h2 class="text-3xl font-bold text-gray-950 dark:text-white">
                  {{ selectedScenario?.is_on_track ? "On track" : "Needs adjustment" }}
                </h2>
              </div>
              <span
                v-if="projectionOutOfDate"
                class="inline-flex shrink-0 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
              >
                <ArrowPathIcon class="h-3.5 w-3.5" :class="{ 'animate-spin': retirementStore.calculating }" />
                Updating to match your inputs
              </span>
            </div>

            <div class="mt-6" data-testid="goal-bar">
              <div class="relative h-3 rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  class="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                  :class="selectedScenario?.is_on_track ? 'bg-green-500' : 'bg-amber-500'"
                  :style="{ width: `${goalBar.balance_percent}%` }"
                ></div>
                <div
                  class="absolute -inset-y-1.5 w-0.5 bg-gray-900 dark:bg-white"
                  :style="{ left: `calc(${goalBar.goal_percent}% - 1px)` }"
                  aria-hidden="true"
                ></div>
              </div>
              <div class="mt-2 flex items-start justify-between gap-4 text-sm">
                <div>
                  <p class="font-semibold text-gray-950 dark:text-white">
                    {{ formatCurrency(selectedScenario?.projected_balance_at_retirement || 0, { compact: true }) }} projected at {{ form.target_retirement_age }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ formatCurrency(selectedScenario?.projected_balance_in_today_dollars || 0, { compact: true }) }} in today's money
                  </p>
                </div>
                <div class="text-right">
                  <p class="font-semibold text-gray-950 dark:text-white">
                    {{ formatCurrency(selectedScenario?.portfolio_goal_at_retirement || 0, { compact: true }) }} needed
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ formatCurrency(projection?.goal?.effective_target_today || 0, { compact: true }) }} in today's money
                  </p>
                </div>
              </div>
            </div>

            <dl class="mt-6 divide-y divide-gray-200 border-t border-gray-200 text-sm dark:divide-gray-700 dark:border-gray-700">
              <div data-testid="composition-row" class="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                <dt class="text-gray-500 dark:text-gray-400">Where it comes from</dt>
                <dd class="text-gray-900 dark:text-white">
                  <span class="font-semibold">{{ compositionRow.value }}</span>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">{{ compositionRow.detail }}</span>
                </dd>
              </div>
              <div class="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                <dt class="text-gray-500 dark:text-gray-400">Monthly contribution</dt>
                <dd class="text-gray-900 dark:text-white">
                  <span class="font-semibold">{{ contributionRow.value }}</span>
                  <span v-if="contributionRow.detail" class="block text-xs text-gray-500 dark:text-gray-400">{{ contributionRow.detail }}</span>
                </dd>
              </div>
              <div v-if="viability" data-testid="viability" class="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                <dt class="text-gray-500 dark:text-gray-400">What you can afford</dt>
                <dd class="text-gray-900 dark:text-white">
                  <span class="font-semibold" :class="viabilityValueClass">{{ viabilityHeadline }}</span>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">{{ viabilitySentence }}</span>
                </dd>
              </div>
              <div class="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                <dt class="text-gray-500 dark:text-gray-400">Goal reached</dt>
                <dd class="text-gray-900 dark:text-white">
                  <span class="font-semibold">{{ goalAgeRow.value }}</span>
                  <span v-if="goalAgeRow.detail" class="block text-xs text-gray-500 dark:text-gray-400">{{ goalAgeRow.detail }}</span>
                </dd>
              </div>
              <div class="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                <dt class="text-gray-500 dark:text-gray-400">Yearly spending supported</dt>
                <dd class="text-gray-900 dark:text-white">
                  <span class="font-semibold">{{ formatCurrency(selectedScenario?.supported_annual_spending_today || 0, { compact: true }) }} in today's money</span>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">{{ supportedSpendingDetail }}</span>
                </dd>
              </div>
              <div class="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                <dt class="text-gray-500 dark:text-gray-400">Assumptions</dt>
                <dd class="text-gray-900 dark:text-white">
                  <span class="font-semibold">{{ selectedScenario?.label || "Custom assumption" }}</span>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">
                    {{ formatPercent(selectedScenario?.annual_return_percent) }} yearly return and {{ selectedInflationLabel }}. Amounts above are in retirement-year dollars unless noted.
                  </span>
                </dd>
              </div>
            </dl>
          </section>

          <section class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
            <div class="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 class="text-lg font-semibold text-gray-950 dark:text-white">Projection paths</h2>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Custom assumptions and every historical period with sufficient coverage.
                </p>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ projection?.years_to_retirement || 0 }} years to retirement
              </p>
            </div>
            <div class="h-80 sm:h-96">
              <RetirementProjectionChart
                :scenarios="projection?.scenarios || []"
                :target-in-today-dollars="projection?.goal?.effective_target_today || 0"
                :inflation-rate-percent="Number(selectedScenario?.inflation_rate_percent) || 0"
                :currency="currencyCode"
              />
            </div>
            <p class="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
              The chart uses future dollars. The calculated goal line rises with inflation so it has
              the same purchasing power at each age.
            </p>
          </section>

          <section
            data-testid="scenario-comparison"
            class="relative rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
            @mouseleave="scenarioHelpOpen = false"
          >
            <div class="relative border-b border-gray-200 px-5 py-4 dark:border-gray-700 sm:px-6">
              <button
                type="button"
                data-testid="scenario-help-trigger"
                class="inline-flex items-center gap-2 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
                aria-describedby="scenario-help-card"
                :aria-expanded="scenarioHelpOpen"
                @mouseenter="scenarioHelpOpen = true"
                @focus="scenarioHelpOpen = true"
                @blur="scenarioHelpOpen = false"
                @click="scenarioHelpOpen = true"
                @keydown.esc.stop="scenarioHelpOpen = false"
              >
                <span class="text-lg font-semibold text-gray-950 dark:text-white">Compare scenarios</span>
                <InformationCircleIcon class="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </button>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                <template v-if="hasMultipleScenarios">
                  Select a row to update the status. Hover or focus the heading to see how each scenario is built.
                </template>
                <template v-else>
                  Hover or focus the heading to see how scenarios are built.
                </template>
              </p>

              <div
                v-show="scenarioHelpOpen"
                id="scenario-help-card"
                data-testid="scenario-help-card"
                role="tooltip"
                class="absolute left-5 right-5 top-full z-30 mt-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-600 dark:bg-gray-800 sm:left-6 sm:right-6 sm:p-6"
                @mouseenter="scenarioHelpOpen = true"
              >
                <div class="flex items-start gap-3">
                  <InformationCircleIcon class="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400" />
                  <div>
                    <p class="text-base font-semibold text-gray-950 dark:text-white">How the scenarios are built</p>
                    <p class="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
                      Every scenario uses the same portfolio, savings plan, retirement date,
                      withdrawal rate, and goal in today’s dollars. Its investment return and
                      inflation source determine the retirement-year result.
                    </p>
                  </div>
                </div>

                <div class="mt-4 grid gap-3 lg:grid-cols-2">
                  <article class="rounded-xl border border-primary-200 bg-primary-50 p-4 dark:border-primary-800 dark:bg-primary-900/20">
                    <p class="text-xs font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">
                      Custom assumption
                    </p>
                    <p class="mt-2 text-sm font-semibold text-gray-950 dark:text-white">
                      Uses your return and future inflation estimates
                    </p>
                    <p class="mt-1 text-xs leading-5 text-gray-700 dark:text-gray-300">
                      Applies your {{ formatPercent(form.custom_return_rate_percent) }} yearly return and
                      {{ formatPercent(form.inflation_rate_percent) }} future inflation estimate. It does
                      not use the portfolio’s past performance or past inflation.
                    </p>
                  </article>

                  <article class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                    <p class="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                      Historical assumptions
                    </p>
                    <p class="mt-2 text-sm font-semibold text-gray-950 dark:text-white">
                      Uses matching portfolio returns and historical inflation
                    </p>
                    <p class="mt-1 text-xs leading-5 text-gray-700 dark:text-gray-300">
                      Uses {{ accountScopeLabel }}, treats new lots as
                      contributions, includes recorded dividends when available, and applies annualized
                      U.S. CPI-U inflation from the same historical period.
                    </p>
                  </article>
                </div>

                <div class="mt-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                  <p class="text-sm font-semibold text-gray-900 dark:text-white">Shared by every scenario</p>
                  <ul class="mt-2 grid gap-x-6 gap-y-1 text-xs text-gray-600 dark:text-gray-300 sm:grid-cols-2">
                    <li>{{ formatCurrency(projection?.baseline?.starting_balance || 0, { compact: true }) }} starting balance</li>
                    <li>{{ formatWholeCurrency(form.monthly_contribution || 0) }} monthly contribution</li>
                    <li>{{ formatPercent(form.annual_contribution_increase_percent) }} yearly contribution increase</li>
                    <li>Retirement at age {{ form.target_retirement_age }}</li>
                    <li>{{ formatPercent(form.withdrawal_rate_percent) }} withdrawal rate and the same goal</li>
                  </ul>
                  <p class="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    Historical scenarios do not replay yearly market changes. They assume the
                    period’s annualized return and annualized historical inflation both repeat steadily.
                  </p>
                </div>
              </div>
            </div>

            <div v-if="hasMultipleScenarios" class="overflow-x-auto rounded-b-2xl">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-900/40">
                  <tr>
                    <th class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Scenario</th>
                    <th class="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Return</th>
                    <th class="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Inflation</th>
                    <th class="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Projected balance at retirement</th>
                    <th class="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                  <tr
                    v-for="scenario in projection?.scenarios || []"
                    :key="scenario.key"
                    class="cursor-pointer transition-colors hover:bg-primary-50 dark:hover:bg-primary-900/20"
                    :class="{ 'bg-primary-50 dark:bg-primary-900/20': scenario.key === selectedScenarioKey }"
                    tabindex="0"
                    :aria-label="`${scenario.label}${scenario.key === selectedScenarioKey ? ', selected' : ''}`"
                    @click="selectedScenarioKey = scenario.key"
                    @keydown.enter.prevent="selectedScenarioKey = scenario.key"
                    @keydown.space.prevent="selectedScenarioKey = scenario.key"
                  >
                    <td class="whitespace-nowrap px-5 py-4">
                      <div class="flex items-center gap-3">
                        <span
                          class="h-2.5 w-2.5 rounded-full"
                          :class="scenario.key === selectedScenarioKey ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'"
                        ></span>
                        <div>
                          <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ scenario.label }}</p>
                          <p v-if="scenario.source === 'historical'" class="text-xs text-gray-500 dark:text-gray-400">
                            {{ formatCoverage(scenario) }}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td class="whitespace-nowrap px-5 py-4 text-right text-sm font-medium text-gray-700 dark:text-gray-200">
                      {{ formatPercent(scenario.annual_return_percent) }}
                    </td>
                    <td class="whitespace-nowrap px-5 py-4 text-right">
                      <p class="text-sm font-medium text-gray-700 dark:text-gray-200">
                        {{ formatPercent(scenario.inflation_rate_percent) }}
                      </p>
                      <p class="text-xs text-gray-500 dark:text-gray-400">
                        {{ scenario.source === "historical" ? "Historical CPI-U" : "Your estimate" }}
                      </p>
                    </td>
                    <td class="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold text-gray-900 dark:text-white">
                      {{ formatCurrency(scenario.projected_balance_at_retirement, { compact: true }) }}
                    </td>
                    <td class="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold" :class="scenario.is_on_track ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'">
                      {{ scenario.is_on_track ? "On track" : "Shortfall" }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="px-5 py-4 sm:px-6">
              <div class="flex items-start gap-3">
                <ChartBarIcon class="mt-0.5 h-5 w-5 shrink-0 text-gray-500 dark:text-gray-400" />
                <div class="min-w-0 flex-1">
                  <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Historical scenario quality</h3>
                  <p
                    v-if="retirementStore.historicalInflation?.unavailable && retirementStore.historicalScenarios.length > 0"
                    class="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                  >
                    {{ retirementStore.historicalInflation.message }}
                  </p>
                  <p v-if="retirementStore.historicalScenarios.length === 0" class="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    Only the Custom assumption is available. No historical period currently meets the 80% time
                    and portfolio-value coverage requirement. Add or refresh tracked holdings to improve coverage.
                  </p>
                  <ul v-else class="mt-2 space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
                    <li v-for="scenario in retirementStore.historicalScenarios" :key="scenario.key">
                      {{ scenario.label }}: {{ formatCoverage(scenario) }}
                      <span>, {{ formatPercent(scenario.inflation_rate_percent) }} historical CPI-U inflation</span>
                      <span v-if="scenario.includes_recorded_dividends">, recorded dividends included</span>
                    </li>
                  </ul>
                  <details class="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    <summary class="cursor-pointer font-semibold text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100">
                      About historical projections and sources
                    </summary>
                    <p class="mt-2">
                      Historical projections illustrate what could happen if a prior annualized return repeated.
                      Past performance does not predict future results, and taxes, fees, healthcare costs, required
                      distributions, and account-specific tax treatment are not modeled.
                    </p>
                    <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      <a
                        href="https://www.bls.gov/cpi/factsheets/cpi-series-ids.htm"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center font-semibold text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
                      >
                        Historical inflation source: U.S. Bureau of Labor Statistics CPI-U
                        <ArrowTopRightOnSquareIcon class="ml-1.5 h-3.5 w-3.5" />
                      </a>
                      <a
                        href="https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-47"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center font-semibold text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
                      >
                        Read the SEC’s performance-claims guidance
                        <ArrowTopRightOnSquareIcon class="ml-1.5 h-3.5 w-3.5" />
                      </a>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRetirementStore } from '@/stores/retirement'
import { useGlobalAccountFilter } from '@/composables/useGlobalAccountFilter'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { useNotification } from '@/composables/useNotification'
import RetirementProjectionChart from '@/components/investments/RetirementProjectionChart.vue'
import RetirementCashflowPanel from '@/components/investments/RetirementCashflowPanel.vue'
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ArrowTrendingUpIcon,
  BanknotesIcon,
  BookmarkSquareIcon,
  BuildingLibraryIcon,
  CalculatorIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  HomeIcon,
  InformationCircleIcon,
  TrashIcon
} from '@heroicons/vue/24/outline'

const retirementStore = useRetirementStore()
const {
  selectedAccount,
  selectedAccountLabel,
  isFiltered,
  fetchAccounts
} = useGlobalAccountFilter()
const { currencyCode, currencySymbol, formatCurrency } = useCurrencyFormatter()
const { showSuccess, showError, showDangerConfirmation } = useNotification()

const initialLoading = ref(true)
const selectedScenarioKey = ref('custom')
const scenarioHelpOpen = ref(false)
const accountPickerOpen = ref(false)
const accountPickerContainer = ref(null)
const includedAccountIds = ref([])
const formError = ref('')
const advancedGoalOpen = ref(false)
const assumptionsSection = ref(null)
const statusSection = ref(null)
const lastCalculatedKey = ref('')
const savingsAccountBusy = ref(null)
let autoRecalculateTimer = null
const AUTO_RECALCULATE_DELAY_MS = 700
const form = reactive({
  current_age: 35,
  target_retirement_age: 65,
  current_annual_cost_of_living: 60000,
  desired_annual_retirement_spending: 60000,
  target_portfolio_balance: null,
  monthly_contribution: 500,
  annual_contribution_increase_percent: 0,
  additional_retirement_savings: 0,
  other_annual_retirement_income: 0,
  other_income_start_age: 65,
  custom_return_rate_percent: 7,
  inflation_rate_percent: 3,
  withdrawal_rate_percent: 4
})

const projection = computed(() => retirementStore.projection)
const availableAccounts = computed(() => retirementStore.portfolio?.available_accounts || [])
const selectableAccounts = computed(() => {
  if (!isFiltered.value) return availableAccounts.value
  return availableAccounts.value.filter(account => account.account_identifier === selectedAccount.value)
})
const allAccountsIncluded = computed(() => (
  availableAccounts.value.length > 0
  && includedAccountIds.value.length === availableAccounts.value.length
))
const hasCustomAccountScope = computed(() => (
  !isFiltered.value
  && availableAccounts.value.length > 0
  && includedAccountIds.value.length > 0
  && !allAccountsIncluded.value
))
const accountScopeLabel = computed(() => {
  if (isFiltered.value) return selectedAccountLabel.value
  if (hasCustomAccountScope.value) {
    return `${includedAccountIds.value.length} of ${availableAccounts.value.length} accounts`
  }
  return 'All accounts'
})
const selectedScenario = computed(() => {
  const scenarios = projection.value?.scenarios || []
  return scenarios.find(scenario => scenario.key === selectedScenarioKey.value)
    || scenarios[0]
    || null
})

const selectedInflationLabel = computed(() => {
  const rate = formatPercent(selectedScenario.value?.inflation_rate_percent)
  return selectedScenario.value?.source === 'historical'
    ? `${rate} historical CPI-U inflation`
    : `${rate} future inflation estimate`
})

const ongoingPortfolioNeed = computed(() => Math.max(
  0,
  Number(projection.value?.goal?.spending_target_today || 0)
    - Number(projection.value?.goal?.bridge_reserve_today || 0)
))

const yearsToRetirement = computed(() => Math.max(
  0,
  Number(form.target_retirement_age) - Number(form.current_age)
))

const startingBalance = computed(() => {
  const baseline = Number(projection.value?.baseline?.starting_balance)
  if (Number.isFinite(baseline) && !projectionOutOfDate.value) return baseline
  return Number(retirementStore.portfolio?.tracked_portfolio_value || 0)
    + linkedSavingsTotal.value
    + (Number(form.additional_retirement_savings) || 0)
})

const hasMultipleScenarios = computed(() => (projection.value?.scenarios || []).length > 1)

const projectionOutOfDate = computed(() => (
  retirementStore.calculating || JSON.stringify(planPayload()) !== lastCalculatedKey.value
))

const projectionSyncLabel = computed(() => {
  if (retirementStore.calculating) return 'Updating the projection...'
  if (projectionOutOfDate.value) {
    return formIsValid.value
      ? 'Inputs changed. The projection updates in a moment.'
      : 'Fix the highlighted inputs to update the projection.'
  }
  return 'Projection matches your inputs.'
})

const compositionRow = computed(() => {
  const starting = Number(projection.value?.baseline?.starting_balance) || 0
  const contributions = Number(selectedScenario.value?.total_future_contributions) || 0
  const growth = Number(selectedScenario.value?.projected_investment_growth) || 0
  const years = yearsToRetirement.value
  const rate = formatPercent(selectedScenario.value?.annual_return_percent)
  const compact = value => formatCurrency(value, { compact: true })
  const value = `${compact(starting)} today, ${compact(contributions)} added, ${compact(growth)} from growth`
  if (contributions === 0) {
    return {
      value,
      detail: `With nothing added, the result rests entirely on today's ${compact(starting)} compounding at ${rate} for ${years} years.`
    }
  }
  return {
    value,
    detail: `Today's balance and future contributions compound at ${rate} for ${years} years.`
  }
})

const affordability = computed(() => retirementStore.affordability || null)

const linkedSavingsAccounts = computed(() => (
  (affordability.value?.savings_accounts || []).filter(account => account.account_subtype !== 'checking')
))

const linkedSavingsTotal = computed(() => round0(
  linkedSavingsAccounts.value
    .filter(account => account.include_in_retirement_savings)
    .reduce((sum, account) => sum + (Number(account.current_balance) || 0), 0)
))

const viability = computed(() => {
  if (!affordability.value?.available || !selectedScenario.value) return null
  return affordability.value.viability?.[selectedScenario.value.key] || null
})

const viabilityHeadline = computed(() => {
  switch (viability.value?.status) {
    case 'on_track': return 'Your current contribution already covers this plan.'
    case 'affordable': return 'Affordable with what you have left over.'
    case 'stretch': return 'This plan needs more than your cash flow leaves over.'
    case 'not_reachable': return 'No monthly amount reaches this goal by age 100.'
    default: return ''
  }
})

const viabilitySentence = computed(() => {
  const result = viability.value
  if (!result) return ''
  const capacity = formatWholeCurrency(result.capacity)
  if (result.status === 'on_track') {
    return `You could set aside up to ${capacity} a month based on the last ${affordability.value.cashflow.months_covered} months of linked activity.`
  }
  if (result.status === 'affordable') {
    return `Raising your contribution by ${formatWholeCurrency(result.increase_needed)} to ${formatWholeCurrency(result.required)} a month fits within the ${capacity} a month you could save.`
  }
  if (result.status === 'stretch') {
    const parts = [`It calls for ${formatWholeCurrency(result.required)} a month, ${formatWholeCurrency(result.shortfall_per_month)} more than the ${capacity} you could save.`]
    const discretionary = affordability.value.cashflow.monthly.discretionary || 0
    const options = []
    if (result.spending_cut_percent != null && result.spending_cut_percent < 100) {
      options.push(`cut discretionary spending by about ${result.spending_cut_percent}%`)
    } else if (discretionary > 0) {
      parts.push(`Cutting all ${formatWholeCurrency(discretionary)} a month of discretionary spending would not close it on its own.`)
    }
    if (result.suggested_retirement_age) options.push(`retire closer to age ${result.suggested_retirement_age}`)
    if (options.length > 0) {
      parts.push(`To close it, ${options.join(' or ')}.`)
    } else {
      parts.push('Lower the retirement spending goal or extend the timeline to find a reachable plan.')
    }
    return parts.join(' ')
  }
  return `You could save up to ${capacity} a month. Lower the goal, extend the timeline, or raise the return assumption to find a reachable plan.`
})

const viabilityValueClass = computed(() => {
  const status = viability.value?.status
  if (status === 'on_track' || status === 'affordable') return 'text-green-700 dark:text-green-400'
  return 'text-amber-700 dark:text-amber-400'
})

const goalBar = computed(() => {
  const balance = Math.max(0, Number(selectedScenario.value?.projected_balance_at_retirement) || 0)
  const goal = Math.max(0, Number(selectedScenario.value?.portfolio_goal_at_retirement) || 0)
  const scale = Math.max(balance, goal) * 1.08 || 1
  return {
    balance_percent: Math.min(100, (balance / scale) * 100),
    goal_percent: Math.min(98, Math.max(2, (goal / scale) * 100))
  }
})

const contributionRow = computed(() => {
  const current = Number(form.monthly_contribution) || 0
  const required = selectedScenario.value?.required_monthly_contribution
  const value = `${formatWholeCurrency(current)} a month`
  if (required == null) {
    return { value, detail: 'No monthly amount reaches the goal before age 100 on this path.' }
  }
  if (required <= current) {
    return { value, detail: `${formatWholeCurrency(required)} a month is enough to reach the goal.` }
  }
  return { value, detail: `${formatWholeCurrency(required)} a month is needed, ${formatWholeCurrency(required - current)} more than now.` }
})

const goalAgeRow = computed(() => {
  const age = selectedScenario.value?.estimated_goal_age
  const retirementAge = Number(form.target_retirement_age)
  if (age == null) return { value: 'Not by age 100', detail: 'At the current contribution and return.' }
  const rounded = formatAge(age)
  if (age <= retirementAge) {
    return { value: `Age ${rounded}`, detail: `${Math.max(0, Math.round(retirementAge - age))} years before you plan to retire.` }
  }
  return { value: `Age ${rounded}`, detail: `${Math.round(age - retirementAge)} years after your planned retirement at ${retirementAge}.` }
})

const supportedSpendingDetail = computed(() => {
  const supported = Number(selectedScenario.value?.supported_annual_spending_today) || 0
  const wanted = Number(form.desired_annual_retirement_spending) || 0
  if (!wanted) return ''
  const wantedText = formatCurrency(wanted, { compact: true })
  if (supported >= wanted) return `Covers the ${wantedText} a year you want, including other retirement income.`
  return `Short of the ${wantedText} a year you want, including other retirement income.`
})

const formIsValid = computed(() => (
  Number(form.current_age) >= 18
  && Number(form.current_age) <= 99
  && Number(form.target_retirement_age) > Number(form.current_age)
  && Number(form.target_retirement_age) <= 100
  && Number(form.desired_annual_retirement_spending) > 0
  && Number(form.current_annual_cost_of_living) >= 0
  && Number(form.monthly_contribution) >= 0
  && Number(form.additional_retirement_savings) >= 0
  && Number(form.other_annual_retirement_income) >= 0
  && Number(form.custom_return_rate_percent) > -100
  && Number(form.custom_return_rate_percent) <= 100
  && Number(form.inflation_rate_percent) >= 0
  && Number(form.inflation_rate_percent) <= 20
  && Number(form.withdrawal_rate_percent) > 0
  && Number(form.withdrawal_rate_percent) <= 20
))

const hasUnsavedChanges = computed(() => {
  if (!retirementStore.plan) return true
  const savedPayload = planPayload(retirementStore.plan)
  return JSON.stringify(planPayload(form)) !== JSON.stringify(savedPayload)
})

const StepBadge = defineComponent({
  name: 'StepBadge',
  props: {
    step: { type: Number, required: true },
    icon: { type: [Object, Function], required: true }
  },
  setup(props) {
    return () => h('div', {
      class: 'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
    }, [
      h(props.icon, { class: 'h-5 w-5' }),
      h('span', {
        class: 'absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold leading-none text-white',
        'aria-label': `Step ${props.step}`
      }, String(props.step))
    ])
  }
})

const MoneyField = defineComponent({
  name: 'MoneyField',
  props: {
    modelValue: { type: [Number, String], default: 0 },
    label: { type: String, required: true },
    currencySymbol: { type: String, required: true },
    help: { type: String, default: '' },
    required: { type: Boolean, default: false },
    nullable: { type: Boolean, default: false }
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('label', { class: 'block' }, [
      h('span', { class: 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200' }, props.label),
      h('div', { class: 'relative' }, [
        h('span', {
          class: 'pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500 dark:text-gray-400'
        }, props.currencySymbol),
        h('input', {
          class: 'input pl-9',
          type: 'number',
          min: 0,
          step: '0.01',
          required: props.required,
          value: props.modelValue ?? '',
          onInput: event => {
            const value = event.target.value
            emit('update:modelValue', value === '' && props.nullable ? null : Number(value))
          }
        })
      ]),
      props.help
        ? h('span', { class: 'mt-1.5 block text-xs leading-5 text-gray-500 dark:text-gray-400' }, props.help)
        : null
    ])
  }
})

const PercentField = defineComponent({
  name: 'PercentField',
  props: {
    modelValue: { type: [Number, String], default: 0 },
    label: { type: String, required: true },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    help: { type: String, default: '' }
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('label', { class: 'block' }, [
      h('span', { class: 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200' }, props.label),
      h('div', { class: 'relative' }, [
        h('input', {
          class: 'input pr-10',
          type: 'number',
          min: props.min,
          max: props.max,
          step: '0.1',
          value: props.modelValue,
          onInput: event => emit('update:modelValue', Number(event.target.value))
        }),
        h('span', {
          class: 'pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-500'
        }, '%')
      ]),
      props.help
        ? h('span', { class: 'mt-1.5 block text-xs leading-5 text-gray-500 dark:text-gray-400' }, props.help)
        : null
    ])
  }
})

function buildAccountParams() {
  if (selectedAccount.value) return { accounts: selectedAccount.value }
  if (hasCustomAccountScope.value) return { accounts: includedAccountIds.value.join(',') }
  return {}
}

function resetAccountSelection() {
  const identifiers = availableAccounts.value.map(account => account.account_identifier)
  includedAccountIds.value = selectedAccount.value
    ? identifiers.filter(identifier => identifier === selectedAccount.value)
    : identifiers
}

function isAccountIncluded(accountIdentifier) {
  return includedAccountIds.value.includes(accountIdentifier)
}

function accountIdentifierLabel(accountIdentifier) {
  if (accountIdentifier === '__unsorted__') return 'Unsorted'
  const value = String(accountIdentifier || '')
  if (value.length <= 4) return value
  return `••••${value.slice(-4)}`
}

function accountDisplayName(account) {
  return account.account_name || accountIdentifierLabel(account.account_identifier)
}

function accountSecondaryLabel(account) {
  if (!account.account_name || account.account_identifier === '__unsorted__') return null
  return accountIdentifierLabel(account.account_identifier)
}

function accountSourceLabel(source) {
  return {
    manual_holdings: 'Manual holdings',
    plaid_holdings: 'Plaid-synced holdings',
    open_long_positions: 'Open long positions'
  }[source] || source
}

async function toggleAccount(accountIdentifier) {
  if (isFiltered.value) return
  const included = new Set(includedAccountIds.value)
  if (included.has(accountIdentifier)) {
    if (included.size === 1) return
    included.delete(accountIdentifier)
  } else {
    included.add(accountIdentifier)
  }
  includedAccountIds.value = availableAccounts.value
    .map(account => account.account_identifier)
    .filter(identifier => included.has(identifier))
  await calculatePreview()
}

async function includeAllAccounts() {
  includedAccountIds.value = availableAccounts.value.map(account => account.account_identifier)
  await calculatePreview()
}

function handleAccountPickerOutsideClick(event) {
  if (
    accountPickerOpen.value
    && accountPickerContainer.value
    && !accountPickerContainer.value.contains(event.target)
  ) {
    accountPickerOpen.value = false
  }
}

function planPayload(source = form) {
  return {
    current_age: Number(source.current_age),
    target_retirement_age: Number(source.target_retirement_age),
    current_annual_cost_of_living: Number(source.current_annual_cost_of_living) || 0,
    desired_annual_retirement_spending: Number(source.desired_annual_retirement_spending) || 0,
    target_portfolio_balance: source.target_portfolio_balance === null || source.target_portfolio_balance === ''
      ? null
      : Number(source.target_portfolio_balance),
    monthly_contribution: Number(source.monthly_contribution) || 0,
    annual_contribution_increase_percent: Number(source.annual_contribution_increase_percent) || 0,
    additional_retirement_savings: Number(source.additional_retirement_savings) || 0,
    other_annual_retirement_income: Number(source.other_annual_retirement_income) || 0,
    other_income_start_age: source.other_income_start_age === null || source.other_income_start_age === ''
      ? null
      : Number(source.other_income_start_age),
    custom_return_rate_percent: Number(source.custom_return_rate_percent),
    inflation_rate_percent: Number(source.inflation_rate_percent),
    withdrawal_rate_percent: Number(source.withdrawal_rate_percent)
  }
}

function hydrateForm(plan) {
  if (!plan) return
  Object.assign(form, planPayload(plan))
}

function validateForm() {
  formError.value = ''
  if (Number(form.target_retirement_age) <= Number(form.current_age)) {
    formError.value = 'Retirement age must be later than your current age.'
  } else if (Number(form.desired_annual_retirement_spending) <= 0) {
    formError.value = 'Desired retirement spending must be greater than zero.'
  } else if (!formIsValid.value) {
    formError.value = 'Review the highlighted assumptions and enter values within the allowed ranges.'
  }
  return !formError.value
}

function markProjectionCurrent(payload = planPayload()) {
  lastCalculatedKey.value = JSON.stringify(payload)
}

function scrollIntoViewIfPossible(element) {
  if (element && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}

function scrollToAssumptions() {
  scrollIntoViewIfPossible(assumptionsSection.value)
}

async function calculatePreview() {
  if (!validateForm()) return false
  const payload = planPayload()
  try {
    const result = await retirementStore.calculate(payload, buildAccountParams())
    if (result === null) return false
    markProjectionCurrent(payload)
    if (!projection.value?.scenarios?.some(scenario => scenario.key === selectedScenarioKey.value)) {
      selectedScenarioKey.value = 'custom'
    }
    return true
  } catch (_) {
    showError('Projection not updated', retirementStore.error)
    return false
  }
}

async function recalculateNow() {
  clearTimeout(autoRecalculateTimer)
  const updated = await calculatePreview()
  if (updated) scrollIntoViewIfPossible(statusSection.value)
}

function scheduleAutoRecalculate() {
  clearTimeout(autoRecalculateTimer)
  if (!formIsValid.value) return
  autoRecalculateTimer = setTimeout(() => {
    autoRecalculateTimer = null
    if (!projectionOutOfDate.value || retirementStore.calculating) return
    calculatePreview()
  }, AUTO_RECALCULATE_DELAY_MS)
}

async function savePlan() {
  if (!validateForm()) return
  try {
    const payload = planPayload()
    await retirementStore.save(payload)
    if (isFiltered.value || hasCustomAccountScope.value) {
      await retirementStore.calculate(payload, buildAccountParams())
    }
    markProjectionCurrent(payload)
    showSuccess('Retirement plan saved', 'Your assumptions will be recalculated against the latest portfolio each time you return.')
  } catch (_) {
    showError('Plan not saved', retirementStore.error)
  }
}

function confirmReset() {
  showDangerConfirmation(
    'Reset retirement plan',
    'This deletes your saved assumptions. Your portfolios and investment data are not affected.',
    async () => {
      try {
        await retirementStore.reset()
        const result = await retirementStore.load(buildAccountParams())
        hydrateForm(result.draft_plan)
        markProjectionCurrent()
        selectedScenarioKey.value = 'custom'
        showSuccess('Retirement plan reset', 'The planner has returned to its starting assumptions.')
      } catch (_) {
        showError('Plan not reset', retirementStore.error)
      }
    },
    { confirmText: 'Reset plan' }
  )
}

function round0(value) {
  return Math.round(Number(value) || 0)
}

function liabilityLabel(type) {
  return { credit: 'credit card', mortgage: 'mortgage', student: 'student loan' }[type] || type
}

function applySuggestion({ field, value }) {
  if (!(field in form)) return
  const number = Number(value)
  if (!Number.isFinite(number)) return
  form[field] = round0(number)
  if (field === 'current_annual_cost_of_living') advancedGoalOpen.value = true
}

async function toggleSavingsAccount(account, include) {
  savingsAccountBusy.value = account.id
  try {
    await retirementStore.setRetirementSavingsAccount(account.id, include)
    await calculatePreview()
  } catch (error) {
    showError('Account not updated', error.response?.data?.error || error.message)
  } finally {
    savingsAccountBusy.value = null
  }
}

async function loadAffordabilityTransactions() {
  try {
    await retirementStore.fetchAffordabilityTransactions({ months: affordability.value?.cashflow?.months_requested })
  } catch (error) {
    showError('Transactions not loaded', error.response?.data?.error || error.message)
  }
}

async function categorizeTransaction({ id, category }) {
  try {
    await retirementStore.setCashflowCategory(id, category)
    await refreshAffordability()
  } catch (error) {
    showError('Category not saved', error.response?.data?.error || error.message)
  }
}

async function refreshAffordability() {
  try {
    await retirementStore.refreshAffordability(affordability.value?.cashflow?.months_requested)
    // Viability depends on the summary, so recalculate to refresh it.
    await calculatePreview()
  } catch (error) {
    showError('Cash flow not refreshed', error.response?.data?.error || error.message)
  }
}

function formatWholeCurrency(value) {
  return formatCurrency(Math.round(Number(value) || 0), { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return `${number.toFixed(2)}%`
}

function formatAge(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return number % 1 === 0 ? String(number) : number.toFixed(1)
}

function formatCoverage(scenario) {
  const time = Number(scenario.time_coverage_percent) || 0
  const value = Number(scenario.portfolio_value_coverage_percent) || 0
  return `${time.toFixed(0)}% time · ${value.toFixed(0)}% portfolio value`
}

watch(() => JSON.stringify(planPayload()), key => {
  if (initialLoading.value || key === lastCalculatedKey.value) return
  scheduleAutoRecalculate()
})

watch(selectedAccount, async () => {
  if (initialLoading.value) return
  console.log('[RETIREMENT PLANNER] Global account filter changed to:', selectedAccount.value || 'All Accounts')
  accountPickerOpen.value = false
  resetAccountSelection()
  if (formIsValid.value) {
    await calculatePreview()
  }
})

onMounted(async () => {
  document.addEventListener('pointerdown', handleAccountPickerOutsideClick)
  try {
    await fetchAccounts()
    const result = await retirementStore.load(buildAccountParams())
    hydrateForm(result.draft_plan)
    markProjectionCurrent()
    resetAccountSelection()
  } catch (_) {
    showError('Retirement planner unavailable', retirementStore.error)
  } finally {
    initialLoading.value = false
  }
})

onBeforeUnmount(() => {
  clearTimeout(autoRecalculateTimer)
  document.removeEventListener('pointerdown', handleAccountPickerOutsideClick)
})
</script>
