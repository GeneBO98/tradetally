<template>
    <div class="content-wrapper py-8">
        <div class="mb-8">
            <h1 class="heading-page">App Settings</h1>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Configure your application preferences and AI provider settings.
            </p>
        </div>

        <!-- Tabs Navigation -->
        <div class="border-b border-gray-200 dark:border-gray-700 mb-8">
            <nav class="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
                <button
                    v-for="tab in tabs"
                    :key="tab.id"
                    @click="activeTab = tab.id"
                    :class="[
                        activeTab === tab.id
                            ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300',
                        'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                    ]"
                >
                    {{ tab.label }}
                </button>
            </nav>
        </div>

        <!-- Tab Content -->
        <div class="space-y-8">
            <!-- General Tab -->
            <template v-if="activeTab === 'general'">
                <!-- Analytics Preferences -->
                <div class="card">
                    <div class="card-body">
                        <h3
                            class="text-lg font-medium text-gray-900 dark:text-white mb-6"
                        >
                            Analytics Preferences
                        </h3>
                        <p
                            class="text-sm text-gray-600 dark:text-gray-400 mb-6"
                        >
                            Customize how your trading analytics are calculated
                            and displayed.
                        </p>

                        <form
                            @submit.prevent="updateAnalyticsSettings"
                            class="divide-y divide-gray-100 dark:divide-gray-700"
                        >
                            <div class="pb-6">
                                <label for="statisticsCalculation" class="label"
                                    >Statistics Calculation Method</label
                                >
                                <BaseSelect
                                    v-model="analyticsForm.statisticsCalculation"
                                    :options="[
                                        { value: 'average', label: 'Average (Mean)' },
                                        { value: 'median', label: 'Median' }
                                    ]"
                                />
                                <p
                                    class="mt-2 text-sm text-gray-500 dark:text-gray-400"
                                >
                                    Choose whether to use averages or medians
                                    for calculations like Average P&L, Average
                                    Win, Average Loss, etc. Medians are less
                                    affected by outliers and may provide a more
                                    representative view of typical performance.
                                </p>
                                <p class="mt-1 text-sm text-primary-600 dark:text-primary-400 font-medium">
                                    Note: Changes take effect immediately
                                    and will update labels throughout the
                                    application.
                                </p>
                            </div>

                            <div class="py-6">
                                <div
                                    class="flex items-start justify-between gap-6 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700"
                                >
                                    <div class="flex-1 min-w-0">
                                        <label
                                            for="analyticsPositionGrouping"
                                            class="block text-sm font-semibold text-gray-900 dark:text-white"
                                        >
                                            Win Rate by Whole Trade
                                        </label>
                                        <p
                                            class="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed"
                                        >
                                            Group multi-leg option positions (spreads,
                                            iron condors, straddles, etc.) into a
                                            single trade for win rate and trade counts.
                                            Legs are grouped when they share the same
                                            account, underlying, expiration, and trade
                                            date, with fills within 5 minutes of each
                                            other. Common strategies are auto-detected
                                            and shown as a badge in the trade list.
                                            Affects all analytics; total P&amp;L is
                                            unchanged.
                                        </p>
                                    </div>
                                    <div class="flex-shrink-0 pt-0.5">
                                        <button
                                            type="button"
                                            @click="
                                                analyticsForm.analyticsPositionGrouping =
                                                    !analyticsForm.analyticsPositionGrouping
                                            "
                                            :class="[
                                                analyticsForm.analyticsPositionGrouping
                                                    ? 'bg-primary-600'
                                                    : 'bg-gray-200 dark:bg-gray-700',
                                                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2',
                                            ]"
                                            role="switch"
                                            :aria-checked="
                                                analyticsForm.analyticsPositionGrouping
                                            "
                                        >
                                            <span
                                                :class="[
                                                    analyticsForm.analyticsPositionGrouping
                                                        ? 'translate-x-5'
                                                        : 'translate-x-0',
                                                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                                                ]"
                                            />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div class="py-6">
                                <div
                                    class="flex items-start justify-between gap-6 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700"
                                >
                                    <div class="flex-1 min-w-0">
                                        <label
                                            for="edgeReportEnabled"
                                            class="block text-sm font-semibold text-gray-900 dark:text-white"
                                        >
                                            Weekly Edge Report
                                        </label>
                                        <p
                                            class="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed"
                                        >
                                            Get a weekly coaching digest every Monday:
                                            your numbers vs last week, your best edge,
                                            your biggest leak, and one concrete action
                                            item. The narrative is written by your
                                            configured AI provider when available and
                                            delivered by email.
                                        </p>
                                    </div>
                                    <div class="flex-shrink-0 pt-0.5">
                                        <button
                                            type="button"
                                            @click="
                                                analyticsForm.edgeReportEnabled =
                                                    !analyticsForm.edgeReportEnabled
                                            "
                                            :class="[
                                                analyticsForm.edgeReportEnabled
                                                    ? 'bg-primary-600'
                                                    : 'bg-gray-200 dark:bg-gray-700',
                                                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2',
                                            ]"
                                            role="switch"
                                            :aria-checked="
                                                analyticsForm.edgeReportEnabled
                                            "
                                        >
                                            <span
                                                :class="[
                                                    analyticsForm.edgeReportEnabled
                                                        ? 'translate-x-5'
                                                        : 'translate-x-0',
                                                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                                                ]"
                                            />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div class="py-6">
                                <label class="label">Breakeven Tolerance</label>
                                <div
                                    class="mt-2 inline-flex rounded-lg border border-gray-300 bg-gray-100 p-1 dark:border-gray-600 dark:bg-gray-800"
                                    role="group"
                                    aria-label="Breakeven tolerance unit"
                                >
                                    <button
                                        v-for="option in breakevenToleranceModeOptions"
                                        :key="option.value"
                                        type="button"
                                        class="rounded-md px-4 py-2 text-sm font-medium transition-colors"
                                        :class="
                                            analyticsForm.breakeven_tolerance_mode ===
                                            option.value
                                                ? 'bg-white text-primary-700 shadow-sm dark:bg-gray-700 dark:text-primary-300'
                                                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                        "
                                        :aria-pressed="
                                            analyticsForm.breakeven_tolerance_mode ===
                                            option.value
                                        "
                                        @click="
                                            analyticsForm.breakeven_tolerance_mode =
                                                option.value
                                        "
                                    >
                                        {{ option.label }}
                                    </button>
                                </div>

                                <div class="mt-4">
                                    <label
                                        :for="breakevenToleranceInputId"
                                        class="label"
                                    >
                                        {{ breakevenToleranceInputLabel }}
                                    </label>
                                    <div class="relative">
                                        <span
                                            v-if="
                                                analyticsForm.breakeven_tolerance_mode ===
                                                'dollars'
                                            "
                                            class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400"
                                        >
                                            $
                                        </span>
                                        <input
                                            v-if="
                                                analyticsForm.breakeven_tolerance_mode ===
                                                'dollars'
                                            "
                                            id="breakevenToleranceDollars"
                                            v-model.number="
                                                analyticsForm.breakeven_tolerance_dollars
                                            "
                                            type="number"
                                            min="0"
                                            max="1000000"
                                            step="0.01"
                                            class="input pl-8"
                                        />
                                        <input
                                            v-else
                                            id="breakevenToleranceTicks"
                                            v-model.number="
                                                analyticsForm.breakevenToleranceTicks
                                            "
                                            type="number"
                                            min="0"
                                            max="1000"
                                            step="1"
                                            class="input"
                                        />
                                    </div>
                                </div>
                                <p
                                    class="mt-2 text-sm text-gray-500 dark:text-gray-400"
                                >
                                    {{ breakevenToleranceDescription }}
                                </p>

                                <!-- Per-instrument overrides -->
                                <div
                                    v-if="
                                        analyticsForm.breakeven_tolerance_mode ===
                                        'ticks'
                                    "
                                    class="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60"
                                >
                                    <p class="text-sm font-semibold text-gray-900 dark:text-white mb-1">Per-Instrument Overrides</p>
                                    <p
                                        class="text-sm text-gray-500 dark:text-gray-400 mb-3"
                                    >
                                        Set a different tolerance for specific
                                        instruments by their underlying symbol —
                                        e.g. 2 ticks on ES but 5 on NQ. Instruments
                                        not listed use the default above.
                                    </p>
                                    <div class="space-y-2">
                                        <div
                                            v-for="(row, idx) in breakevenToleranceRows"
                                            :key="idx"
                                            class="flex items-center gap-2"
                                        >
                                            <input
                                                v-model="row.underlying"
                                                type="text"
                                                placeholder="ES"
                                                class="input flex-1 uppercase"
                                            />
                                            <input
                                                v-model.number="row.ticks"
                                                type="number"
                                                min="0"
                                                step="1"
                                                placeholder="ticks"
                                                class="input w-28"
                                            />
                                            <button
                                                type="button"
                                                class="btn-secondary px-3"
                                                @click="removeBreakevenToleranceRow(idx)"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        class="btn-secondary mt-3"
                                        @click="addBreakevenToleranceRow"
                                    >
                                        Add Instrument
                                    </button>
                                </div>
                            </div>

                            <div class="py-6">
                                <label for="displayCurrency" class="label"
                                    >Display Currency</label
                                >
                                <BaseSelect
                                    v-model="analyticsForm.displayCurrency"
                                    :options="currencySelectOptions"
                                />
                                <p
                                    class="mt-2 text-sm text-gray-500 dark:text-gray-400"
                                >
                                    Changes the currency symbol displayed for
                                    P&L, prices, and commissions. This is a
                                    cosmetic setting only — values are not
                                    converted using a foreign exchange rate.
                                    Market data (watchlist prices, stock
                                    quotes) remains in USD.
                                </p>
                            </div>

                            <div class="py-6">
                                <label for="tradeChartDefaultResolution" class="label">
                                    Default Trade Chart Resolution
                                </label>
                                <BaseSelect
                                    v-model="analyticsForm.trade_chart_default_resolution"
                                    :options="tradeChartResolutionOptions"
                                    :searchable="false"
                                />
                                <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                    Sets the candle interval used when you open a
                                    trade chart for the first time. A resolution
                                    you already selected for that trade takes
                                    precedence.
                                </p>
                            </div>

                            <div class="py-6">
                                <div
                                    class="flex items-start justify-between gap-6 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700"
                                >
                                    <div class="flex-1 min-w-0">
                                        <label
                                            for="autoCloseExpiredOptions"
                                            class="block text-sm font-semibold text-gray-900 dark:text-white"
                                        >
                                            Auto-Close Expired Options
                                        </label>
                                        <p
                                            class="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed"
                                        >
                                            Automatically close expired options
                                            positions with appropriate P&L (Long:
                                            -100%, Short: +100%). The system checks
                                            hourly for expired options.
                                        </p>
                                    </div>
                                    <div class="flex-shrink-0 pt-0.5">
                                        <button
                                            type="button"
                                            @click="
                                                analyticsForm.autoCloseExpiredOptions =
                                                    !analyticsForm.autoCloseExpiredOptions
                                            "
                                            :class="[
                                                analyticsForm.autoCloseExpiredOptions
                                                    ? 'bg-primary-600'
                                                    : 'bg-gray-200 dark:bg-gray-700',
                                                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2',
                                            ]"
                                            role="switch"
                                            :aria-checked="
                                                analyticsForm.autoCloseExpiredOptions
                                            "
                                        >
                                            <span
                                                :class="[
                                                    analyticsForm.autoCloseExpiredOptions
                                                        ? 'translate-x-5'
                                                        : 'translate-x-0',
                                                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                                                ]"
                                            />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div class="py-6">
                                <label for="defaultStopLossType" class="label"
                                    >Default Stop Loss Type</label
                                >
                                <BaseSelect
                                    v-model="analyticsForm.defaultStopLossType"
                                    :options="[
                                        { value: 'percent', label: 'Percentage' },
                                        { value: 'dollar', label: 'Dollar amount' },
                                        { value: 'lod', label: 'Low of Day (LoD)' }
                                    ]"
                                />
                                <div class="mt-2 text-sm text-gray-500 dark:text-gray-400 space-y-1">
                                    <p><strong class="text-gray-700 dark:text-gray-300">Percentage:</strong> Use a fixed percentage below/above entry price.</p>
                                    <p><strong class="text-gray-700 dark:text-gray-300">Dollar amount:</strong> Use a fixed risk per trade in dollars (e.g., $100 or $150 per trade).</p>
                                    <p><strong class="text-gray-700 dark:text-gray-300">Low of Day (LoD):</strong> Use the low price of the entry day (Qullamaggie-style swing trades). Uses Low of Day for long positions and High of Day for short positions.</p>
                                </div>
                            </div>

                            <div
                                v-if="
                                    analyticsForm.defaultStopLossType ===
                                    'percent'
                                "
                                class="py-6"
                            >
                                <label for="defaultStopLoss" class="label"
                                    >Default Stop Loss Percentage</label
                                >
                                <div class="mt-1 relative rounded-md shadow-sm">
                                    <input
                                        type="number"
                                        id="defaultStopLoss"
                                        v-model.number="
                                            analyticsForm.defaultStopLossPercent
                                        "
                                        step="0.1"
                                        min="0"
                                        max="100"
                                        placeholder="0"
                                        class="input pr-12"
                                    />
                                    <div
                                        class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none"
                                    >
                                        <span
                                            class="text-gray-500 dark:text-gray-400"
                                            >%</span
                                        >
                                    </div>
                                </div>
                                <p
                                    class="mt-2 text-sm text-gray-500 dark:text-gray-400"
                                >
                                    Automatically apply this stop loss
                                    percentage to all new and imported trades.
                                    Leave empty to not set a default. For long
                                    positions, the stop loss will be below entry
                                    price. For short positions, it will be above
                                    entry price.
                                </p>
                                <p class="mt-1 text-sm text-primary-600 dark:text-primary-400 font-medium">
                                    Example: 2% stop loss on a $100 long
                                    entry = $98 stop loss price
                                </p>
                            </div>

                            <div
                                v-if="
                                    analyticsForm.defaultStopLossType ===
                                    'dollar'
                                "
                                class="py-6"
                            >
                                <label
                                    for="defaultStopLossDollars"
                                    class="label"
                                    >Default Stop Loss (Dollars per
                                    Trade)</label
                                >
                                <div class="mt-1 relative rounded-md shadow-sm">
                                    <input
                                        type="number"
                                        id="defaultStopLossDollars"
                                        v-model.number="
                                            analyticsForm.defaultStopLossDollars
                                        "
                                        step="1"
                                        min="0"
                                        placeholder="0"
                                        class="input pr-12"
                                    />
                                    <div
                                        class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none"
                                    >
                                        <span
                                            class="text-gray-500 dark:text-gray-400"
                                            >$</span
                                        >
                                    </div>
                                </div>
                                <p
                                    class="mt-2 text-sm text-gray-500 dark:text-gray-400"
                                >
                                    Automatically apply this dollar risk per
                                    trade to all new and imported trades. Leave
                                    empty to not set a default. The stop loss
                                    price is calculated from entry and quantity:
                                    for a long, stop = entry - (dollars /
                                    quantity); for a short, stop = entry +
                                    (dollars / quantity).
                                </p>
                                <p class="mt-1 text-sm text-primary-600 dark:text-primary-400 font-medium">
                                    Example: $100 stop loss on 50 shares =
                                    $2 per share risk, so a $100 long entry
                                    becomes $98 stop loss
                                </p>
                            </div>

                            <div class="py-6">
                                <label for="defaultTakeProfitType" class="label"
                                    >Default Take Profit Type</label
                                >
                                <BaseSelect
                                    v-model="analyticsForm.defaultTakeProfitType"
                                    :options="[
                                        { value: 'percent', label: 'Percentage' },
                                        { value: 'risk_reward', label: 'Risk / reward multiple' },
                                        { value: 'dollar', label: 'Dollar amount' }
                                    ]"
                                />
                                <div class="mt-2 text-sm text-gray-500 dark:text-gray-400 space-y-1">
                                    <p><strong class="text-gray-700 dark:text-gray-300">Percentage:</strong> Set the target a fixed percentage from entry.</p>
                                    <p><strong class="text-gray-700 dark:text-gray-300">Risk / reward multiple:</strong> Base the target on the distance between entry and stop loss.</p>
                                    <p><strong class="text-gray-700 dark:text-gray-300">Dollar amount:</strong> Target a fixed gross profit for the whole trade.</p>
                                </div>
                            </div>

                            <div
                                v-if="analyticsForm.defaultTakeProfitType === 'percent'"
                                class="py-6"
                            >
                                <label for="defaultTakeProfitPercent" class="label"
                                    >Default Take Profit Percentage</label
                                >
                                <div class="mt-1 relative rounded-md shadow-sm">
                                    <input
                                        type="number"
                                        id="defaultTakeProfitPercent"
                                        v-model.number="
                                            analyticsForm.defaultTakeProfitPercent
                                        "
                                        step="0.1"
                                        min="0"
                                        max="1000"
                                        placeholder="0"
                                        class="input pr-12"
                                    />
                                    <div
                                        class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none"
                                    >
                                        <span
                                            class="text-gray-500 dark:text-gray-400"
                                            >%</span
                                        >
                                    </div>
                                </div>
                                <p
                                    class="mt-2 text-sm text-gray-500 dark:text-gray-400"
                                >
                                    Automatically apply this take profit
                                    percentage to all new and imported trades.
                                    Leave empty to not set a default. For long
                                    positions, the take profit will be above
                                    entry price. For short positions, it will be
                                    below entry price.
                                </p>
                                <p class="mt-1 text-sm text-primary-600 dark:text-primary-400 font-medium">
                                    Example: 6% take profit on a $100 long
                                    entry = $106 take profit price
                                </p>
                            </div>

                            <div
                                v-if="analyticsForm.defaultTakeProfitType === 'risk_reward'"
                                class="py-6"
                            >
                                <label for="defaultTakeProfitRMultiple" class="label"
                                    >Default Risk / Reward Multiple</label
                                >
                                <div class="mt-1 relative rounded-md shadow-sm">
                                    <input
                                        type="number"
                                        id="defaultTakeProfitRMultiple"
                                        v-model.number="analyticsForm.defaultTakeProfitRMultiple"
                                        step="0.1"
                                        min="0"
                                        max="1000"
                                        placeholder="0"
                                        class="input pr-12"
                                    />
                                    <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                        <span class="text-gray-500 dark:text-gray-400">R</span>
                                    </div>
                                </div>
                                <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                    Calculates the target from the trade's stop loss. A valid stop loss is required; manually selected stops take precedence over the default stop.
                                </p>
                                <p class="mt-1 text-sm text-primary-600 dark:text-primary-400 font-medium">
                                    Example: $250 risk at 2R = a $500 gross profit target
                                </p>
                            </div>

                            <div
                                v-if="analyticsForm.defaultTakeProfitType === 'dollar'"
                                class="py-6"
                            >
                                <label for="defaultTakeProfitDollars" class="label"
                                    >Default Take Profit (Dollars per Trade)</label
                                >
                                <div class="mt-1 relative rounded-md shadow-sm">
                                    <input
                                        type="number"
                                        id="defaultTakeProfitDollars"
                                        v-model.number="analyticsForm.defaultTakeProfitDollars"
                                        step="1"
                                        min="0"
                                        placeholder="0"
                                        class="input pr-12"
                                    />
                                    <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                        <span class="text-gray-500 dark:text-gray-400">$</span>
                                    </div>
                                </div>
                                <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                    Sets a fixed gross profit target for the entire position. Quantity and stock, option, or futures multipliers are used to calculate the target price.
                                </p>
                                <p class="mt-1 text-sm text-primary-600 dark:text-primary-400 font-medium">
                                    Example: $500 on 50 shares = a $10 move from entry
                                </p>
                            </div>

                            <div class="pt-6 flex justify-end">
                                <button
                                    type="submit"
                                    :disabled="analyticsLoading"
                                    class="btn-primary"
                                >
                                    <span
                                        v-if="analyticsLoading"
                                        class="flex items-center"
                                    >
                                        <div
                                            class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
                                        ></div>
                                        Saving...
                                    </span>
                                    <span v-else>Save Analytics Settings</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <!-- Privacy Settings -->
                <div class="card">
                    <div class="card-body">
                        <h3
                            class="text-lg font-medium text-gray-900 dark:text-white mb-6"
                        >
                            Privacy Settings
                        </h3>
                        <p
                            class="text-sm text-gray-600 dark:text-gray-400 mb-6"
                        >
                            Control who can see your trading activity and
                            profile information.
                        </p>

                        <form
                            @submit.prevent="updatePrivacySettings"
                            class="space-y-6"
                        >
                            <div
                                class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                            >
                                <div class="flex-1">
                                    <label
                                        for="publicProfile"
                                        class="block text-sm font-medium text-gray-900 dark:text-white"
                                    >
                                        Public Profile
                                    </label>
                                    <p
                                        class="mt-1 text-sm text-gray-600 dark:text-gray-400"
                                    >
                                        Allow others to view your public trades.
                                        When enabled, trades marked as "public"
                                        will be visible to all users. Your
                                        username and avatar will also be visible
                                        on public trades.
                                    </p>
                                </div>
                                <div class="ml-4 flex-shrink-0">
                                    <button
                                        type="button"
                                        @click="
                                            privacyForm.publicProfile =
                                                !privacyForm.publicProfile
                                        "
                                        :class="[
                                            privacyForm.publicProfile
                                                ? 'bg-primary-600'
                                                : 'bg-gray-200 dark:bg-gray-700',
                                            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2',
                                        ]"
                                        role="switch"
                                        :aria-checked="
                                            privacyForm.publicProfile
                                        "
                                    >
                                        <span
                                            :class="[
                                                privacyForm.publicProfile
                                                    ? 'translate-x-5'
                                                    : 'translate-x-0',
                                                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                                            ]"
                                        />
                                    </button>
                                </div>
                            </div>

                            <div class="flex justify-end">
                                <button
                                    type="submit"
                                    :disabled="privacyLoading"
                                    class="btn-primary"
                                >
                                    <span
                                        v-if="privacyLoading"
                                        class="flex items-center"
                                    >
                                        <div
                                            class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
                                        ></div>
                                        Saving...
                                    </span>
                                    <span v-else>Save Privacy Settings</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <!-- Broker Sync -->
                <div class="card">
                    <div class="card-body">
                        <h3
                            class="text-lg font-medium text-gray-900 dark:text-white mb-6"
                        >
                            Broker Sync
                        </h3>
                        <p
                            class="text-sm text-gray-600 dark:text-gray-400 mb-6"
                        >
                            Connect your brokerage accounts (Interactive
                            Brokers, Charles Schwab) to automatically sync
                            trades. Each user can configure their own broker
                            connections and auto-sync settings.
                        </p>

                        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <h4
                                class="text-sm font-medium text-gray-900 dark:text-white mb-2"
                            >
                                Automated Trade Syncing
                            </h4>
                            <p
                                class="text-sm text-gray-600 dark:text-gray-400 mb-4"
                            >
                                Set up automatic daily syncing of your trades
                                from connected brokers. Configure sync
                                frequency, time, and manage your connections.
                            </p>
                            <div class="flex justify-end">
                                <router-link
                                    to="/broker-sync"
                                    class="btn-primary"
                                >
                                    <svg
                                        class="w-4 h-4 mr-2"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                        />
                                    </svg>
                                    Manage Broker Sync
                                </router-link>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- API Documentation -->
                <div class="card">
                    <div class="card-body">
                        <h3
                            class="text-lg font-medium text-gray-900 dark:text-white mb-6"
                        >
                            API Documentation
                        </h3>
                        <p
                            class="text-sm text-gray-600 dark:text-gray-400 mb-6"
                        >
                            Access comprehensive API documentation for
                            integrating with TradeTally programmatically.
                        </p>

                        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <h4
                                class="text-sm font-medium text-gray-900 dark:text-white mb-2"
                            >
                                Interactive API Explorer
                            </h4>
                            <p
                                class="text-sm text-gray-600 dark:text-gray-400 mb-4"
                            >
                                Browse all available API endpoints, test
                                requests, and view response schemas using our
                                Swagger documentation.
                            </p>
                            <div class="flex justify-end">
                                <a
                                    :href="getApiDocsUrl()"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="btn-primary"
                                >
                                    <MdiIcon
                                        :icon="apiIcon"
                                        :size="16"
                                        class="mr-2"
                                    />
                                    Open API Docs
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- About TradeTally -->
                <div class="card">
                    <div class="card-body">
                        <h3
                            class="text-lg font-medium text-gray-900 dark:text-white mb-6"
                        >
                            About TradeTally
                        </h3>

                        <div class="space-y-4">
                            <!-- Current Version -->
                            <div
                                class="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700"
                            >
                                <div>
                                    <p
                                        class="text-sm font-medium text-gray-900 dark:text-white"
                                    >
                                        Current Version
                                    </p>
                                    <p
                                        class="text-sm text-gray-500 dark:text-gray-400"
                                    >
                                        Your installed version
                                    </p>
                                </div>
                                <span
                                    class="text-sm font-mono text-gray-900 dark:text-white"
                                    >v{{ versionStore.currentVersion }}</span
                                >
                            </div>

                            <!-- Latest Version -->
                            <div
                                class="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700"
                            >
                                <div>
                                    <p
                                        class="text-sm font-medium text-gray-900 dark:text-white"
                                    >
                                        Latest Version
                                    </p>
                                    <p
                                        class="text-sm text-gray-500 dark:text-gray-400"
                                    >
                                        {{
                                            versionStore.updateAvailable
                                                ? "Update available"
                                                : "You are up to date"
                                        }}
                                    </p>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span
                                        class="text-sm font-mono"
                                        :class="
                                            versionStore.updateAvailable
                                                ? 'text-primary-600 dark:text-primary-400'
                                                : 'text-gray-900 dark:text-white'
                                        "
                                    >
                                        v{{
                                            versionStore.latestVersion ||
                                            versionStore.currentVersion
                                        }}
                                    </span>
                                    <span
                                        v-if="versionStore.updateAvailable"
                                        class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400"
                                    >
                                        New
                                    </span>
                                </div>
                            </div>

                            <!-- Update Actions -->
                            <div
                                v-if="versionStore.updateAvailable"
                                class="pt-4"
                            >
                                <div
                                    class="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4"
                                >
                                    <div class="flex items-start">
                                        <ArrowPathIcon
                                            class="h-5 w-5 text-primary-600 dark:text-primary-400 mt-0.5"
                                        />
                                        <div class="ml-3 flex-1">
                                            <p
                                                class="text-sm font-medium text-primary-800 dark:text-primary-200"
                                            >
                                                {{
                                                    versionStore.releaseName ||
                                                    "New version available"
                                                }}
                                            </p>
                                            <p
                                                class="text-sm text-primary-700 dark:text-primary-300 mt-1"
                                            >
                                                A new version is available.
                                                Visit the release page for
                                                upgrade instructions.
                                            </p>
                                            <div class="mt-3">
                                                <a
                                                    :href="
                                                        versionStore.releaseUrl
                                                    "
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    class="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                                                >
                                                    View Release Notes
                                                    <ArrowTopRightOnSquareIcon
                                                        class="ml-2 h-4 w-4"
                                                    />
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Check for Updates Button -->
                            <div class="pt-4">
                                <button
                                    @click="checkForUpdates"
                                    :disabled="versionStore.loading"
                                    class="btn-secondary"
                                >
                                    <span
                                        v-if="versionStore.loading"
                                        class="flex items-center"
                                    >
                                        <div
                                            class="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"
                                        ></div>
                                        Checking...
                                    </span>
                                    <span v-else class="flex items-center">
                                        <ArrowPathIcon class="h-4 w-4 mr-2" />
                                        Check for Updates
                                    </span>
                                </button>
                                <p
                                    v-if="versionStore.lastChecked"
                                    class="text-xs text-gray-500 dark:text-gray-400 mt-2"
                                >
                                    Last checked:
                                    {{ versionStore.formatLastChecked() }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </template>

            <!-- AI & Integrations Tab -->
            <template v-if="activeTab === 'ai'">
                <AiProviderSettings
                    :form="aiForm"
                    :loading="aiLoading"
                    @submit="updateAISettings"
                />
                <CusipAiProviderSettings
                    :form="cusipAiForm"
                    :loading="cusipAiLoading"
                    @submit="updateCusipAISettings"
                />
                <AdminAiProviderSettings
                    v-if="authStore.user?.role === 'admin'"
                    :form="adminAiForm"
                    :loading="adminAiLoading"
                    @submit="updateAdminAISettings"
                />
                <AdminCusipAiProviderSettings
                    v-if="authStore.user?.role === 'admin'"
                    :form="adminCusipAiForm"
                    :loading="adminCusipAiLoading"
                    @submit="updateAdminCusipAISettings"
                />
            </template>

            <!-- Trading Tab -->
            <template v-if="activeTab === 'trading'">
                <!-- Trading Accounts -->
                <div class="card mb-8">
                    <div class="card-body">
                        <h3
                            class="text-lg font-medium text-gray-900 dark:text-white mb-4"
                        >
                            Trading Accounts
                        </h3>
                        <p
                            class="text-sm text-gray-600 dark:text-gray-400 mb-6"
                        >
                            Manage your brokerage accounts to associate trades
                            with specific accounts during import. Accounts help
                            you track performance across different brokers and
                            account types.
                        </p>
                        <router-link
                            to="/accounts"
                            class="btn-primary inline-flex items-center"
                        >
                            <svg
                                class="w-5 h-5 mr-2"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                                />
                            </svg>
                            Manage Accounts
                        </router-link>
                    </div>
                </div>

                <!-- Quality Grading Weights -->
                <div class="card">
                    <div class="card-body">
                        <h3
                            class="text-lg font-medium text-gray-900 dark:text-white mb-4"
                        >
                            Quality Grading Weights
                        </h3>
                        <p
                            class="text-sm text-gray-600 dark:text-gray-400 mb-4"
                        >
                            Customize how much each metric contributes to your
                            trade quality score. Stocks and options are graded
                            on separate metric sets, so each has its own
                            profile. Weights must sum to 100%. The minimum data
                            coverage setting controls how much weighted metric
                            data must be available before a score is assigned.
                            Saving immediately re-grades all trades that already
                            have a quality metric breakdown. Metrics with no available data are
                            excluded from a trade's score and the remaining
                            weights are rescaled. Futures are not graded.
                        </p>

                        <!-- Profile tabs -->
                        <div
                            class="flex space-x-2 border-b border-gray-200 dark:border-gray-700 mb-6"
                        >
                            <button
                                v-for="p in qualityProfileTabs"
                                :key="p.key"
                                type="button"
                                @click="qualityProfile = p.key"
                                class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
                                :class="
                                    qualityProfile === p.key
                                        ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                "
                            >
                                {{ p.label }}
                            </button>
                        </div>

                        <form
                            @submit.prevent="updateQualityWeights"
                            class="space-y-6"
                        >
                            <!-- Weight Sliders (driven by the active profile) -->
                            <div class="space-y-6">
                                <div
                                    v-for="metric in activeQualityMetrics"
                                    :key="metric.key"
                                >
                                    <div
                                        class="flex justify-between items-center mb-2"
                                    >
                                        <label
                                            :for="`qw-${metric.key}`"
                                            class="label text-sm"
                                            >{{ metric.label }}</label
                                        >
                                        <span
                                            class="text-sm font-medium text-gray-900 dark:text-white"
                                            >{{
                                                activeQualityWeights[metric.key]
                                            }}%</span
                                        >
                                    </div>
                                    <input
                                        :id="`qw-${metric.key}`"
                                        v-model.number="
                                            activeQualityWeights[metric.key]
                                        "
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="5"
                                        class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                    />
                                    <p
                                        class="mt-1 text-xs text-gray-500 dark:text-gray-400"
                                    >
                                        {{ metric.description }}
                                    </p>
                                </div>
                            </div>

                            <div
                                class="rounded-md border border-gray-200 dark:border-gray-700 p-4"
                            >
                                <div
                                    class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div>
                                        <label
                                            for="quality-minimum-coverage"
                                            class="label text-sm"
                                        >
                                            Minimum Data Coverage
                                        </label>
                                        <p
                                            class="mt-1 text-xs text-gray-500 dark:text-gray-400"
                                        >
                                            Lower values allow scores from less
                                            available market data. Missing
                                            metrics are still excluded and shown
                                            in the breakdown.
                                        </p>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <input
                                            id="quality-minimum-coverage"
                                            v-model.number="
                                                qualityMinimumCoverageForm[
                                                    qualityProfile
                                                ]
                                            "
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="5"
                                            class="input w-24 text-right"
                                        />
                                        <span
                                            class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                            >%</span
                                        >
                                    </div>
                                </div>
                            </div>

                            <!-- Total Display -->
                            <div
                                class="p-4 rounded-md"
                                :class="
                                    weightsTotal === 100
                                        ? 'bg-green-50 dark:bg-green-900/20'
                                        : 'bg-red-50 dark:bg-red-900/20'
                                "
                            >
                                <div class="flex justify-between items-center">
                                    <span
                                        class="text-sm font-medium"
                                        :class="
                                            weightsTotal === 100
                                                ? 'text-green-800 dark:text-green-200'
                                                : 'text-red-800 dark:text-red-200'
                                        "
                                    >
                                        Total Weight:
                                    </span>
                                    <span
                                        class="text-lg font-bold"
                                        :class="
                                            weightsTotal === 100
                                                ? 'text-green-900 dark:text-green-100'
                                                : 'text-red-900 dark:text-red-100'
                                        "
                                    >
                                        {{ weightsTotal }}%
                                    </span>
                                </div>
                                <p
                                    v-if="weightsTotal !== 100"
                                    class="text-xs text-red-600 dark:text-red-400 mt-1"
                                >
                                    Weights must sum to exactly 100%
                                </p>
                            </div>

                            <div class="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    @click="resetQualityWeights"
                                    class="btn-secondary"
                                >
                                    Reset to Defaults
                                </button>
                                <button
                                    type="submit"
                                    :disabled="
                                        qualityWeightsLoading ||
                                        weightsTotal !== 100
                                    "
                                    class="btn-primary"
                                >
                                    <span
                                        v-if="qualityWeightsLoading"
                                        class="flex items-center"
                                    >
                                        <div
                                            class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
                                        ></div>
                                        Saving...
                                    </span>
                                    <span v-else>Update {{ qualityProfile === 'option' ? 'Option' : 'Stock' }} Settings</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <!-- Trade Import Settings -->
                <div class="card">
                    <div class="card-body">
                        <h3
                            class="text-lg font-medium text-gray-900 dark:text-white mb-6"
                        >
                            Trade Import Settings
                        </h3>
                        <p
                            class="text-sm text-gray-600 dark:text-gray-400 mb-6"
                        >
                            Configure how executions are grouped when importing
                            trades from broker CSV files.
                        </p>

                        <form
                            @submit.prevent="updateTradeImportSettings"
                            class="space-y-6"
                        >
                            <!-- Trade Grouping Toggle -->
                            <div class="flex items-start">
                                <div class="flex items-center h-5">
                                    <input
                                        id="enableTradeGrouping"
                                        v-model="
                                            tradeImportForm.enableTradeGrouping
                                        "
                                        type="checkbox"
                                        class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                    />
                                </div>
                                <div class="ml-3">
                                    <label
                                        for="enableTradeGrouping"
                                        class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Enable Trade Grouping
                                    </label>
                                    <p
                                        class="text-sm text-gray-500 dark:text-gray-400 mt-1"
                                    >
                                        When enabled, multiple executions within
                                        the specified time gap will be grouped
                                        into a single trade. This is useful for
                                        scaling in/out of positions.
                                    </p>
                                </div>
                            </div>

                            <!-- Time Gap Setting -->
                            <div v-if="tradeImportForm.enableTradeGrouping">
                                <label for="tradeGroupingTimeGap" class="label"
                                    >Time Gap for Grouping (minutes)</label
                                >
                                <input
                                    id="tradeGroupingTimeGap"
                                    v-model.number="
                                        tradeImportForm.tradeGroupingTimeGapMinutes
                                    "
                                    type="number"
                                    min="1"
                                    max="1440"
                                    class="input"
                                    placeholder="60"
                                />
                                <p
                                    class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                                >
                                    Maximum time gap (in minutes) between
                                    executions to group them into the same
                                    trade. Default is 60 minutes (1 hour),
                                    following TradeSviz industry standard.
                                </p>
                            </div>

                            <div class="flex justify-end">
                                <button
                                    type="submit"
                                    :disabled="tradeImportLoading"
                                    class="btn-primary"
                                >
                                    <span
                                        v-if="tradeImportLoading"
                                        class="flex items-center"
                                    >
                                        <div
                                            class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
                                        ></div>
                                        Saving...
                                    </span>
                                    <span v-else>Update Import Settings</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <BrokerFeeSettings
                    :settings="brokerFeeSettings"
                    :form="brokerFeeForm"
                    :loading="brokerFeeLoading"
                    :editing="editingBrokerFee"
                    @submit="saveBrokerFee"
                    @edit="editBrokerFee"
                    @delete="deleteBrokerFee"
                    @cancel-edit="cancelEditBrokerFee"
                />

                <!-- Trade Enrichment -->
                <div class="card">
                    <div class="card-body">
                        <h3
                            class="text-lg font-medium text-gray-900 dark:text-white mb-4"
                        >
                            Trade Enrichment
                        </h3>
                        <p
                            class="text-sm text-gray-600 dark:text-gray-400 mb-6"
                        >
                            Enrich your existing trades with additional data and
                            analytics. This process runs in the background and
                            may take a few minutes depending on the number of
                            trades.
                        </p>

                        <div class="flex items-start justify-between">
                            <div class="flex-1">
                                <p
                                    class="text-sm font-medium text-gray-900 dark:text-white"
                                >
                                    Comprehensive Trade Enrichment
                                </p>
                                <p
                                    class="text-xs text-gray-500 dark:text-gray-400 mt-1"
                                >
                                    Enriches trades with:
                                </p>
                                <ul
                                    class="text-xs text-gray-500 dark:text-gray-400 mt-2 space-y-1 ml-4 list-disc"
                                >
                                    <li>News events and sentiment analysis</li>
                                    <li>
                                        Quality grading based on stock metrics
                                        (float, volume, price range, gap,
                                        sentiment)
                                    </li>
                                </ul>
                            </div>
                            <button
                                @click="enrichTrades"
                                :disabled="enrichmentLoading"
                                class="btn-primary ml-4 flex-shrink-0"
                            >
                                <span
                                    v-if="enrichmentLoading"
                                    class="flex items-center"
                                >
                                    <div
                                        class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
                                    ></div>
                                    Processing...
                                </span>
                                <span v-else>Enrich Trades</span>
                            </button>
                        </div>

                        <div
                            v-if="enrichmentMessage"
                            class="mt-4 p-3 rounded-md"
                            :class="
                                enrichmentSuccess
                                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                                    : 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
                            "
                        >
                            <p class="text-sm">{{ enrichmentMessage }}</p>
                        </div>

                        <div
                            class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 flex items-start justify-between"
                        >
                            <div class="flex-1">
                                <p
                                    class="text-sm font-medium text-gray-900 dark:text-white"
                                >
                                    Recalculate Setup Quality
                                </p>
                                <p
                                    class="text-xs text-gray-500 dark:text-gray-400 mt-1"
                                >
                                    Re-runs setup quality for existing trades
                                    using the current calculation model and
                                    stores any partial metric breakdowns.
                                </p>
                            </div>
                            <button
                                @click="recalculateSetupQuality"
                                :disabled="qualityRecalculationLoading"
                                class="btn-secondary ml-4 flex-shrink-0"
                            >
                                <span
                                    v-if="qualityRecalculationLoading"
                                    class="flex items-center"
                                >
                                    <div
                                        class="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600 mr-2"
                                    ></div>
                                    Recalculating...
                                </span>
                                <span v-else>Recalculate Setup Quality</span>
                            </button>
                        </div>

                        <div
                            v-if="qualityRecalculationMessage"
                            class="mt-4 p-3 rounded-md"
                            :class="
                                qualityRecalculationSuccess
                                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                                    : 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
                            "
                        >
                            <p class="text-sm">
                                {{ qualityRecalculationMessage }}
                            </p>
                        </div>
                    </div>
                </div>
            </template>

            <!-- Data Management Tab -->
            <template v-if="activeTab === 'data'">
                <DataExportImport
                    :export-loading="exportLoading"
                    :csv-export-loading="csvExportLoading"
                    :import-loading="importLoading"
                    :selected-file="selectedFile"
                    @export="exportUserData"
                    @export-csv="exportTradesToCSV"
                    @file-select="handleFileSelect"
                    @import="importUserData"
                />
            </template>

            <!-- System Logs Tab (Admin Only) -->
            <template
                v-if="activeTab === 'admin' && authStore.user?.role === 'admin'"
            >
                <LogsViewer />
            </template>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useTradesStore } from "@/stores/trades";
import { useVersionStore } from "@/stores/version";
import { useUiPreferencesStore } from "@/stores/uiPreferences";
import { useNotification } from "@/composables/useNotification";
import api from "@/services/api";
import {
    normalizeTradeChartResolution,
    readTradeChartDefaultResolution,
    TRADE_CHART_RESOLUTION_PREFERENCE_KEY,
    TRADE_CHART_RESOLUTION_OPTIONS,
} from "@/utils/tradeChartPreferences";
import { CURRENCY_OPTIONS } from "@/composables/useCurrencyFormatter";
import MdiIcon from "@/components/MdiIcon.vue";
import { mdiApi } from "@mdi/js";
import {
    ArrowPathIcon,
    ArrowTopRightOnSquareIcon,
} from "@heroicons/vue/24/outline";
import LogsViewer from "@/components/admin/LogsViewer.vue";
import BaseSelect from "@/components/common/BaseSelect.vue";
import AiProviderSettings from "@/components/settings/AiProviderSettings.vue";
import CusipAiProviderSettings from "@/components/settings/CusipAiProviderSettings.vue";
import AdminAiProviderSettings from "@/components/settings/AdminAiProviderSettings.vue";
import AdminCusipAiProviderSettings from "@/components/settings/AdminCusipAiProviderSettings.vue";
import BrokerFeeSettings from "@/components/settings/BrokerFeeSettings.vue";
import DataExportImport from "@/components/settings/DataExportImport.vue";

const authStore = useAuthStore();
const tradesStore = useTradesStore();
const versionStore = useVersionStore();
const uiPreferencesStore = useUiPreferencesStore();
const { showSuccess, showError, showDangerConfirmation } = useNotification();

// Icons
const apiIcon = mdiApi;

// Active tab
const activeTab = ref("general");

// Tabs configuration
const tabs = computed(() => {
    const baseTabs = [
        { id: "general", label: "General" },
        { id: "ai", label: "AI & Integrations" },
        { id: "trading", label: "Trading" },
        { id: "data", label: "Data Management" },
    ];

    // Add System Logs tab for admin users
    if (authStore.user?.role === "admin") {
        baseTabs.push({ id: "admin", label: "System Logs" });
    }

    return baseTabs;
});

// AI Provider Settings
const aiForm = ref({
    provider: "",
    apiKey: "",
    url: "",
    model: "",
});

const aiLoading = ref(false);

const currencyOptions = CURRENCY_OPTIONS;
const currencySelectOptions = computed(() =>
    currencyOptions.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))
);

const tradeChartResolutionOptions = TRADE_CHART_RESOLUTION_OPTIONS;

function savedTradeChartResolution(settings = null) {
    const remotePreference =
        settings?.uiPreferences?.[TRADE_CHART_RESOLUTION_PREFERENCE_KEY];
    if (remotePreference !== undefined && remotePreference !== null) {
        return normalizeTradeChartResolution(remotePreference);
    }

    return readTradeChartDefaultResolution();
}

// CUSIP AI Provider Settings
const cusipAiForm = ref({
    provider: "",
    apiKey: "",
    url: "",
    model: "",
    useMainProvider: true,
});

const cusipAiLoading = ref(false);

// Analytics Settings
const analyticsForm = ref({
    statisticsCalculation: "average",
    analyticsPositionGrouping: false,
    edgeReportEnabled: false,
    breakeven_tolerance_mode: "ticks",
    breakevenToleranceTicks: 0,
    breakeven_tolerance_dollars: 0,
    autoCloseExpiredOptions: true,
    defaultStopLossType: "percent",
    defaultStopLossPercent: null,
    defaultStopLossDollars: null,
    defaultTakeProfitType: "percent",
    defaultTakeProfitPercent: null,
    defaultTakeProfitRMultiple: null,
    defaultTakeProfitDollars: null,
    displayCurrency: "USD",
    trade_chart_default_resolution: "1",
});

const analyticsLoading = ref(false);

const breakevenToleranceModeOptions = [
    { value: "ticks", label: "Ticks" },
    { value: "dollars", label: "Dollars" },
];

const breakevenToleranceInputId = computed(() =>
    analyticsForm.value.breakeven_tolerance_mode === "dollars"
        ? "breakevenToleranceDollars"
        : "breakevenToleranceTicks",
);

const breakevenToleranceInputLabel = computed(() =>
    analyticsForm.value.breakeven_tolerance_mode === "dollars"
        ? "Dollar Amount"
        : "Default Tick Amount",
);

const breakevenToleranceDescription = computed(() => {
    if (analyticsForm.value.breakeven_tolerance_mode === "dollars") {
        return "Trades whose gross P&L falls within plus or minus this amount are counted as breakeven instead of wins or losses. This applies to stocks, options, futures, and combined multi-leg positions. Commissions and fees are ignored. Leave at 0 to count only exact breakeven trades.";
    }

    return "Trades whose gross P&L falls within this many ticks of zero are counted as breakeven instead of wins or losses. This applies to instruments with a tick size and point value, such as futures. Commissions and fees are ignored. Leave at 0 to count only trades that exit exactly at entry.";
});

// Per-instrument breakeven tolerance overrides, edited as rows then serialized
// to a { UNDERLYING: ticks } map on save.
const breakevenToleranceRows = ref([]);

function addBreakevenToleranceRow() {
    breakevenToleranceRows.value.push({ underlying: "", ticks: 0 });
}

function removeBreakevenToleranceRow(idx) {
    breakevenToleranceRows.value.splice(idx, 1);
}

function breakevenRowsFromMap(map) {
    if (!map || typeof map !== "object") return [];
    return Object.entries(map).map(([underlying, ticks]) => ({
        underlying,
        ticks: Number(ticks) || 0,
    }));
}

function breakevenMapFromRows() {
    const map = {};
    for (const row of breakevenToleranceRows.value) {
        const key = String(row.underlying || "").trim().toUpperCase();
        if (!/^[A-Z0-9]+$/.test(key)) continue;
        const ticks = Number(row.ticks);
        if (!Number.isFinite(ticks) || ticks < 0) continue;
        map[key] = ticks;
    }
    return map;
}

// Privacy Settings
const privacyForm = ref({
    publicProfile: false,
});
const privacyLoading = ref(false);

// Trade Import Settings
const tradeImportForm = ref({
    enableTradeGrouping: true,
    tradeGroupingTimeGapMinutes: 60,
});
const tradeImportLoading = ref(false);

// Broker Fee Settings
const brokerFeeSettings = ref([]);
const brokerFeeForm = ref({
    broker: "",
    instrument: "",
    commissionPerContract: 0,
    commissionPerSide: 0,
    exchangeFeePerContract: 0,
    nfaFeePerContract: 0.02,
    clearingFeePerContract: 0,
    platformFeePerContract: 0,
    notes: "",
});
const brokerFeeLoading = ref(false);
const editingBrokerFee = ref(null);

// Quality Weights Settings - per instrument profile (stock, option)
const qualityWeightsLoading = ref(false);
const qualityProfile = ref("stock");

// Metric labels and help text, keyed by API weight key
const qualityMetricInfo = {
    news: {
        label: "News Sentiment",
        description:
            "Weight for news sentiment (bullish/bearish). Options use the underlying's news.",
    },
    gap: {
        label: "Gap from Previous Close",
        description:
            "Weight for gap percentage from the previous day's close. Options use the underlying.",
    },
    relativeVolume: {
        label: "Relative Volume",
        description:
            "Weight for volume compared to the 10-day average. Options use the underlying.",
    },
    float: {
        label: "Float (Shares Outstanding)",
        description:
            "Weight for shares outstanding (lower float scores higher).",
    },
    priceRange: {
        label: "Price Range",
        description: "Weight for stock price range ($2-20 is ideal).",
    },
    dte: {
        label: "Days to Expiration",
        description:
            "Weight for time to expiration at entry (3-6 weeks scores highest).",
    },
    moneyness: {
        label: "Strike Distance (Moneyness)",
        description:
            "Weight for how far in or out of the money the strike was at entry (near the money scores highest).",
    },
};

// Per-profile metric keys + defaults, populated from the API (with fallbacks)
const qualityProfilesMeta = ref({
    stock: {
        weightKeys: ["news", "gap", "relativeVolume", "float", "priceRange"],
        defaults: { news: 30, gap: 20, relativeVolume: 20, float: 15, priceRange: 15 },
        defaultMinimumCoverage: 40,
    },
    option: {
        weightKeys: ["news", "gap", "relativeVolume", "dte", "moneyness"],
        defaults: { news: 25, gap: 15, relativeVolume: 15, dte: 25, moneyness: 20 },
        defaultMinimumCoverage: 40,
    },
});

// Current weight values per profile
const qualityProfilesForm = ref({
    stock: { news: 30, gap: 20, relativeVolume: 20, float: 15, priceRange: 15 },
    option: { news: 25, gap: 15, relativeVolume: 15, dte: 25, moneyness: 20 },
});

const qualityMinimumCoverageForm = ref({
    stock: 40,
    option: 40,
});

const qualityProfileTabs = [
    { key: "stock", label: "Stocks" },
    { key: "option", label: "Options" },
];

// The metric rows (label + description) for the active profile
const activeQualityMetrics = computed(() => {
    const meta = qualityProfilesMeta.value[qualityProfile.value];
    if (!meta) return [];
    return meta.weightKeys.map((key) => ({
        key,
        label: qualityMetricInfo[key]?.label || key,
        description: qualityMetricInfo[key]?.description || "",
    }));
});

// The weight values object the sliders bind to for the active profile
const activeQualityWeights = computed(
    () => qualityProfilesForm.value[qualityProfile.value],
);

// Computed property for total weights of the active profile
const weightsTotal = computed(() => {
    const meta = qualityProfilesMeta.value[qualityProfile.value];
    const weights = qualityProfilesForm.value[qualityProfile.value];
    if (!meta || !weights) return 0;
    return meta.weightKeys.reduce(
        (sum, key) => sum + (Number(weights[key]) || 0),
        0,
    );
});

// Admin AI Settings
const adminAiForm = ref({
    provider: "",
    apiKey: "",
    url: "",
    model: "",
    classifierEnabled: false,
    classifierProvider: "",
    classifierApiKey: "",
    classifierUrl: "",
    classifierModel: "",
});
const adminAiLoading = ref(false);

// Admin CUSIP AI Settings
const adminCusipAiForm = ref({
    provider: "",
    apiKey: "",
    url: "",
    model: "",
    useMainProvider: true,
});
const adminCusipAiLoading = ref(false);

// Export/Import Settings
const exportLoading = ref(false);
const csvExportLoading = ref(false);
const importLoading = ref(false);
const selectedFile = ref(null);

// Trade Enrichment
const enrichmentLoading = ref(false);
const enrichmentMessage = ref("");
const enrichmentSuccess = ref(false);
const qualityRecalculationLoading = ref(false);
const qualityRecalculationMessage = ref("");
const qualityRecalculationSuccess = ref(false);

// Get API docs URL
function getApiDocsUrl() {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl && apiUrl.startsWith('http')) {
        // VITE_API_URL is an absolute URL (e.g. http://localhost:3030/api)
        return apiUrl.replace(/\/api\/?$/, '') + '/api-docs';
    }
    // Relative URL or not set — use same origin
    return `${window.location.origin}/api-docs`;
}

// AI Provider Functions
async function loadAISettings() {
    try {
        const response = await api.get("/settings/ai-provider");
        aiForm.value = {
            provider: response.data.aiProvider || "",
            apiKey: response.data.aiApiKey || "",
            url: response.data.aiApiUrl || "",
            model: response.data.aiModel || "",
        };
    } catch (error) {
        console.error("Failed to load AI settings:", error);
        showError("Error", "Failed to load AI settings");
    }
}

async function updateAISettings() {
    aiLoading.value = true;
    try {
        await api.put("/settings/ai-provider", {
            aiProvider: aiForm.value.provider,
            aiApiKey: aiForm.value.apiKey,
            aiApiUrl: aiForm.value.url,
            aiModel: aiForm.value.model,
        });
        showSuccess("Success", "AI provider settings updated successfully");
    } catch (error) {
        console.error("Failed to update AI settings:", error);
        showError(
            "Error",
            error.response?.data?.error || "Failed to update AI settings",
        );
    } finally {
        aiLoading.value = false;
    }
}

// CUSIP AI Provider Functions
async function loadCusipAISettings() {
    try {
        const response = await api.get("/settings/cusip-ai-provider");
        cusipAiForm.value = {
            provider: response.data.cusipAiProvider || "",
            apiKey: response.data.cusipAiApiKey || "",
            url: response.data.cusipAiApiUrl || "",
            model: response.data.cusipAiModel || "",
            useMainProvider: response.data.useMainProvider !== false,
        };
    } catch (error) {
        console.error("Failed to load CUSIP AI settings:", error);
    }
}

async function updateCusipAISettings() {
    cusipAiLoading.value = true;
    try {
        await api.put("/settings/cusip-ai-provider", {
            cusipAiProvider: cusipAiForm.value.provider,
            cusipAiApiKey: cusipAiForm.value.apiKey,
            cusipAiApiUrl: cusipAiForm.value.url,
            cusipAiModel: cusipAiForm.value.model,
            useMainProvider: cusipAiForm.value.useMainProvider,
        });
        showSuccess(
            "Success",
            "CUSIP AI provider settings updated successfully",
        );
    } catch (error) {
        console.error("Failed to update CUSIP AI settings:", error);
        showError(
            "Error",
            error.response?.data?.error || "Failed to update CUSIP AI settings",
        );
    } finally {
        cusipAiLoading.value = false;
    }
}

// Analytics Settings Functions
async function loadAnalyticsSettings(settingsData = null) {
    try {
        const settings =
            settingsData ?? (await api.get("/settings")).data.settings;
        analyticsForm.value = {
            statisticsCalculation:
                settings.statisticsCalculation || "average",
            analyticsPositionGrouping:
                settings.analyticsPositionGrouping === true,
            edgeReportEnabled:
                settings.edgeReportEnabled === true,
            breakeven_tolerance_mode:
                settings.breakeven_tolerance_mode ??
                settings.breakevenToleranceMode ??
                "ticks",
            breakevenToleranceTicks:
                Number(settings.breakevenToleranceTicks) || 0,
            breakeven_tolerance_dollars:
                Number(
                    settings.breakeven_tolerance_dollars ??
                        settings.breakevenToleranceDollars,
                ) || 0,
            autoCloseExpiredOptions:
                settings.autoCloseExpiredOptions !== undefined
                    ? settings.autoCloseExpiredOptions
                    : true,
            defaultStopLossType:
                settings.defaultStopLossType || "percent",
            defaultStopLossPercent:
                settings.defaultStopLossPercent || null,
            defaultStopLossDollars:
                settings.defaultStopLossDollars ?? null,
            defaultTakeProfitType:
                settings.defaultTakeProfitType || "percent",
            defaultTakeProfitPercent:
                settings.defaultTakeProfitPercent || null,
            defaultTakeProfitRMultiple:
                settings.defaultTakeProfitRMultiple ?? null,
            defaultTakeProfitDollars:
                settings.defaultTakeProfitDollars ?? null,
            displayCurrency:
                settings.displayCurrency || "USD",
            trade_chart_default_resolution:
                savedTradeChartResolution(settings),
        };
        breakevenToleranceRows.value = breakevenRowsFromMap(
            settings.breakevenToleranceTicksByUnderlying,
        );
    } catch (error) {
        console.error("Failed to load analytics settings:", error);
        // Default values if loading fails
        analyticsForm.value.statisticsCalculation = "average";
        analyticsForm.value.analyticsPositionGrouping = false;
        analyticsForm.value.breakeven_tolerance_mode = "ticks";
        analyticsForm.value.breakevenToleranceTicks = 0;
        analyticsForm.value.breakeven_tolerance_dollars = 0;
        analyticsForm.value.autoCloseExpiredOptions = true;
        analyticsForm.value.defaultStopLossType = "percent";
        analyticsForm.value.defaultStopLossPercent = null;
        analyticsForm.value.defaultStopLossDollars = null;
        analyticsForm.value.defaultTakeProfitType = "percent";
        analyticsForm.value.defaultTakeProfitPercent = null;
        analyticsForm.value.defaultTakeProfitRMultiple = null;
        analyticsForm.value.defaultTakeProfitDollars = null;
        analyticsForm.value.displayCurrency = "USD";
        analyticsForm.value.trade_chart_default_resolution =
            savedTradeChartResolution();
    }
}

async function updateAnalyticsSettings() {
    analyticsLoading.value = true;
    try {
        await uiPreferencesStore.init();
        await api.put("/settings", {
            statisticsCalculation: analyticsForm.value.statisticsCalculation,
            analyticsPositionGrouping:
                analyticsForm.value.analyticsPositionGrouping === true,
            edgeReportEnabled:
                analyticsForm.value.edgeReportEnabled === true,
            breakeven_tolerance_mode:
                analyticsForm.value.breakeven_tolerance_mode,
            breakevenToleranceTicks:
                Number(analyticsForm.value.breakevenToleranceTicks) || 0,
            breakeven_tolerance_dollars:
                Number(analyticsForm.value.breakeven_tolerance_dollars) || 0,
            breakevenToleranceTicksByUnderlying: breakevenMapFromRows(),
            autoCloseExpiredOptions:
                analyticsForm.value.autoCloseExpiredOptions,
            defaultStopLossType:
                analyticsForm.value.defaultStopLossType || "percent",
            defaultStopLossPercent:
                analyticsForm.value.defaultStopLossPercent || null,
            defaultStopLossDollars:
                analyticsForm.value.defaultStopLossDollars ?? null,
            defaultTakeProfitType:
                analyticsForm.value.defaultTakeProfitType || "percent",
            defaultTakeProfitPercent:
                analyticsForm.value.defaultTakeProfitPercent || null,
            defaultTakeProfitRMultiple:
                analyticsForm.value.defaultTakeProfitRMultiple ?? null,
            defaultTakeProfitDollars:
                analyticsForm.value.defaultTakeProfitDollars ?? null,
            displayCurrency:
                analyticsForm.value.displayCurrency || "USD",
        });

        const chartResolution = normalizeTradeChartResolution(
            analyticsForm.value.trade_chart_default_resolution,
        );
        analyticsForm.value.trade_chart_default_resolution = chartResolution;
        localStorage.setItem(
            TRADE_CHART_RESOLUTION_PREFERENCE_KEY,
            chartResolution,
        );
        uiPreferencesStore.notifyChanged(
            TRADE_CHART_RESOLUTION_PREFERENCE_KEY,
            chartResolution,
        );
        await uiPreferencesStore.flush();

        // Stop-loss and take-profit defaults can backfill existing trades.
        await tradesStore.fetchTrades();
        await tradesStore.fetchAnalytics();

        // Re-fetch user so the auth store picks up the new display_currency
        await authStore.fetchUser();
        showSuccess("Success", "Analytics preferences updated successfully");
    } catch (error) {
        console.error("Failed to update analytics settings:", error);
        showError(
            "Error",
            error.response?.data?.error ||
                "Failed to update analytics settings",
        );
    } finally {
        analyticsLoading.value = false;
    }
}

// Privacy Settings Functions
async function loadPrivacySettings(settingsData = null) {
    try {
        const settings =
            settingsData ?? (await api.get("/settings")).data.settings;

        privacyForm.value = {
            publicProfile: settings.publicProfile ?? false,
        };
    } catch (error) {
        console.error("Failed to load privacy settings:", error);
        // Default to false if loading fails
        privacyForm.value.publicProfile = false;
    }
}

async function updatePrivacySettings() {
    privacyLoading.value = true;
    try {
        await api.put("/settings", {
            publicProfile: privacyForm.value.publicProfile,
        });

        // Refresh user data to update settings in auth store
        await authStore.fetchUser();

        showSuccess("Success", "Privacy settings updated successfully");
    } catch (error) {
        console.error("Failed to update privacy settings:", error);
        showError(
            "Error",
            error.response?.data?.error || "Failed to update privacy settings",
        );
    } finally {
        privacyLoading.value = false;
    }
}

// Trade Import Settings Functions
async function loadTradeImportSettings(settingsData = null) {
    try {
        const settings =
            settingsData ?? (await api.get("/settings")).data.settings;

        tradeImportForm.value = {
            enableTradeGrouping: settings.enableTradeGrouping ?? true,
            tradeGroupingTimeGapMinutes:
                settings.tradeGroupingTimeGapMinutes ?? 60,
        };
    } catch (error) {
        console.error("Failed to load trade import settings:", error);
        // Default values if loading fails
        tradeImportForm.value.enableTradeGrouping = true;
        tradeImportForm.value.tradeGroupingTimeGapMinutes = 60;
    }
}

async function updateTradeImportSettings() {
    tradeImportLoading.value = true;
    try {
        await api.put("/settings", {
            enableTradeGrouping: tradeImportForm.value.enableTradeGrouping,
            tradeGroupingTimeGapMinutes:
                tradeImportForm.value.tradeGroupingTimeGapMinutes,
        });
        showSuccess("Success", "Trade import settings updated successfully");
    } catch (error) {
        console.error("Failed to update trade import settings:", error);
        showError(
            "Error",
            error.response?.data?.error ||
                "Failed to update trade import settings",
        );
    } finally {
        tradeImportLoading.value = false;
    }
}

// Fetch /settings once and hydrate every section that reads from it.
// The individual loaders keep their optional-fetch fallback so they can
// still be called standalone (e.g. to refresh a single section).
async function loadAllSettings() {
    let settings = null;
    try {
        const response = await api.get("/settings");
        settings = response.data.settings;
    } catch (error) {
        console.error("Failed to load settings:", error);
        // Leave settings null - each loader retries its own fetch and falls
        // back to its catch-block defaults if that fails too
    }
    await Promise.all([
        loadAnalyticsSettings(settings),
        loadPrivacySettings(settings),
        loadTradeImportSettings(settings),
    ]);
}

// Broker Fee Settings Functions
async function loadBrokerFeeSettings() {
    try {
        const response = await api.get("/settings/broker-fees");
        if (response.data.success) {
            brokerFeeSettings.value = response.data.data;
        }
    } catch (error) {
        console.error("Failed to load broker fee settings:", error);
    }
}

function editBrokerFee(setting) {
    editingBrokerFee.value = setting.id;
    // Use nullish coalescing (??) instead of || to preserve 0 values
    // This ensures that if user explicitly set a fee to 0, it stays 0
    brokerFeeForm.value = {
        broker: setting.broker,
        instrument: setting.instrument || "",
        commissionPerContract: setting.commissionPerContract ?? 0,
        commissionPerSide: setting.commissionPerSide ?? 0,
        exchangeFeePerContract: setting.exchangeFeePerContract ?? 0,
        nfaFeePerContract: setting.nfaFeePerContract ?? 0,
        clearingFeePerContract: setting.clearingFeePerContract ?? 0,
        platformFeePerContract: setting.platformFeePerContract ?? 0,
        notes: setting.notes || "",
    };
}

function cancelEditBrokerFee() {
    editingBrokerFee.value = null;
    resetBrokerFeeForm();
}

function resetBrokerFeeForm() {
    brokerFeeForm.value = {
        broker: "",
        instrument: "",
        commissionPerContract: 0,
        commissionPerSide: 0,
        exchangeFeePerContract: 0,
        nfaFeePerContract: 0.02,
        clearingFeePerContract: 0,
        platformFeePerContract: 0,
        notes: "",
    };
}

async function saveBrokerFee() {
    if (!brokerFeeForm.value.broker) {
        showError("Error", "Please select a broker");
        return;
    }

    brokerFeeLoading.value = true;
    try {
        await api.post("/settings/broker-fees", brokerFeeForm.value);
        showSuccess(
            "Success",
            `Broker fee settings for ${brokerFeeForm.value.broker} saved successfully`,
        );
        await loadBrokerFeeSettings();
        cancelEditBrokerFee();
    } catch (error) {
        console.error("Failed to save broker fee settings:", error);
        showError(
            "Error",
            error.response?.data?.error || "Failed to save broker fee settings",
        );
    } finally {
        brokerFeeLoading.value = false;
    }
}

function deleteBrokerFee(id) {
    showDangerConfirmation(
        "Delete Broker Fee",
        "Are you sure you want to delete this broker fee configuration?",
        async () => {
            try {
                await api.delete(`/settings/broker-fees/${id}`);
                showSuccess("Success", "Broker fee settings deleted");
                await loadBrokerFeeSettings();
            } catch (error) {
                console.error("Failed to delete broker fee settings:", error);
                showError(
                    "Error",
                    error.response?.data?.error ||
                        "Failed to delete broker fee settings",
                );
            }
        },
    );
}

// Quality Weights Functions
async function fetchQualityWeights() {
    try {
        const response = await api.get("/users/quality-weights");
        const data = response.data || {};
        if (data.profilesMeta) {
            qualityProfilesMeta.value = data.profilesMeta;
        }
        if (data.profiles) {
            // Seed each profile's form from the API, keeping only its keys
            const next = {};
            for (const [profileType, meta] of Object.entries(
                qualityProfilesMeta.value,
            )) {
                const stored = data.profiles[profileType] || {};
                const weights = {};
                for (const key of meta.weightKeys) {
                    weights[key] =
                        stored[key] != null
                            ? stored[key]
                            : meta.defaults[key];
                }
                next[profileType] = weights;
            }
            qualityProfilesForm.value = next;
        }
        if (data.minimumCoverage) {
            const nextCoverage = { ...qualityMinimumCoverageForm.value };
            for (const [profileType, meta] of Object.entries(
                qualityProfilesMeta.value,
            )) {
                const value = Number(data.minimumCoverage[profileType]);
                nextCoverage[profileType] = Number.isFinite(value)
                    ? value
                    : meta.defaultMinimumCoverage || 40;
            }
            qualityMinimumCoverageForm.value = nextCoverage;
        }
    } catch (error) {
        console.error("Failed to fetch quality weights:", error);
        // Don't show error to user, just use defaults
    }
}

async function updateQualityWeights() {
    qualityWeightsLoading.value = true;
    try {
        const profileType = qualityProfile.value;
        const response = await api.put("/users/quality-weights", {
            profile: profileType,
            weights: { ...qualityProfilesForm.value[profileType] },
            minimumCoverage: qualityMinimumCoverageForm.value[profileType],
        });
        const regraded = response.data?.regradedCount;
        showSuccess(
            "Success",
            regraded > 0
                ? `Quality grading settings updated. ${regraded} trade${regraded === 1 ? "" : "s"} re-graded with the new settings.`
                : "Quality grading settings updated successfully",
        );
    } catch (error) {
        console.error("Failed to update quality weights:", error);
        showError(
            "Error",
            error.response?.data?.error || "Failed to update quality weights",
        );
    } finally {
        qualityWeightsLoading.value = false;
    }
}

function resetQualityWeights() {
    const profileType = qualityProfile.value;
    const meta = qualityProfilesMeta.value[profileType];
    if (!meta) return;
    qualityProfilesForm.value[profileType] = { ...meta.defaults };
    qualityMinimumCoverageForm.value[profileType] =
        meta.defaultMinimumCoverage || 40;
}

// Admin AI Settings Functions
async function fetchAdminAISettings() {
    try {
        const response = await api.get("/settings/admin/ai");
        adminAiForm.value = {
            provider: response.data.aiProvider || "",
            apiKey: response.data.aiApiKey || "",
            url: response.data.aiApiUrl || "",
            model: response.data.aiModel || "",
            classifierEnabled: response.data.aiClassifierEnabled === true,
            classifierProvider: response.data.aiClassifierProvider || "",
            classifierApiKey: response.data.aiClassifierApiKey || "",
            classifierUrl: response.data.aiClassifierApiUrl || "",
            classifierModel: response.data.aiClassifierModel || "",
        };
    } catch (error) {
        console.error("Failed to fetch admin AI settings:", error);
        showError("Error", "Failed to load admin AI settings");
    }
}

async function updateAdminAISettings() {
    adminAiLoading.value = true;
    try {
        await api.put("/settings/admin/ai", {
            aiProvider: adminAiForm.value.provider,
            aiApiKey: adminAiForm.value.apiKey,
            aiApiUrl: adminAiForm.value.url,
            aiModel: adminAiForm.value.model,
            aiClassifierEnabled: adminAiForm.value.classifierEnabled,
            aiClassifierProvider: adminAiForm.value.classifierProvider,
            aiClassifierApiKey: adminAiForm.value.classifierApiKey,
            aiClassifierApiUrl: adminAiForm.value.classifierUrl,
            aiClassifierModel: adminAiForm.value.classifierModel,
        });
        showSuccess(
            "Success",
            "Admin AI provider settings updated successfully",
        );
    } catch (error) {
        console.error("Failed to update admin AI settings:", error);
        showError(
            "Error",
            error.response?.data?.error || "Failed to update admin AI settings",
        );
    } finally {
        adminAiLoading.value = false;
    }
}

// Admin CUSIP AI Settings Functions
async function fetchAdminCusipAISettings() {
    try {
        const response = await api.get("/settings/admin/cusip-ai");
        adminCusipAiForm.value = {
            provider: response.data.cusipAiProvider || "",
            apiKey: response.data.cusipAiApiKey || "",
            url: response.data.cusipAiApiUrl || "",
            model: response.data.cusipAiModel || "",
            useMainProvider: response.data.useMainProvider !== false,
        };
    } catch (error) {
        console.error("Failed to fetch admin CUSIP AI settings:", error);
    }
}

async function updateAdminCusipAISettings() {
    adminCusipAiLoading.value = true;
    try {
        await api.put("/settings/admin/cusip-ai", {
            cusipAiProvider: adminCusipAiForm.value.provider,
            cusipAiApiKey: adminCusipAiForm.value.apiKey,
            cusipAiApiUrl: adminCusipAiForm.value.url,
            cusipAiModel: adminCusipAiForm.value.model,
            useMainProvider: adminCusipAiForm.value.useMainProvider,
        });
        showSuccess(
            "Success",
            "Admin CUSIP AI provider settings updated successfully",
        );
    } catch (error) {
        console.error("Failed to update admin CUSIP AI settings:", error);
        showError(
            "Error",
            error.response?.data?.error ||
                "Failed to update admin CUSIP AI settings",
        );
    } finally {
        adminCusipAiLoading.value = false;
    }
}

// Export/Import Functions
async function exportUserData() {
    exportLoading.value = true;
    try {
        const response = await api.get("/settings/export", {
            responseType: "blob",
        });

        // Create a download link
        const blob = new Blob([response.data], { type: "application/json" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;

        // Generate filename with current date
        const today = new Date().toISOString().split("T")[0];
        link.download = `tradetally-export-${today}.json`;

        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        showSuccess(
            "Export Complete",
            "Your data has been exported successfully",
        );
    } catch (error) {
        console.error("Export failed:", error);
        showError(
            "Export Failed",
            error.response?.data?.error || "Failed to export user data",
        );
    } finally {
        exportLoading.value = false;
    }
}

async function exportTradesToCSV() {
    csvExportLoading.value = true;
    try {
        const response = await api.get("/trades/export/csv", {
            responseType: "blob",
        });

        // Create download link
        const blob = new Blob([response.data], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;

        // Get filename from Content-Disposition header or use default
        const contentDisposition = response.headers["content-disposition"];
        let filename = "tradetally-export.csv";
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="(.+)"/);
            if (match) filename = match[1];
        }

        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        showSuccess(
            "Export Complete",
            "Your trades have been exported to CSV successfully",
        );
    } catch (error) {
        console.error("CSV export failed:", error);
        showError(
            "Export Failed",
            error.response?.data?.error || "Failed to export trades to CSV",
        );
    } finally {
        csvExportLoading.value = false;
    }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        selectedFile.value = file;
    }
}

async function importUserData() {
    if (!selectedFile.value) {
        showError("No File Selected", "Please select a file to import");
        return;
    }

    importLoading.value = true;
    try {
        const formData = new FormData();
        formData.append("file", selectedFile.value);

        const response = await api.post("/settings/import", formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });

        const { tradesAdded, tagsAdded, equityAdded } = response.data;
        showSuccess(
            "Import Complete",
            `Successfully imported ${tradesAdded} trades, ${tagsAdded} tags, and ${equityAdded} equity records`,
        );

        // Clear the selected file
        selectedFile.value = null;
        // Reset the file input
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) fileInput.value = "";
    } catch (error) {
        console.error("Import failed:", error);
        showError(
            "Import Failed",
            error.response?.data?.error || "Failed to import user data",
        );
    } finally {
        importLoading.value = false;
    }
}

async function enrichTrades() {
    enrichmentLoading.value = true;
    enrichmentMessage.value = "";
    enrichmentSuccess.value = false;

    try {
        const response = await api.post("/users/enrich-trades");

        enrichmentSuccess.value = true;
        enrichmentMessage.value = response.data.message;

        if (response.data.tradesQueued > 0) {
            showSuccess(
                "Enrichment Started",
                `Processing ${response.data.tradesQueued} trades in the background. This may take a few minutes.`,
            );
        } else {
            showSuccess(
                "All Set",
                "All your trades are already enriched with news and current setup quality data.",
            );
        }
    } catch (error) {
        console.error("Enrichment failed:", error);
        enrichmentSuccess.value = false;
        enrichmentMessage.value =
            error.response?.data?.error || "Failed to start enrichment process";
        showError("Enrichment Failed", enrichmentMessage.value);
    } finally {
        enrichmentLoading.value = false;
    }
}

async function recalculateSetupQuality() {
    qualityRecalculationLoading.value = true;
    qualityRecalculationMessage.value = "";
    qualityRecalculationSuccess.value = false;

    try {
        const response = await api.post("/trades/quality/all");

        qualityRecalculationSuccess.value = true;
        qualityRecalculationMessage.value = response.data.message;
        showSuccess(
            "Recalculation Started",
            response.data.message || "Setup quality recalculation started in the background.",
        );
    } catch (error) {
        console.error("Setup quality recalculation failed:", error);
        qualityRecalculationSuccess.value = false;
        qualityRecalculationMessage.value =
            error.response?.data?.error || "Failed to start setup quality recalculation";
        showError("Recalculation Failed", qualityRecalculationMessage.value);
    } finally {
        qualityRecalculationLoading.value = false;
    }
}

// Version check
async function checkForUpdates() {
    await versionStore.checkForUpdates(true); // Force check
}

onMounted(() => {
    loadAISettings();
    loadCusipAISettings();
    loadAllSettings();
    loadBrokerFeeSettings();
    fetchQualityWeights();

    // Load admin AI settings if user is admin
    if (authStore.user?.role === "admin") {
        fetchAdminAISettings();
        fetchAdminCusipAISettings();
    }
});
</script>
