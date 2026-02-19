<template>
    <div class="tick-data-chart">
        <div class="mb-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Price Action Analysis
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
                Historical tick data around the revenge trade entry time
            </p>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="flex items-center justify-center h-64">
            <div
                class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"
            ></div>
            <span class="ml-2 text-gray-600 dark:text-gray-400"
                >Loading tick data...</span
            >
        </div>

        <!-- Error State -->
        <div
            v-else-if="error"
            class="bg-red-50 border border-red-200 rounded-lg p-4"
        >
            <div class="flex">
                <div class="text-red-500 mr-3">
                    <svg
                        class="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                </div>
                <div>
                    <h4 class="text-sm font-medium text-red-800">
                        Unable to load tick data
                    </h4>
                    <p class="text-sm text-red-700 mt-1">{{ error }}</p>
                </div>
            </div>
        </div>

        <!-- Chart Container -->
        <div v-else-if="chartData" class="space-y-6">
            <!-- Chart -->
            <div
                class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
                <div ref="chartContainer" class="w-full h-64"></div>
            </div>

            <!-- Analysis Summary -->
            <div v-if="analysis" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                    class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                >
                    <h4
                        class="text-sm font-medium text-gray-900 dark:text-white mb-3"
                    >
                        Price Movement
                    </h4>
                    <div class="space-y-2">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400"
                                >Trend before entry:</span
                            >
                            <span
                                :class="
                                    getTrendColor(analysis.price_trend_before)
                                "
                                class="font-medium"
                            >
                                {{ formatTrend(analysis.price_trend_before) }}
                            </span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400"
                                >Trend after entry:</span
                            >
                            <span
                                :class="
                                    getTrendColor(analysis.price_trend_after)
                                "
                                class="font-medium"
                            >
                                {{ formatTrend(analysis.price_trend_after) }}
                            </span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400"
                                >Entry price:</span
                            >
                            <span
                                class="font-medium text-gray-900 dark:text-white"
                            >
                                ${{ analysis.price_at_entry?.toFixed(2) }}
                            </span>
                        </div>
                    </div>
                </div>

                <div
                    class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                >
                    <h4
                        class="text-sm font-medium text-gray-900 dark:text-white mb-3"
                    >
                        Behavioral Analysis
                    </h4>
                    <div class="space-y-2">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400"
                                >Entry timing score:</span
                            >
                            <span
                                class="font-medium"
                                :class="
                                    getScoreColor(analysis.entry_timing_score)
                                "
                            >
                                {{
                                    (analysis.entry_timing_score * 100).toFixed(
                                        0,
                                    )
                                }}%
                            </span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400"
                                >Chasing momentum:</span
                            >
                            <span
                                class="font-medium"
                                :class="
                                    analysis.was_chasing_momentum
                                        ? 'text-red-600'
                                        : 'text-green-600'
                                "
                            >
                                {{
                                    analysis.was_chasing_momentum ? "Yes" : "No"
                                }}
                            </span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400"
                                >Fighting trend:</span
                            >
                            <span
                                class="font-medium"
                                :class="
                                    analysis.was_fighting_trend
                                        ? 'text-red-600'
                                        : 'text-green-600'
                                "
                            >
                                {{ analysis.was_fighting_trend ? "Yes" : "No" }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Insights -->
            <div
                v-if="insights.length > 0"
                class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4"
            >
                <h4
                    class="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2"
                >
                    Key Insights
                </h4>
                <ul class="space-y-1">
                    <li
                        v-for="insight in insights"
                        :key="insight"
                        class="text-sm text-blue-800 dark:text-blue-300"
                    >
                        • {{ insight }}
                    </li>
                </ul>
            </div>
        </div>
    </div>
</template>

<script>
import { ref, onMounted, onUnmounted, computed } from "vue";

export default {
    name: "TickDataChart",
    props: {
        tickData: {
            type: Object,
            required: true,
        },
        analysis: {
            type: Object,
            default: null,
        },
        symbol: {
            type: String,
            required: true,
        },
    },
    setup(props) {
        const chartContainer = ref(null);
        const loading = ref(false);
        const error = ref(null);
        const chart = ref(null);

        // Computed properties
        const chartData = computed(() => {
            if (
                !props.tickData ||
                !props.tickData.t ||
                props.tickData.t.length === 0
            ) {
                return null;
            }

            // Convert tick data to chart format
            const data = [];
            for (let i = 0; i < props.tickData.t.length; i++) {
                data.push({
                    time: props.tickData.t[i],
                    price: props.tickData.p[i],
                    volume: props.tickData.v[i] || 0,
                });
            }

            return data.sort((a, b) => a.time - b.time);
        });

        const insights = computed(() => {
            if (!props.analysis) return [];

            const insights = [];

            if (props.analysis.was_chasing_momentum) {
                insights.push(
                    "Trade appears to be chasing momentum - entry near price peak",
                );
            }

            if (props.analysis.was_fighting_trend) {
                insights.push("Trade was fighting the prevailing trend");
            }

            if (props.analysis.entry_timing_score < 0.3) {
                insights.push(
                    "Poor entry timing - consider waiting for better setups",
                );
            } else if (props.analysis.entry_timing_score > 0.7) {
                insights.push("Good entry timing based on price action");
            }

            if (
                props.analysis.price_trend_before === "down" &&
                props.analysis.price_trend_after === "down"
            ) {
                insights.push(
                    "Price continued falling after entry - may indicate catching a falling knife",
                );
            }

            return insights;
        });

        // Methods
        const getTrendColor = (trend) => {
            const colors = {
                up: "text-green-600",
                down: "text-red-600",
                sideways: "text-gray-600",
            };
            return colors[trend] || "text-gray-600";
        };

        const formatTrend = (trend) => {
            const formats = {
                up: "Upward",
                down: "Downward",
                sideways: "Sideways",
                unknown: "Unknown",
            };
            return formats[trend] || "Unknown";
        };

        const getScoreColor = (score) => {
            if (score >= 0.7) return "text-green-600";
            if (score >= 0.4) return "text-yellow-600";
            return "text-red-600";
        };

        const createChart = () => {
            if (!chartContainer.value || !chartData.value) return;

            // Simple HTML5 Canvas chart implementation
            const canvas = document.createElement("canvas");
            canvas.width = chartContainer.value.clientWidth;
            canvas.height = 256;
            canvas.style.width = "100%";
            canvas.style.height = "256px";

            chartContainer.value.innerHTML = "";
            chartContainer.value.appendChild(canvas);

            const ctx = canvas.getContext("2d");
            const data = chartData.value;

            if (data.length === 0) return;

            // Calculate chart dimensions
            const padding = 40;
            const chartWidth = canvas.width - padding * 2;
            const chartHeight = canvas.height - padding * 2;

            // Find min/max values
            const minPrice = Math.min(...data.map((d) => d.price));
            const maxPrice = Math.max(...data.map((d) => d.price));
            const minTime = Math.min(...data.map((d) => d.time));
            const maxTime = Math.max(...data.map((d) => d.time));

            // Helper functions
            const getX = (time) =>
                padding + ((time - minTime) / (maxTime - minTime)) * chartWidth;
            const getY = (price) =>
                padding +
                (1 - (price - minPrice) / (maxPrice - minPrice)) * chartHeight;

            // Draw background
            ctx.fillStyle = "#f9fafb";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw grid lines
            ctx.strokeStyle = "#e5e7eb";
            ctx.lineWidth = 1;

            // Horizontal grid lines
            for (let i = 0; i <= 5; i++) {
                const y = padding + (i / 5) * chartHeight;
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(padding + chartWidth, y);
                ctx.stroke();
            }

            // Vertical grid lines
            for (let i = 0; i <= 5; i++) {
                const x = padding + (i / 5) * chartWidth;
                ctx.beginPath();
                ctx.moveTo(x, padding);
                ctx.lineTo(x, padding + chartHeight);
                ctx.stroke();
            }

            // Draw price line
            ctx.strokeStyle = "#3b82f6";
            ctx.lineWidth = 2;
            ctx.beginPath();

            for (let i = 0; i < data.length; i++) {
                const x = getX(data[i].time);
                const y = getY(data[i].price);

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();

            // Draw entry point if analysis is available
            if (props.analysis && props.analysis.price_at_entry) {
                const entryTime = props.analysis.targetTime
                    ? props.analysis.targetTime / 1000
                    : (minTime + maxTime) / 2;
                const entryX = getX(entryTime);
                const entryY = getY(props.analysis.price_at_entry);

                // Draw vertical line for entry time
                ctx.strokeStyle = "#ef4444";
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(entryX, padding);
                ctx.lineTo(entryX, padding + chartHeight);
                ctx.stroke();
                ctx.setLineDash([]);

                // Draw entry point
                ctx.fillStyle = "#ef4444";
                ctx.beginPath();
                ctx.arc(entryX, entryY, 6, 0, 2 * Math.PI);
                ctx.fill();
            }

            // Draw labels
            ctx.fillStyle = "#374151";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";

            // Price labels
            for (let i = 0; i <= 5; i++) {
                const price = minPrice + (i / 5) * (maxPrice - minPrice);
                const y = padding + (1 - i / 5) * chartHeight;
                ctx.fillText(`$${price.toFixed(2)}`, padding - 20, y + 4);
            }

            // Time labels
            for (let i = 0; i <= 5; i++) {
                const time = minTime + (i / 5) * (maxTime - minTime);
                const x = padding + (i / 5) * chartWidth;
                const date = new Date(time * 1000);
                const timeStr = date.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                });
                ctx.fillText(timeStr, x, padding + chartHeight + 20);
            }

            // Chart title
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.fillText(`${props.symbol} Price Action`, canvas.width / 2, 20);
        };

        // Lifecycle
        onMounted(() => {
            if (chartData.value) {
                createChart();
            }
        });

        onUnmounted(() => {
            if (chart.value) {
                chart.value.destroy();
            }
        });

        // Watch for data changes
        const updateChart = () => {
            if (chartData.value) {
                createChart();
            }
        };

        // Expose methods for parent component
        const refreshChart = () => {
            updateChart();
        };

        return {
            chartContainer,
            loading,
            error,
            chartData,
            insights,
            getTrendColor,
            formatTrend,
            getScoreColor,
            refreshChart,
        };
    },
};
</script>

<style scoped>
.tick-data-chart {
    /* Component-specific styles */
}
</style>
