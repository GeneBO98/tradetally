<template>
    <section class="card" aria-labelledby="session-timeline-title">
        <div class="card-body">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div class="flex items-center gap-2">
                        <h2 id="session-timeline-title" class="text-lg font-medium text-gray-900 dark:text-white">Session activity timeline</h2>
                        <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">Review</span>
                    </div>
                    <p class="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">See when entries clustered around losses and compare that activity with your own recent sessions.</p>
                </div>
                <div v-if="timeline && timeline.session_date" class="flex items-center gap-2 text-sm">
                    <button type="button" class="rounded-md border border-gray-300 px-2.5 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800" :disabled="!previousDate" aria-label="Previous active session" @click="$emit('date-change', previousDate)">Previous</button>
                    <div class="relative" @keydown.esc="calendarOpen = false">
                        <button
                            type="button"
                            class="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                            aria-haspopup="dialog"
                            :aria-expanded="calendarOpen"
                            aria-label="Choose session date"
                            @click="calendarOpen = !calendarOpen"
                        >
                            <svg class="h-4 w-4 text-primary-600 dark:text-primary-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6.75 3v3m10.5-3v3M4.5 9.25h15M6 5.25h12A1.5 1.5 0 0 1 19.5 6.75v11.5A1.5 1.5 0 0 1 18 19.75H6a1.5 1.5 0 0 1-1.5-1.5V6.75A1.5 1.5 0 0 1 6 5.25Z" /></svg>
                            {{ formatDate(timeline.session_date) }}
                            <svg class="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clip-rule="evenodd" /></svg>
                        </button>
                        <div v-if="calendarOpen" class="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-800" role="dialog" aria-label="Choose a session date" @click.stop>
                            <div class="mb-3 flex items-center justify-between">
                                <button type="button" class="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-700" :disabled="!canMoveToPreviousMonth" aria-label="Previous month" @click="moveMonth(-1)"><svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L9.832 9l2.938 2.71a.75.75 0 1 1-1.04 1.08l-3.49-3.25a.75.75 0 0 1 0-1.08l3.49-3.25a.75.75 0 0 1 1.06.02Z" clip-rule="evenodd" /></svg></button>
                                <div class="text-sm font-semibold text-gray-900 dark:text-white">{{ calendarMonthLabel }}</div>
                                <button type="button" class="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-700" :disabled="!canMoveToNextMonth" aria-label="Next month" @click="moveMonth(1)"><svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L10.168 11 7.23 8.29a.75.75 0 1 1 1.04-1.08l3.49 3.25a.75.75 0 0 1 0 1.08l-3.49 3.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd" /></svg></button>
                            </div>
                            <div class="mb-1 grid grid-cols-7 text-center text-[0.65rem] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500"><span v-for="day in weekdays" :key="day">{{ day }}</span></div>
                            <div class="grid grid-cols-7 gap-1" role="grid">
                                <button v-for="day in calendarDays" :key="day.date" type="button" role="gridcell" :disabled="!day.isActive" :aria-label="day.isActive ? `Choose ${formatDate(day.date)}${day.isAnomalous ? ', higher activity after a loss' : ''}` : `${formatDate(day.date)}, no session activity`" :aria-current="day.isSelected ? 'date' : undefined" class="relative flex h-8 items-center justify-center rounded-md text-xs transition-colors disabled:cursor-default" :class="[day.isCurrentMonth ? 'text-gray-700 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600', day.isActive ? 'cursor-pointer font-semibold hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-primary-900/30 dark:hover:text-primary-200' : '', day.isSelected ? 'bg-primary-600 text-white hover:bg-primary-700 hover:text-white dark:bg-primary-500 dark:hover:bg-primary-400' : '', day.isAnomalous && !day.isSelected ? 'ring-2 ring-amber-400 ring-offset-1 dark:ring-offset-gray-800' : '']" @click="chooseDate(day.date)">{{ Number(day.date.slice(-2)) }}<span v-if="day.isActive && !day.isSelected" class="absolute bottom-0.5 h-1 w-1 rounded-full" :class="day.isAnomalous ? 'bg-amber-500' : 'bg-primary-500'" aria-hidden="true"></span></button>
                            </div>
                            <p class="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">Dots mark sessions with entries. Amber dots mark higher-than-typical activity after a loss.</p>
                        </div>
                    </div>
                    <button type="button" class="rounded-md border border-gray-300 px-2.5 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800" :disabled="!nextDate" aria-label="Next active session" @click="$emit('date-change', nextDate)">Next</button>
                </div>
            </div>

            <div v-if="loading" class="mt-6 flex h-72 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700"><div class="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400"><div class="h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" aria-hidden="true"></div>Loading session activity…</div></div>
            <div v-else-if="error" class="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200"><div class="flex items-center justify-between gap-3"><span>{{ error }}</span><button type="button" class="font-medium text-primary-700 underline dark:text-primary-300" @click="$emit('retry')">Retry</button></div></div>
            <div v-else-if="!timeline || !timeline.session_date" class="mt-6 rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">No session activity is available for the selected date range.</div>
            <template v-else>
                <div class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{{ formatDate(timeline.session_date) }} · {{ timeline.timezone }}</span><span>{{ timeline.trades.length }} entries</span>
                </div>
                <div class="mt-4 rounded-lg border border-primary-100 bg-primary-50/70 px-4 py-3 dark:border-primary-900/50 dark:bg-primary-900/20">
                    <p class="text-sm font-medium text-gray-900 dark:text-white">{{ sessionSummary.title }}</p>
                    <p class="mt-1 text-sm text-gray-700 dark:text-gray-300">{{ sessionSummary.detail }}</p>
                </div>
                <div class="mt-3 h-80 w-full"><canvas ref="chartCanvas" :aria-label="`Trade entries for ${timeline.session_date}`" role="img"></canvas></div>
                <p class="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400"><span class="font-medium text-gray-700 dark:text-gray-300">How to read:</span> Each bar is the number of entries in that 15-minute block. Read left to right; red dots mark losses, orange bars show entries within 30 minutes afterward, and the gray band shows your usual range for that clock time.</p>
                <div class="mt-4 rounded-lg border border-gray-200 bg-gray-50/70 p-3 text-sm dark:border-gray-700 dark:bg-gray-800/60">
                    <template v-if="timeline.baseline.available"><p class="font-medium text-gray-800 dark:text-gray-100">Typical range: middle 50% of your {{ timeline.baseline.active_days }} prior active sessions.</p><p class="mt-1 text-gray-600 dark:text-gray-400">The line and band are calculated per 15-minute block from the previous 20 active days within 90 days. They describe your history, not a recommended limit.</p></template>
                    <template v-else><p class="font-medium text-gray-800 dark:text-gray-100">Personal comparison is still warming up.</p><p class="mt-1 text-gray-600 dark:text-gray-400">We found {{ timeline.baseline.active_days }} prior active sessions; at least {{ timeline.baseline.minimum_days }} are needed before showing a typical range.</p></template>
                </div>
                <div v-if="timeline.losses.length" class="mt-5"><h3 class="text-sm font-medium text-gray-900 dark:text-white">Loss markers and follow-up activity</h3><div class="mt-2 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700"><table class="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-700"><thead class="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400"><tr><th class="px-3 py-2 font-medium">Time</th><th class="px-3 py-2 font-medium">Trade</th><th class="px-3 py-2 font-medium">Result</th><th class="px-3 py-2 font-medium">Review context</th></tr></thead><tbody class="divide-y divide-gray-200 dark:divide-gray-700"><tr v-for="loss in timeline.losses" :key="loss.id"><td class="whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-200">{{ loss.visible ? loss.local_time : 'Prior session' }}</td><td class="px-3 py-2"><button type="button" class="font-medium text-primary-700 hover:underline dark:text-primary-300" @click="$emit('open-trade', loss.id)">{{ loss.symbol || 'Trade' }}</button></td><td class="whitespace-nowrap px-3 py-2 text-red-700 dark:text-red-300">{{ formatPnl(loss.pnl) }}</td><td class="px-3 py-2 text-gray-600 dark:text-gray-400">{{ followUpText(loss) }}</td></tr></tbody></table></div></div>
                <details class="mt-5 rounded-lg border border-gray-200 dark:border-gray-700"><summary class="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200">Show entries in this session</summary><div class="overflow-x-auto border-t border-gray-200 dark:border-gray-700"><table class="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-700"><thead class="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400"><tr><th class="px-3 py-2 font-medium">Time</th><th class="px-3 py-2 font-medium">Trade</th><th class="px-3 py-2 font-medium">Context</th></tr></thead><tbody class="divide-y divide-gray-200 dark:divide-gray-700"><tr v-for="trade in timeline.trades" :key="trade.id"><td class="whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-200">{{ trade.local_time }}</td><td class="px-3 py-2"><button type="button" class="font-medium text-primary-700 hover:underline dark:text-primary-300" @click="$emit('open-trade', trade.id)">{{ trade.symbol || 'Trade' }}</button></td><td class="px-3 py-2 text-gray-600 dark:text-gray-400">{{ trade.post_loss ? 'Within 30 minutes after a loss' : 'Entry' }}</td></tr></tbody></table></div></details>
            </template>
        </div>
    </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Chart } from '@/lib/chartSetup';

const props = defineProps({ timeline: { type: Object, default: null }, loading: Boolean, error: { type: String, default: '' } });
const chartCanvas = ref(null);
let chart = null;
const calendarOpen = ref(false);
const displayMonth = ref('');
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const sessionDates = computed(() => (props.timeline?.available_session_dates || []).map((item) => typeof item === 'string' ? item : item.session_date));
const activeDateSet = computed(() => new Set(sessionDates.value));
const anomalyDateSet = computed(() => new Set((props.timeline?.available_session_dates || []).filter((item) => item && typeof item === 'object' && item.anomalous).map((item) => item.session_date)));
const currentIndex = computed(() => sessionDates.value.indexOf(props.timeline?.session_date));
const previousDate = computed(() => currentIndex.value >= 0 ? sessionDates.value[currentIndex.value + 1] : null);
const nextDate = computed(() => currentIndex.value > 0 ? sessionDates.value[currentIndex.value - 1] : null);
const minMonth = computed(() => sessionDates.value.length ? [...sessionDates.value].sort()[0].slice(0, 7) : displayMonth.value);
const maxMonth = computed(() => sessionDates.value.length ? [...sessionDates.value].sort().at(-1).slice(0, 7) : displayMonth.value);
const calendarMonthLabel = computed(() => {
    if (!displayMonth.value) return '';
    return new Date(`${displayMonth.value}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
});
const canMoveToPreviousMonth = computed(() => displayMonth.value > minMonth.value);
const canMoveToNextMonth = computed(() => displayMonth.value < maxMonth.value);
const sessionSummary = computed(() => {
    const timeline = props.timeline;
    if (!timeline?.session_date) return { title: '', detail: '' };
    const entries = timeline.trades?.length || 0;
    const afterLoss = timeline.trades?.filter((trade) => trade.post_loss).length || 0;
    const lossCount = timeline.losses?.length || 0;
    const aboveTypical = timeline.blocks?.filter((block) => block.above_typical).length || 0;
    const entryLabel = `${entries} entr${entries === 1 ? 'y' : 'ies'}`;
    const lossLabel = `${afterLoss} entr${afterLoss === 1 ? 'y' : 'ies'} within ${timeline.post_loss_window_minutes} minutes after a loss`;
    if (!timeline.baseline?.available) {
        return { title: `You made ${entryLabel} on this session.`, detail: `${lossLabel}. Your personal comparison needs ${timeline.baseline?.minimum_days || 10} prior active sessions, so this view is descriptive for now.` };
    }
    if (aboveTypical > 0) {
        return { title: `You made ${entryLabel}; ${lossLabel}.`, detail: `${aboveTypical} time block${aboveTypical === 1 ? ' was' : 's were'} busier than your typical range for that clock time. That describes activity, not intent.` };
    }
    return { title: `You made ${entryLabel}; ${lossLabel}.`, detail: 'No 15-minute block exceeded your typical range for that clock time. The chart is a review of what happened, not a trading limit.' };
});
const calendarDays = computed(() => {
    if (!displayMonth.value) return [];
    const [year, month] = displayMonth.value.split('-').map(Number);
    const first = new Date(Date.UTC(year, month - 1, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cells = [];
    for (let index = 0; index < 42; index += 1) {
        const date = new Date(Date.UTC(year, month - 1, index - first.getUTCDay() + 1));
        const dateKey = date.toISOString().slice(0, 10);
        cells.push({ date: dateKey, isCurrentMonth: date.getUTCMonth() === month - 1, isActive: activeDateSet.value.has(dateKey), isAnomalous: anomalyDateSet.value.has(dateKey), isSelected: dateKey === props.timeline?.session_date });
    }
    return cells;
});
function formatDate(value) { return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
function formatPnl(value) { return Number(value).toLocaleString(undefined, { style: 'currency', currency: 'USD', signDisplay: 'always' }); }
function followUpText(loss) { const count = (props.timeline?.trades || []).filter((trade) => trade.post_loss_ids?.includes(loss.id)).length; return count ? `${count} entr${count === 1 ? 'y' : 'ies'} within 30 minutes` : loss.visible ? 'No entries in the review window' : 'Window reaches into this session'; }
function moveMonth(amount) {
    const date = new Date(`${displayMonth.value}-01T12:00:00`);
    date.setMonth(date.getMonth() + amount);
    displayMonth.value = date.toISOString().slice(0, 7);
}
function chooseDate(date) {
    if (!activeDateSet.value.has(date)) return;
    calendarOpen.value = false;
    emit('date-change', date);
}
function destroyChart() { if (chart) { chart.destroy(); chart = null; } }
function renderChart() {
    destroyChart();
    if (!chartCanvas.value || !props.timeline?.blocks?.length) return;
    const blocks = props.timeline.blocks;
    const lossMarkers = blocks.map((block) => {
        const hasLoss = (props.timeline.losses || []).some((loss) => loss.visible && loss.block_index === block.index);
        return hasLoss ? Math.max(block.trade_count, 1) + 0.4 : null;
    });
    chart = new Chart(chartCanvas.value.getContext('2d'), { type: 'bar', data: { labels: blocks.map((block) => block.label), datasets: [
        { type: 'bar', label: 'Entries', data: blocks.map((block) => block.trade_count), backgroundColor: blocks.map((block) => block.post_loss_count ? 'rgba(245, 158, 11, 0.85)' : block.above_typical ? 'rgba(12, 74, 110, 0.92)' : 'rgba(14, 116, 144, 0.72)'), borderRadius: 3, borderSkipped: false, order: 3 },
        { type: 'line', label: 'Typical median', data: blocks.map((block) => block.median), borderColor: '#64748b', borderWidth: 2, borderDash: [5, 4], pointRadius: 0, spanGaps: true, order: 1 },
        { type: 'line', label: 'Typical range', data: blocks.map((block) => block.p75), borderColor: 'rgba(100, 116, 139, 0.25)', backgroundColor: 'rgba(100, 116, 139, 0.12)', borderWidth: 1, pointRadius: 0, fill: '+1', spanGaps: true, order: 2 },
        { type: 'line', label: 'Typical lower range', data: blocks.map((block) => block.p25), borderColor: 'rgba(100, 116, 139, 0.25)', borderWidth: 1, pointRadius: 0, spanGaps: true, order: 2 },
        { type: 'line', label: 'Loss', data: lossMarkers, borderColor: '#dc2626', backgroundColor: '#dc2626', pointBackgroundColor: '#dc2626', pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5, showLine: false, spanGaps: true, order: 0 }
    ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, filter: (item) => item.text !== 'Typical lower range' } }, tooltip: { callbacks: { footer: (items) => { const block = blocks[items[0].dataIndex]; const notes = []; if (block.post_loss_count) notes.push(`${block.post_loss_count} after-loss entr${block.post_loss_count === 1 ? 'y' : 'ies'}`); if (block.above_typical) notes.push('Above your typical range'); return notes.join(' · '); } } } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8, autoSkip: true, maxRotation: 0 } }, y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Entries in 15 minutes' } } } } });
}
const emit = defineEmits(['date-change', 'open-trade', 'retry']);
watch(() => props.timeline?.session_date, (value) => { if (value) displayMonth.value = value.slice(0, 7); }, { immediate: true });
watch(() => [props.timeline, props.loading], async () => { await nextTick(); if (!props.loading) renderChart(); }, { deep: true });
onBeforeUnmount(destroyChart);
</script>
