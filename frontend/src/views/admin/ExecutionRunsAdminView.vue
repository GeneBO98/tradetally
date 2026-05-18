<template>
  <div class="content-wrapper py-8" data-testid="execution-runs-admin-view">
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="heading-page">Execution Runs</h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {{ summary.total || 0 }} total runs &middot; {{ summary.active || 0 }} active &middot; {{ summary.shared || 0 }} shared
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn-secondary" :disabled="loading" @click="loadAll">
          <MdiIcon :icon="mdiRefresh" :size="16" class="mr-1" :class="{ 'animate-spin': loading }" />
          Refresh
        </button>
        <button class="btn-primary" :disabled="scanningAlerts" @click="scanAlerts">
          <MdiIcon :icon="mdiAlert" :size="16" class="mr-1" />
          Scan Alerts
        </button>
        <button class="btn-secondary" :disabled="retentionRunning" data-testid="admin-retention-run" @click="runRetentionPolicy">
          Retention
        </button>
      </div>
    </div>

    <div v-if="error" class="mb-6 rounded-md bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-300">
      {{ error }}
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div v-for="card in summaryCards" :key="card.label" class="card p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{{ card.label }}</p>
        <p class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{{ card.value }}</p>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ card.detail }}</p>
      </div>
    </div>

    <div class="mt-6 grid gap-6 xl:grid-cols-3">
      <section class="card p-5 xl:col-span-2">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">SLO Health</h2>
          <span class="text-xs text-gray-500 dark:text-gray-400">Last {{ slo.window || '24h' }}</span>
        </div>
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="rounded-md border border-gray-200 p-4 dark:border-gray-700">
            <p class="text-xs text-gray-500 dark:text-gray-400">API p95</p>
            <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{{ slo.apiLatency?.p95ResponseTimeMs || 0 }} ms</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">{{ slo.apiLatency?.totalRequests || 0 }} requests</p>
          </div>
          <div class="rounded-md border border-gray-200 p-4 dark:border-gray-700">
            <p class="text-xs text-gray-500 dark:text-gray-400">Chart errors</p>
            <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{{ slo.clientErrors?.chartErrors || 0 }}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">{{ slo.clientErrors?.totalErrors || 0 }} client errors</p>
          </div>
          <div class="rounded-md border border-gray-200 p-4 dark:border-gray-700">
            <p class="text-xs text-gray-500 dark:text-gray-400">Sync p95</p>
            <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{{ slo.brokerSync?.p95DurationMs || 0 }} ms</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">{{ slo.brokerSync?.failedSyncs || 0 }} failed syncs</p>
          </div>
        </div>
      </section>

      <section class="card p-5">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">Active Alerts</h2>
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ alerts.length }}</span>
        </div>
        <div v-if="alerts.length" class="space-y-3">
          <div v-for="alert in alerts.slice(0, 5)" :key="alert.id" class="rounded-md border border-gray-200 p-3 dark:border-gray-700">
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm font-medium text-gray-900 dark:text-white">{{ alert.alertType }}</span>
              <span :class="alert.severity === 'critical' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'" class="rounded px-2 py-0.5 text-xs">
                {{ alert.severity }}
              </span>
            </div>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ alert.message }}</p>
            <p v-if="alert.acknowledgedAt || alert.suppressedUntil" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Ack {{ formatDate(alert.acknowledgedAt) }} &middot; Suppressed {{ formatDate(alert.suppressedUntil) }}
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                v-if="alert.alertType === 'broker_sync_lease_expired'"
                class="btn-secondary min-h-[30px] px-2 py-1 text-xs"
                :disabled="actingAlertId === alert.id"
                data-testid="admin-alert-release-lease"
                @click="runAlertAction(alert, 'release_lease')"
              >
                Release lease
              </button>
              <button
                class="btn-secondary min-h-[30px] px-2 py-1 text-xs"
                :disabled="actingAlertId === alert.id || Boolean(alert.acknowledgedAt)"
                data-testid="admin-alert-acknowledge"
                @click="runAlertAction(alert, 'acknowledge')"
              >
                Acknowledge
              </button>
              <button
                class="btn-secondary min-h-[30px] px-2 py-1 text-xs"
                :disabled="actingAlertId === alert.id"
                data-testid="admin-alert-suppress"
                @click="runAlertAction(alert, 'suppress')"
              >
                Suppress 1h
              </button>
              <button
                class="btn-secondary min-h-[30px] px-2 py-1 text-xs"
                :disabled="actingAlertId === alert.id"
                data-testid="admin-alert-resolve"
                @click="runAlertAction(alert, 'resolve')"
              >
                Resolve
              </button>
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-gray-500 dark:text-gray-400">No active operational alerts.</p>
      </section>
    </div>

    <div class="mt-6 grid gap-6 xl:grid-cols-2">
      <section class="card p-5" data-testid="admin-security-events">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">HTTP Security Events</h2>
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ securityEvents.length }}</span>
        </div>
        <div v-if="securityEvents.length" class="space-y-3">
          <div v-for="event in securityEvents.slice(0, 6)" :key="event.id" class="rounded-md border border-gray-200 p-3 text-xs dark:border-gray-700">
            <div class="flex items-center justify-between gap-3">
              <span class="font-medium text-gray-900 dark:text-white">{{ event.eventType }}</span>
              <span :class="event.severity === 'critical' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'" class="rounded px-2 py-0.5">
                {{ event.severity }}
              </span>
            </div>
            <p class="mt-1 text-gray-500 dark:text-gray-400">{{ event.path || event.directive || event.blockedUri || 'event captured' }}</p>
            <p class="mt-1 text-gray-400 dark:text-gray-500">{{ formatDate(event.createdAt) }}</p>
          </div>
        </div>
        <p v-else class="text-sm text-gray-500 dark:text-gray-400">No HTTP security events captured.</p>
      </section>

      <section class="card p-5" data-testid="admin-platform-health">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">Platform Coordination</h2>
          <span :class="redisHealth.status === 'ok' || redisHealth.status === 'not_configured' ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'" class="text-xs font-medium">
            {{ redisHealth.status || 'unknown' }}
          </span>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-md border border-gray-200 p-3 text-xs dark:border-gray-700">
            <p class="font-medium text-gray-900 dark:text-white">Redis</p>
            <p class="mt-1 text-gray-500 dark:text-gray-400">{{ redisHealth.configured ? redisHealth.namespace : 'memory fallback' }}</p>
            <p v-if="redisHealth.latencyMs !== undefined" class="mt-1 text-gray-400 dark:text-gray-500">{{ redisHealth.latencyMs }} ms ping</p>
          </div>
          <div class="rounded-md border border-gray-200 p-3 text-xs dark:border-gray-700">
            <p class="font-medium text-gray-900 dark:text-white">API key lookup</p>
            <p class="mt-1 text-gray-500 dark:text-gray-400">{{ hmacHealth.hmac_indexed || 0 }} / {{ hmacHealth.total || 0 }} HMAC indexed</p>
            <p class="mt-1 text-gray-400 dark:text-gray-500">{{ hmacRotationPreview.rotationMode || 'current-secret-only' }}</p>
          </div>
        </div>
      </section>

      <section class="card p-5" data-testid="admin-workflow-settings">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">Workflow Thresholds</h2>
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ workflowSettings.length }} sources</span>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="text-sm text-gray-700 dark:text-gray-300">
            Source
            <input v-model="workflowForm.source" class="input mt-1" data-testid="admin-workflow-source" />
          </label>
          <label class="text-sm text-gray-700 dark:text-gray-300">
            Confidence levels
            <input v-model="workflowForm.confidenceLevels" class="input mt-1" data-testid="admin-workflow-confidence" />
          </label>
          <label class="text-sm text-gray-700 dark:text-gray-300">
            Shared-link threshold
            <input v-model.number="workflowForm.sharedReportAccessThreshold" type="number" min="1" class="input mt-1" data-testid="admin-workflow-threshold" />
          </label>
          <label class="text-sm text-gray-700 dark:text-gray-300">
            Window minutes
            <input v-model.number="workflowForm.sharedReportAccessWindowMinutes" type="number" min="1" class="input mt-1" data-testid="admin-workflow-window" />
          </label>
        </div>
        <div class="mt-4 flex items-center justify-between gap-3">
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Current {{ activeWorkflowSetting?.source || '-' }} &middot; {{ activeWorkflowSetting?.confidenceLevels?.join(', ') || '-' }}
          </p>
          <button class="btn-primary" :disabled="savingWorkflow" data-testid="admin-workflow-save" @click="saveWorkflowSettings">
            Request approval
          </button>
        </div>
        <div class="mt-4 divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-700 dark:border-gray-700" data-testid="admin-workflow-revisions">
          <div v-for="revision in workflowRevisions.slice(0, 3)" :key="revision.id" class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-sm font-medium text-gray-900 dark:text-white">{{ revision.source }} &middot; {{ revision.approvalStatus }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                threshold {{ revision.afterSettings?.sharedReportAccessThreshold }} &middot;
                window {{ revision.afterSettings?.sharedReportAccessWindowMinutes }}m
              </p>
            </div>
            <div v-if="revision.approvalStatus === 'pending'" class="flex gap-2">
              <button class="btn-secondary min-h-[30px] px-2 py-1 text-xs" data-testid="admin-workflow-approve" @click="runWorkflowRevisionAction(revision, 'approve')">
                Approve
              </button>
              <button class="btn-secondary min-h-[30px] px-2 py-1 text-xs" @click="runWorkflowRevisionAction(revision, 'reject')">
                Reject
              </button>
            </div>
          </div>
        </div>
        <div class="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700" data-testid="admin-strategy-thresholds">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Strategy Threshold</h3>
            <span class="text-xs text-gray-500 dark:text-gray-400">{{ strategyAnomalySettings.length }}</span>
          </div>
          <div class="grid gap-3 sm:grid-cols-4">
            <input v-model="strategyForm.strategy" class="input" placeholder="Strategy" data-testid="admin-strategy-name" />
            <input v-model.number="strategyForm.sharedReportAccessThreshold" type="number" min="2" class="input" placeholder="Threshold" data-testid="admin-strategy-threshold" />
            <input v-model.number="strategyForm.sharedReportAccessWindowMinutes" type="number" min="1" class="input" placeholder="Window" data-testid="admin-strategy-window" />
            <button class="btn-secondary" :disabled="savingWorkflow" data-testid="admin-strategy-save" @click="saveStrategyThreshold">Save</button>
          </div>
          <p v-if="strategyAnomalySettings.length" class="mt-2 truncate text-xs text-gray-500 dark:text-gray-400">
            {{ strategyAnomalySettings.slice(0, 3).map(item => `${item.strategy}: ${item.sharedReportAccessThreshold}/${item.sharedReportAccessWindowMinutes}m`).join(' | ') }}
          </p>
        </div>
      </section>

      <section class="card p-5" data-testid="admin-performance-budgets">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">Performance Budgets</h2>
          <span class="text-xs text-gray-500 dark:text-gray-400">p95 / budget</span>
        </div>
        <div class="space-y-3">
          <div v-for="budget in performanceBudgets" :key="budget.endpointKey" class="rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm font-medium text-gray-900 dark:text-white">{{ budget.endpointKey }}</span>
              <span :class="budget.status === 'breached' ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300'" class="text-xs font-medium">
                {{ budget.status }}
              </span>
            </div>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ budget.method }} {{ budget.pathPattern }} &middot; {{ budget.p95DurationMs || 0 }} ms / {{ budget.p95BudgetMs }} ms &middot; {{ budget.sampleCount }} samples
            </p>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              DB p95 {{ budget.dbQueryLatency?.p95DurationMs || 0 }} ms &middot;
              {{ budget.dbQueryLatency?.sampleCount || 0 }} query samples
            </p>
            <p v-if="budget.dbQueryLatency?.labels?.length" class="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
              Slowest query {{ budget.dbQueryLatency.labels[0].queryLabel }} p95 {{ budget.dbQueryLatency.labels[0].p95DurationMs }} ms
            </p>
          </div>
          <p v-if="performanceBudgets.length === 0" class="text-sm text-gray-500 dark:text-gray-400">No budget samples recorded yet.</p>
        </div>
      </section>
    </div>

    <section class="card mt-6 p-5" data-testid="admin-alert-routing">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">Alert Suppression and Escalation</h2>
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ alertSuppressionRules.length }} rules &middot; {{ alertEscalationDestinations.length }} destinations &middot; {{ alertEscalationDestinationRequests.length }} approvals &middot; {{ alertEscalationDeliveries.length }} deliveries</span>
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <div>
          <div class="grid gap-3 sm:grid-cols-4">
            <input v-model="suppressionRuleForm.alertType" class="input" placeholder="Alert type" data-testid="admin-suppression-alert-type" />
            <input v-model="suppressionRuleForm.recurrenceRule.frequency" class="input" placeholder="Frequency" data-testid="admin-suppression-frequency" />
            <input v-model="suppressionRuleForm.reason" class="input sm:col-span-1" placeholder="Reason" data-testid="admin-suppression-reason" />
            <button class="btn-secondary" data-testid="admin-suppression-save" @click="saveSuppressionRule">Save rule</button>
          </div>
          <div class="mt-3 space-y-2">
            <div v-for="rule in alertSuppressionRules.slice(0, 3)" :key="rule.id" class="rounded-md border border-gray-200 px-3 py-2 text-xs dark:border-gray-700">
              <span class="font-medium text-gray-900 dark:text-white">{{ rule.alertType }}</span>
              <span class="text-gray-500 dark:text-gray-400"> &middot; {{ rule.recurrenceRule?.frequency || 'once' }} &middot; {{ rule.reason || '-' }}</span>
            </div>
          </div>
        </div>
        <div>
          <div class="grid gap-3 sm:grid-cols-4">
            <select v-model="escalationForm.destinationType" class="input" data-testid="admin-escalation-type">
              <option value="email">Email</option>
              <option value="slack">Slack</option>
              <option value="webhook">Webhook</option>
            </select>
            <input v-model="escalationForm.target" class="input sm:col-span-2" placeholder="Target" data-testid="admin-escalation-target" />
            <button class="btn-secondary" data-testid="admin-escalation-save" @click="saveEscalationDestination">Save destination</button>
          </div>
          <div class="mt-3 space-y-2">
            <div v-for="destination in alertEscalationDestinations.slice(0, 3)" :key="destination.id" class="rounded-md border border-gray-200 px-3 py-2 text-xs dark:border-gray-700">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span class="font-medium text-gray-900 dark:text-white">{{ destination.destinationType }}</span>
                  <span class="text-gray-500 dark:text-gray-400"> &middot; {{ destination.target }} &middot; {{ destination.severity }} &middot; {{ destination.isEnabled ? 'enabled' : 'disabled' }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <button
                    class="btn-secondary min-h-[28px] px-2 py-0.5 text-xs"
                    :disabled="actingDestinationId === destination.id || !destinationActionReason.trim()"
                    data-testid="admin-escalation-toggle"
                    @click="runEscalationDestinationAction(destination, destination.isEnabled ? 'disable' : 'enable')"
                  >
                    {{ destination.isEnabled ? 'Disable' : 'Enable' }}
                  </button>
                  <button
                    class="btn-secondary min-h-[28px] px-2 py-0.5 text-xs"
                    :disabled="actingDestinationId === destination.id || !destinationActionReason.trim()"
                    data-testid="admin-escalation-delete"
                    @click="runEscalationDestinationAction(destination, 'delete')"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
            <input v-model="destinationActionReason" class="input text-xs" placeholder="Required audit reason for enable, disable, or delete" data-testid="admin-escalation-action-reason" />
            <div v-for="request in alertEscalationDestinationRequests.slice(0, 3)" :key="request.id" class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs dark:border-amber-900/60 dark:bg-amber-900/20" data-testid="admin-escalation-request">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="font-medium text-amber-900 dark:text-amber-200">{{ request.action }} approval &middot; {{ request.status }}</span>
                <div v-if="request.status === 'pending'" class="flex gap-1">
                  <button class="btn-secondary min-h-[28px] px-2 py-0.5 text-xs" data-testid="admin-escalation-request-approve" @click="runEscalationDestinationRequestAction(request, 'approve')">Approve</button>
                  <button class="btn-secondary min-h-[28px] px-2 py-0.5 text-xs" @click="runEscalationDestinationRequestAction(request, 'reject')">Reject</button>
                </div>
              </div>
              <p class="mt-1 text-amber-800 dark:text-amber-200">{{ request.reason }}</p>
            </div>
            <div v-for="audit in alertEscalationDestinationAudits.slice(0, 3)" :key="audit.id" class="rounded-md border border-gray-200 px-3 py-2 text-xs dark:border-gray-700">
              <span class="font-medium text-gray-900 dark:text-white">{{ audit.action }}</span>
              <span class="text-gray-500 dark:text-gray-400"> &middot; {{ audit.reason || '-' }} &middot; {{ formatDate(audit.createdAt) }}</span>
            </div>
            <div class="grid gap-2 sm:grid-cols-[1fr_120px]">
              <input v-model="deliveryReplayReason" class="input text-xs" placeholder="Required replay approval reason" data-testid="admin-delivery-replay-reason" />
              <input v-model.number="deliveryReplayLimit" type="number" min="1" max="25" class="input text-xs" data-testid="admin-delivery-replay-limit" />
            </div>
            <div v-for="delivery in alertEscalationDeliveries.slice(0, 4)" :key="delivery.id" class="rounded-md border border-gray-200 px-3 py-2 text-xs dark:border-gray-700">
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium text-gray-900 dark:text-white">{{ delivery.destinationType }} {{ delivery.status }}</span>
                <button
                  v-if="(delivery.status === 'failed' || delivery.status === 'skipped') && !delivery.deadLetteredAt"
                  class="btn-secondary min-h-[28px] px-2 py-0.5 text-xs"
                  :disabled="retryingDeliveryId === delivery.id"
                  data-testid="admin-delivery-retry"
                  @click="retryEscalationDelivery(delivery)"
                >
                  Retry
                </button>
                <button
                  v-else-if="delivery.deadLetteredAt"
                  class="btn-secondary min-h-[28px] px-2 py-0.5 text-xs"
                  :disabled="retryingDeliveryId === delivery.id || !deliveryReplayReason.trim()"
                  data-testid="admin-delivery-replay-request"
                  @click="requestEscalationDeliveryReplay(delivery)"
                >
                  Request replay
                </button>
              </div>
              <span class="text-gray-500 dark:text-gray-400">
                {{ delivery.target }} &middot; {{ formatDate(delivery.attemptedAt) }} &middot;
                retry {{ delivery.retryCount || 0 }}
              </span>
              <p v-if="delivery.deadLetteredAt" class="mt-1 text-red-600 dark:text-red-300">
                Dead letter {{ formatDate(delivery.deadLetteredAt) }} &middot; {{ delivery.deadLetterReason || '-' }}
              </p>
              <p v-else-if="delivery.retryLeaseUntil" class="mt-1 text-amber-700 dark:text-amber-300">
                Leased until {{ formatDate(delivery.retryLeaseUntil) }}
              </p>
              <p v-if="delivery.nextRetryAt" class="mt-1 text-gray-500 dark:text-gray-400">
                Next {{ formatDate(delivery.nextRetryAt) }}
              </p>
            </div>
            <div class="rounded-md border border-gray-200 p-3 dark:border-gray-700" data-testid="admin-delivery-replay-filters">
              <div class="grid gap-2 sm:grid-cols-5">
                <select v-model="deliveryReplayFilters.status" class="input text-xs" data-testid="admin-delivery-replay-status">
                  <option value="">All replay statuses</option>
                  <option value="pending">Pending</option>
                  <option value="applied">Applied</option>
                  <option value="rejected">Rejected</option>
                </select>
                <select v-model="deliveryReplayFilters.destinationType" class="input text-xs" data-testid="admin-delivery-replay-destination-type">
                  <option value="">All destinations</option>
                  <option value="email">Email</option>
                  <option value="slack">Slack</option>
                  <option value="webhook">Webhook</option>
                </select>
                <input v-model="deliveryReplayFilters.from" type="date" class="input text-xs" data-testid="admin-delivery-replay-from" />
                <input v-model="deliveryReplayFilters.to" type="date" class="input text-xs" data-testid="admin-delivery-replay-to" />
                <button class="btn-secondary min-h-[34px] px-3 py-1 text-xs" data-testid="admin-delivery-replay-apply-filters" @click="loadAll">Apply</button>
              </div>
              <input v-model="deliveryReplayReviewNote" class="input mt-2 text-xs" placeholder="Persisted approval or rejection note" data-testid="admin-delivery-replay-review-note" />
            </div>
            <div v-for="request in alertEscalationDeliveryReplayRequests.slice(0, 3)" :key="request.id" class="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs dark:border-sky-900/60 dark:bg-sky-900/20" data-testid="admin-delivery-replay-request-row">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="font-medium text-sky-900 dark:text-sky-200">Dead-letter replay &middot; {{ request.status }}</span>
                <div v-if="request.status === 'pending'" class="flex gap-1">
                  <button class="btn-secondary min-h-[28px] px-2 py-0.5 text-xs" :disabled="actingReplayRequestId === request.id" data-testid="admin-delivery-replay-approve" @click="runEscalationDeliveryReplayRequestAction(request, 'approve')">Approve</button>
                  <button class="btn-secondary min-h-[28px] px-2 py-0.5 text-xs" :disabled="actingReplayRequestId === request.id" @click="runEscalationDeliveryReplayRequestAction(request, 'reject')">Reject</button>
                </div>
              </div>
              <p class="mt-1 text-sky-800 dark:text-sky-200">{{ request.reason }}</p>
              <p v-if="request.reviewNote" class="mt-1 text-sky-800 dark:text-sky-200">Review: {{ request.reviewNote }}</p>
              <p class="mt-1 text-sky-700 dark:text-sky-300">limit {{ request.scope?.replayCount || 0 }}/{{ request.scope?.maxReplayCount || 3 }} &middot; {{ request.destinationType || request.scope?.destinationType || '-' }} &middot; {{ formatDate(request.requestedAt) }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="card mt-6 p-5" data-testid="admin-import-reconciliations">
      <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">Import Account Reconciliation</h2>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ importAccountReconciliations.length }} account identifiers awaiting or recording review</p>
        </div>
        <div class="grid w-full gap-2 sm:max-w-xl sm:grid-cols-[1fr_150px_auto_auto]">
          <input v-model="reconciliationReason" class="input text-xs" placeholder="Review reason" data-testid="admin-reconciliation-reason" />
          <select v-model="reconciliationBulkAction" class="input text-xs" data-testid="admin-reconciliation-bulk-action">
            <option value="ignore">Ignore</option>
            <option value="reopen">Reopen</option>
            <option value="resolve">Resolve</option>
          </select>
          <button class="btn-secondary min-h-[34px] px-3 py-1 text-xs" :disabled="bulkReconciliationRunning || selectedReconciliationIds.length === 0" data-testid="admin-reconciliation-bulk-preview" @click="runBulkImportReconciliation(true)">Preview</button>
          <button class="btn-primary min-h-[34px] px-3 py-1 text-xs" :disabled="bulkReconciliationRunning || selectedReconciliationIds.length === 0 || !reconciliationReason.trim()" data-testid="admin-reconciliation-bulk-apply" @click="runBulkImportReconciliation(false)">Apply</button>
        </div>
      </div>
      <div v-if="reconciliationBulkPreview" class="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-100" data-testid="admin-reconciliation-bulk-preview-output">
        Preview {{ reconciliationBulkPreview.action }} for {{ reconciliationBulkPreview.affectedCount }} row{{ reconciliationBulkPreview.affectedCount === 1 ? '' : 's' }}.
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                <input type="checkbox" :checked="visibleReconciliationIds.length > 0 && selectedReconciliationIds.length === visibleReconciliationIds.length" data-testid="admin-reconciliation-select-all" @change="toggleAllReconciliations" />
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Identifier</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">User</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Status</th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Samples</th>
              <th class="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="item in importAccountReconciliations.slice(0, 8)" :key="item.id">
              <td class="px-3 py-2">
                <input v-model="selectedReconciliationIds" :value="item.id" type="checkbox" data-testid="admin-reconciliation-select" />
              </td>
              <td class="px-3 py-2">
                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ item.accountIdentifier }}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ item.broker || '-' }} &middot; {{ item.source }}</p>
                <p v-if="item.lastAuditReason" class="mt-1 text-xs text-gray-500 dark:text-gray-400">Audit: {{ item.lastAuditAction }} &middot; {{ item.lastAuditReason }}</p>
              </td>
              <td class="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">{{ item.userEmail || item.username || shortId(item.userId) }}</td>
              <td class="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">{{ item.status }}</td>
              <td class="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">{{ item.sampleCount }} &middot; {{ formatDate(item.lastSeenAt) }}</td>
              <td class="px-3 py-2 text-right">
                <button class="text-xs font-medium text-primary-700 hover:underline dark:text-primary-300" :disabled="actingReconciliationId === item.id" data-testid="admin-reconciliation-resolve" @click="runImportReconciliationAction(item, 'resolve')">Resolve</button>
                <button class="ml-3 text-xs font-medium text-primary-700 hover:underline dark:text-primary-300" :disabled="actingReconciliationId === item.id" data-testid="admin-reconciliation-ignore" @click="runImportReconciliationAction(item, 'ignore')">Ignore</button>
                <button class="ml-3 text-xs font-medium text-primary-700 hover:underline dark:text-primary-300" :disabled="actingReconciliationId === item.id" @click="runImportReconciliationAction(item, 'reopen')">Reopen</button>
              </td>
            </tr>
            <tr v-if="importAccountReconciliations.length === 0">
              <td colspan="6" class="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No import account reconciliation rows found.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="importAccountReconciliationAudits.length" class="mt-4 grid gap-2" data-testid="admin-reconciliation-audits">
        <div v-for="audit in importAccountReconciliationAudits.slice(0, 4)" :key="audit.id" class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs dark:border-gray-700">
          <span class="text-gray-700 dark:text-gray-300">{{ audit.action }} &middot; {{ audit.reason }} &middot; {{ formatDate(audit.createdAt) }}</span>
          <button class="btn-secondary min-h-[28px] px-2 py-0.5 text-xs" data-testid="admin-reconciliation-audit-rollback" @click="rollbackImportReconciliationAudit(audit)">Rollback</button>
        </div>
      </div>
    </section>

    <section class="card mt-6 p-5" data-testid="admin-report-templates">
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">Report Templates</h2>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ reportTemplates.length }} scoped templates</p>
        </div>
        <div class="flex items-center gap-2">
          <select v-model="reportTemplateForm.templateKey" class="input min-w-[180px]" data-testid="admin-report-template-select" @change="syncReportTemplateForm">
            <option v-for="template in reportTemplates" :key="template.templateKey" :value="template.templateKey">
              {{ template.label }}
            </option>
          </select>
          <button class="btn-primary" :disabled="savingReportTemplate || reportTemplates.length === 0 || !reportTemplateClientValidation.valid" data-testid="admin-report-template-save" @click="saveReportTemplate">
            Request update
          </button>
          <button class="btn-secondary" :disabled="savingReportTemplate || reportTemplates.length === 0 || !reportTemplateClientValidation.valid" data-testid="admin-report-template-preview" @click="previewReportTemplate">
            Preview
          </button>
        </div>
      </div>
      <div class="grid gap-3 lg:grid-cols-2">
        <label class="text-sm text-gray-700 dark:text-gray-300">
          Label
          <input v-model="reportTemplateForm.label" class="input mt-1" data-testid="admin-report-template-label" />
        </label>
        <label class="inline-flex items-end gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input v-model="reportTemplateForm.isEnabled" type="checkbox" class="mb-2" data-testid="admin-report-template-enabled" />
          Enabled for report generation
        </label>
        <label class="text-sm text-gray-700 dark:text-gray-300 lg:col-span-2">
          Description
          <input v-model="reportTemplateForm.description" class="input mt-1" data-testid="admin-report-template-description" />
        </label>
        <div class="text-sm text-gray-700 dark:text-gray-300" data-testid="admin-report-template-section-editor">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span>Sections</span>
            <button class="btn-secondary min-h-[30px] px-2 py-0.5 text-xs" data-testid="admin-report-template-section-add" @click="addReportTemplateSection">Add</button>
          </div>
          <div class="space-y-2">
            <div
              v-for="(section, index) in reportTemplateSections"
              :key="`${section.key}-${index}`"
              class="rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
              draggable="true"
              :data-testid="`admin-report-template-section-${index}`"
              @dragstart="dragReportTemplateSection(index)"
              @dragover.prevent
              @drop.prevent="dropReportTemplateSection(index)"
            >
              <div class="grid gap-2 sm:grid-cols-[120px_1fr_auto] sm:items-center">
                <input v-model="section.key" class="input text-xs" placeholder="Key" :data-testid="`admin-report-template-section-key-${index}`" />
                <input v-model="section.label" class="input text-xs" placeholder="Label" :data-testid="`admin-report-template-section-label-${index}`" />
                <label class="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                  <input v-model="section.enabled" type="checkbox" />
                  Enabled
                </label>
              </div>
              <div class="mt-2 flex gap-1">
                <button class="btn-secondary min-h-[28px] px-2 py-0.5 text-xs" :disabled="index === 0" @click="moveReportTemplateSection(index, -1)">Up</button>
                <button class="btn-secondary min-h-[28px] px-2 py-0.5 text-xs" :disabled="index === reportTemplateSections.length - 1" @click="moveReportTemplateSection(index, 1)">Down</button>
                <button class="btn-secondary min-h-[28px] px-2 py-0.5 text-xs" @click="removeReportTemplateSection(index)">Remove</button>
              </div>
            </div>
          </div>
        </div>
        <label class="text-sm text-gray-700 dark:text-gray-300">
          Share defaults JSON
          <textarea v-model="reportTemplateForm.shareDefaults" rows="8" class="input mt-1 font-mono text-xs" data-testid="admin-report-template-defaults"></textarea>
        </label>
      </div>
      <div class="mt-4 grid gap-3 lg:grid-cols-2">
        <div class="rounded-md border border-gray-200 px-3 py-2 text-xs dark:border-gray-700" data-testid="admin-report-template-validation">
          <p class="font-medium" :class="reportTemplateClientValidation.valid ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'">
            {{ reportTemplateClientValidation.valid ? 'Template JSON is valid' : 'Template JSON needs attention' }}
          </p>
          <p v-for="message in reportTemplateClientValidation.messages" :key="message" class="mt-1 text-gray-500 dark:text-gray-400">{{ message }}</p>
          <p v-if="reportTemplateServerValidation.errors?.length" class="mt-1 text-red-700 dark:text-red-300">
            {{ reportTemplateServerValidation.errors.join(' | ') }}
          </p>
          <p v-if="reportTemplateServerValidation.warnings?.length" class="mt-1 text-amber-700 dark:text-amber-300">
            {{ reportTemplateServerValidation.warnings.join(' | ') }}
          </p>
        </div>
        <div class="grid gap-3 lg:grid-cols-[180px_1fr]">
          <div class="rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900" data-testid="admin-report-template-pdf-thumb">
            <canvas ref="reportTemplatePreviewCanvas" class="mx-auto block h-[220px] w-full rounded-sm bg-white shadow-sm"></canvas>
          </div>
          <pre class="max-h-48 overflow-auto rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300" data-testid="admin-report-template-preview-output">{{ reportTemplatePreviewText }}</pre>
        </div>
      </div>
      <div class="mt-4 divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-700 dark:border-gray-700" data-testid="admin-report-template-revisions">
        <div v-for="revision in reportTemplateRevisions.slice(0, 4)" :key="revision.id" class="flex flex-col gap-2 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="font-medium text-gray-900 dark:text-white">{{ revision.templateKey }} &middot; {{ revision.approvalStatus }}</p>
            <p class="text-gray-500 dark:text-gray-400">
              fields {{ revision.diffSummary?.changedFields?.join(', ') || '-' }} &middot;
              sections +{{ revision.diffSummary?.addedSections?.length || 0 }}/-{{ revision.diffSummary?.removedSections?.length || 0 }}
            </p>
          </div>
          <div class="flex gap-2">
            <button v-if="revision.approvalStatus === 'pending'" class="btn-secondary min-h-[30px] px-2 py-1 text-xs" data-testid="admin-report-template-approve" @click="runReportTemplateRevisionAction(revision, 'approve')">Approve</button>
            <button v-if="revision.approvalStatus === 'pending'" class="btn-secondary min-h-[30px] px-2 py-1 text-xs" @click="runReportTemplateRevisionAction(revision, 'reject')">Reject</button>
            <button v-if="revision.approvalStatus === 'applied'" class="btn-secondary min-h-[30px] px-2 py-1 text-xs" data-testid="admin-report-template-rollback" @click="runReportTemplateRevisionAction(revision, 'rollback')">Rollback</button>
          </div>
        </div>
      </div>
    </section>

    <section class="card mt-6 p-5" data-testid="admin-retention-policy">
      <div data-testid="admin-retention-policy-core">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">Retention Policy</h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Events {{ retentionPolicy?.eventRetentionDays || '-' }}d &middot;
              telemetry {{ retentionPolicy?.telemetryRetentionDays || '-' }}d &middot;
              report access {{ retentionPolicy?.reportAccessRetentionDays || '-' }}d
            </p>
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-300" data-testid="admin-retention-last-run">
            Last run {{ formatDate(retentionPolicy?.lastRunAt) }}
          </div>
        </div>
        <div class="mt-4 grid gap-3 sm:grid-cols-3" data-testid="admin-retention-preview">
          <div v-for="item in retentionPreviewItems" :key="item.label" class="rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
            <p class="text-xs text-gray-500 dark:text-gray-400">{{ item.label }}</p>
            <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{{ item.value }}</p>
          </div>
        </div>
        <div class="mt-5 grid gap-3 sm:grid-cols-4" data-testid="admin-retention-edit">
          <label class="text-sm text-gray-700 dark:text-gray-300">
            Events days
            <input v-model.number="retentionForm.eventRetentionDays" type="number" min="1" class="input mt-1" data-testid="admin-retention-events" />
          </label>
          <label class="text-sm text-gray-700 dark:text-gray-300">
            Telemetry days
            <input v-model.number="retentionForm.telemetryRetentionDays" type="number" min="1" class="input mt-1" data-testid="admin-retention-telemetry" />
          </label>
          <label class="text-sm text-gray-700 dark:text-gray-300">
            Report access days
            <input v-model.number="retentionForm.reportAccessRetentionDays" type="number" min="1" class="input mt-1" data-testid="admin-retention-report-access" />
          </label>
          <div class="flex items-end">
            <button class="btn-primary w-full" :disabled="savingRetention" data-testid="admin-retention-request" @click="requestRetentionUpdate">
              Request update
            </button>
          </div>
        </div>
      </div>
      <div v-if="retentionRevisions.length" class="mt-5 divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-700 dark:border-gray-700" data-testid="admin-retention-revisions">
        <div v-for="revision in retentionRevisions.slice(0, 4)" :key="revision.id" class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">{{ revision.approvalStatus }}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              events {{ revision.afterPolicy?.eventRetentionDays }}d &middot;
              telemetry {{ revision.afterPolicy?.telemetryRetentionDays }}d &middot;
              report {{ revision.afterPolicy?.reportAccessRetentionDays }}d
            </p>
          </div>
          <div v-if="revision.approvalStatus === 'pending'" class="flex gap-2">
            <button class="btn-secondary min-h-[30px] px-2 py-1 text-xs" data-testid="admin-retention-approve" @click="runRetentionRevisionAction(revision, 'approve')">
              Approve
            </button>
            <button class="btn-secondary min-h-[30px] px-2 py-1 text-xs" @click="runRetentionRevisionAction(revision, 'reject')">
              Reject
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="mt-6" data-testid="admin-lineage-graph">
      <div class="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">Run Lineage</h2>
        <div class="grid gap-2 sm:grid-cols-7" data-testid="admin-lineage-filters">
          <input v-model="lineageFilters.symbol" class="input" placeholder="Symbol" data-testid="admin-lineage-symbol" />
          <input v-model="lineageFilters.strategy" class="input" placeholder="Strategy" data-testid="admin-lineage-strategy" />
          <input v-model="lineageFilters.account" class="input" placeholder="Account" data-testid="admin-lineage-account" />
          <input v-model="lineageFilters.from" type="date" class="input" data-testid="admin-lineage-from" />
          <input v-model="lineageFilters.to" type="date" class="input" data-testid="admin-lineage-to" />
          <button class="btn-secondary" :disabled="loading" data-testid="admin-lineage-apply" @click="loadAll">Apply</button>
          <button class="btn-secondary" :disabled="backfillingEvents" data-testid="admin-event-hash-backfill" @click="backfillEventHashes">Backfill hashes</button>
        </div>
      </div>
      <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">{{ lineageNodes.length }} recent nodes</p>
      <div class="grid gap-3 lg:grid-cols-3">
        <div
          v-for="node in lineageNodes"
          :key="node.id"
          class="rounded-md border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm font-semibold capitalize text-gray-900 dark:text-white">{{ node.mode }}</span>
            <span class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">{{ node.status }}</span>
          </div>
          <p class="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{{ node.name || 'Unnamed run' }}</p>
          <div class="mt-3 border-l-2 border-primary-300 pl-3 text-xs text-gray-600 dark:border-primary-700 dark:text-gray-300">
            <p>{{ node.lineageType ? `${node.lineageType.replace(/_/g, ' ')} ${shortId(node.parentRunId)}` : 'root' }}</p>
            <p class="truncate font-mono">{{ node.marketDataSnapshotId || '-' }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="card mt-6 p-5" data-testid="admin-alert-action-audit">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">Alert Action Audit</h2>
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ alertAudits.length }}</span>
      </div>
      <div v-if="alertAudits.length" class="divide-y divide-gray-100 dark:divide-gray-700">
        <div v-for="audit in alertAudits.slice(0, 6)" :key="audit.id" class="py-3 text-sm">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-medium text-gray-900 dark:text-white">{{ audit.action }}</span>
            <span class="text-xs text-gray-500 dark:text-gray-400">{{ formatDate(audit.createdAt) }}</span>
          </div>
          <p class="mt-1 text-xs text-gray-600 dark:text-gray-300">
            {{ audit.alertType }} &middot; {{ audit.statusBefore || '-' }} to {{ audit.statusAfter || '-' }} &middot;
            {{ audit.actorEmail || audit.actorUsername || shortId(audit.actorUserId) }}
          </p>
        </div>
      </div>
      <p v-else class="text-sm text-gray-500 dark:text-gray-400">No alert actions recorded yet.</p>
    </section>

    <section class="card mt-6">
      <div class="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">Recent Runs</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Run</th>
              <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">User</th>
              <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Mode</th>
              <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Status</th>
              <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Lineage / Snapshot</th>
              <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Metrics</th>
              <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="run in runs" :key="run.id" class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <td class="px-4 py-3">
                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ run.name || 'Unnamed run' }}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatDate(run.createdAt) }}</p>
              </td>
              <td class="px-4 py-3">
                <p class="text-sm text-gray-900 dark:text-white">{{ run.username || 'Unknown' }}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ run.userEmail }}</p>
              </td>
              <td class="px-4 py-3 text-sm capitalize text-gray-800 dark:text-gray-200">{{ run.mode }}</td>
              <td class="px-4 py-3">
                <span :class="statusClass(run.status)" class="rounded-md px-2 py-1 text-xs font-medium">{{ run.status }}</span>
              </td>
              <td class="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                <div>{{ run.lineageType ? `${run.lineageType.replace(/_/g, ' ')} ${shortId(run.parentRunId)}` : 'root' }}</div>
                <div class="max-w-[180px] truncate font-mono">{{ run.marketDataSnapshotId || '-' }}</div>
              </td>
              <td class="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                {{ summarizeMetrics(run.metrics) }}
              </td>
              <td class="px-4 py-3 text-right space-x-3">
                <button class="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300" @click="downloadReport(run, 'json')">
                  JSON
                </button>
                <button class="text-sm font-medium text-primary-700 hover:underline dark:text-primary-300" @click="downloadReport(run, 'pdf')">
                  PDF
                </button>
              </td>
            </tr>
            <tr v-if="runs.length === 0">
              <td colspan="7" class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No execution runs found.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { mdiAlert, mdiRefresh } from '@mdi/js'
import MdiIcon from '@/components/MdiIcon.vue'
import api from '@/services/api'

const loading = ref(false)
const scanningAlerts = ref(false)
const retentionRunning = ref(false)
const actingAlertId = ref(null)
const actingDestinationId = ref(null)
const retryingDeliveryId = ref(null)
const actingReplayRequestId = ref(null)
const actingReconciliationId = ref(null)
const error = ref('')
const summary = ref({})
const runs = ref([])
const slo = ref({})
const alerts = ref([])
const securityEvents = ref([])
const redisHealth = ref({})
const hmacHealth = ref({})
const hmacRotationPreview = ref({})
const retentionPreview = ref({})
const alertAudits = ref([])
const workflowSettings = ref([])
const workflowRevisions = ref([])
const strategyAnomalySettings = ref([])
const performanceBudgets = ref([])
const retentionRevisions = ref([])
const alertSuppressionRules = ref([])
const alertEscalationDestinations = ref([])
const alertEscalationDestinationAudits = ref([])
const alertEscalationDestinationRequests = ref([])
const alertEscalationDeliveries = ref([])
const alertEscalationDeliveryReplayRequests = ref([])
const importAccountReconciliations = ref([])
const importAccountReconciliationAudits = ref([])
const reportTemplates = ref([])
const reportTemplateRevisions = ref([])
const savingWorkflow = ref(false)
const savingRetention = ref(false)
const savingReportTemplate = ref(false)
const reportTemplateServerValidation = ref({})
const reportTemplatePreview = ref('')
const reportTemplatePreviewPdfBase64 = ref('')
const reportTemplatePreviewCanvas = ref(null)
const reportTemplateSections = ref([])
const reportTemplateDragIndex = ref(null)
const backfillingEvents = ref(false)
const bulkReconciliationRunning = ref(false)
const workflowForm = ref({
  source: 'trade-management',
  confidenceLevels: '0.9,0.95,0.99',
  sharedReportAccessThreshold: 10,
  sharedReportAccessWindowMinutes: 15
})
const retentionForm = ref({
  eventRetentionDays: 365,
  telemetryRetentionDays: 90,
  reportAccessRetentionDays: 365
})
const strategyForm = ref({
  source: 'trade-management',
  strategy: 'ORB',
  sharedReportAccessThreshold: 6,
  sharedReportAccessWindowMinutes: 15
})
const suppressionRuleForm = ref({
  alertType: 'execution_report_access_anomaly',
  recurrenceRule: { frequency: 'daily', durationMinutes: 60 },
  reason: 'Known review window'
})
const escalationForm = ref({
  destinationType: 'email',
  target: 'ops@example.com',
  severity: 'warning',
  metadata: {}
})
const destinationActionReason = ref('')
const deliveryReplayReason = ref('Reviewed dead-letter replay after operational triage')
const deliveryReplayLimit = ref(3)
const deliveryReplayReviewNote = ref('Reviewed replay against delivery limit and destination scope')
const deliveryReplayFilters = ref({
  status: '',
  destinationType: '',
  from: '',
  to: ''
})
const reconciliationReason = ref('Reviewed by operations')
const reconciliationBulkAction = ref('ignore')
const reconciliationBulkPreview = ref(null)
const selectedReconciliationIds = ref([])
const reportTemplateForm = ref({
  templateKey: 'trader',
  label: 'Trader Workbook',
  description: '',
  sections: '[]',
  shareDefaults: '{}',
  isEnabled: true
})
const lineageFilters = ref({
  symbol: '',
  strategy: '',
  account: '',
  from: '',
  to: ''
})

const summaryCards = computed(() => [
  { label: 'Runs', value: summary.value.total || 0, detail: `${summary.value.last_24h || 0} created in 24h` },
  { label: 'Active', value: summary.value.active || 0, detail: 'Created, running, or paused' },
  { label: 'Report Accesses', value: summary.value.report_accesses_24h || 0, detail: `${summary.value.shared || 0} shared links` },
  { label: 'Expired Leases', value: slo.value.brokerSyncLeases?.expired || 0, detail: `${slo.value.brokerSyncLeases?.active || 0} active broker leases` }
])

const retentionPolicy = computed(() => slo.value.retentionPolicy || null)
const retentionPreviewItems = computed(() => [
  { label: 'Event rows ready', value: retentionPreview.value.executionRunEvents || 0 },
  { label: 'Telemetry rows ready', value: retentionPreview.value.clientErrorEvents || 0 },
  { label: 'Report access rows ready', value: retentionPreview.value.reportAccesses || 0 }
])
const activeWorkflowSetting = computed(() => workflowSettings.value.find(setting => setting.source === workflowForm.value.source) || workflowSettings.value[0] || null)
const visibleReconciliationIds = computed(() => importAccountReconciliations.value.slice(0, 8).map(item => item.id))
const lineageNodes = computed(() => runs.value.slice(0, 9).sort((a, b) => {
  const order = { live: 1, replay: 2, backtest: 3 }
  return (order[a.mode] || 9) - (order[b.mode] || 9) || new Date(a.createdAt) - new Date(b.createdAt)
}))
const reportTemplateClientValidation = computed(() => {
  const messages = []
  let shareDefaults = null
  try {
    shareDefaults = JSON.parse(reportTemplateForm.value.shareDefaults || '{}')
  } catch (err) {
    messages.push(`Share defaults JSON: ${err.message}`)
  }
  if (!Array.isArray(reportTemplateSections.value)) messages.push('Sections must be an array')
  if (reportTemplateSections.value.some(section => !section.key && !section.label)) messages.push('Every section needs a key or label')
  if (shareDefaults && typeof shareDefaults !== 'object') messages.push('Share defaults must be an object')
  const formats = Array.isArray(shareDefaults?.formats) ? shareDefaults.formats : []
  const invalidFormats = formats.filter(format => !['json', 'csv', 'pdf'].includes(String(format).toLowerCase()))
  if (invalidFormats.length) messages.push(`Unsupported formats: ${invalidFormats.join(', ')}`)
  return {
    valid: messages.length === 0,
    messages: messages.length ? messages : ['Sections and defaults parse cleanly before server validation']
  }
})
const reportTemplatePreviewText = computed(() => {
  if (!reportTemplatePreview.value) return 'No preview generated yet.'
  return String(reportTemplatePreview.value)
})

async function loadAll() {
  loading.value = true
  error.value = ''

  try {
    const runParams = Object.fromEntries(Object.entries({
      limit: 100,
      symbol: lineageFilters.value.symbol || undefined,
      strategy: lineageFilters.value.strategy || undefined,
      account: lineageFilters.value.account || undefined,
      from: lineageFilters.value.from || undefined,
      to: lineageFilters.value.to || undefined
    }).filter(([, value]) => value !== undefined && value !== ''))
    const replayRequestParams = Object.fromEntries(Object.entries({
      limit: 10,
      status: deliveryReplayFilters.value.status || undefined,
      destinationType: deliveryReplayFilters.value.destinationType || undefined,
      from: deliveryReplayFilters.value.from || undefined,
      to: deliveryReplayFilters.value.to || undefined
    }).filter(([, value]) => value !== undefined && value !== ''))
    const [
      summaryResponse,
      runsResponse,
      sloResponse,
      alertsResponse,
      securityEventsResponse,
      redisHealthResponse,
      hmacHealthResponse,
      hmacRotationPreviewResponse,
      retentionPreviewResponse,
      alertAuditsResponse,
      workflowResponse,
      budgetResponse,
      revisionResponse,
      workflowRevisionResponse,
      strategyResponse,
      suppressionRulesResponse,
      escalationDestinationsResponse,
      escalationDestinationAuditsResponse,
      escalationDestinationRequestsResponse,
      escalationDeliveriesResponse,
      escalationDeliveryReplayRequestsResponse,
      importAccountReconciliationsResponse,
      importAccountReconciliationAuditsResponse,
      reportTemplatesResponse,
      reportTemplateRevisionsResponse
    ] = await Promise.all([
      api.get('/admin/execution-runs/summary'),
      api.get('/admin/execution-runs', { params: runParams }),
      api.get('/admin/observability/slo'),
      api.get('/admin/alerts', { params: { status: 'active', limit: 50, includeSuppressed: true } }),
      api.get('/admin/security-events', { params: { limit: 20 } }),
      api.get('/admin/redis/health'),
      api.get('/admin/api-keys/hmac-health'),
      api.get('/admin/api-keys/hmac-rotation-preview'),
      api.get('/admin/retention-policy/preview'),
      api.get('/admin/alerts/audit', { params: { limit: 25 } }),
      api.get('/admin/workflow-settings'),
      api.get('/admin/performance-budgets'),
      api.get('/admin/retention-policy/revisions', { params: { limit: 10 } }),
      api.get('/admin/workflow-settings/revisions', { params: { limit: 10 } }),
      api.get('/admin/strategy-anomaly-settings', { params: { source: 'trade-management' } }),
      api.get('/admin/alerts/suppression-rules'),
      api.get('/admin/alerts/escalation-destinations'),
      api.get('/admin/alerts/escalation-destinations/audits', { params: { limit: 10 } }),
      api.get('/admin/alerts/escalation-destinations/requests', { params: { limit: 10 } }),
      api.get('/admin/alerts/escalation-deliveries', { params: { limit: 10 } }),
      api.get('/admin/alerts/escalation-delivery-replay-requests', { params: replayRequestParams }),
      api.get('/admin/import-account-reconciliations', { params: { limit: 20 } }),
      api.get('/admin/import-account-reconciliation-audits', { params: { limit: 10 } }),
      api.get('/admin/report-templates'),
      api.get('/admin/report-templates/revisions', { params: { limit: 10 } })
    ])
    summary.value = summaryResponse.data.summary || {}
    runs.value = runsResponse.data.runs || []
    slo.value = sloResponse.data.slo || {}
    alerts.value = alertsResponse.data.alerts || []
    securityEvents.value = securityEventsResponse.data.events || []
    redisHealth.value = redisHealthResponse.data.redis || {}
    hmacHealth.value = hmacHealthResponse.data.health || {}
    hmacRotationPreview.value = hmacRotationPreviewResponse.data.preview || {}
    retentionPreview.value = retentionPreviewResponse.data.candidateCounts || {}
    alertAudits.value = alertAuditsResponse.data.audits || []
    workflowSettings.value = workflowResponse.data.settings || []
    performanceBudgets.value = budgetResponse.data.budgets || []
    retentionRevisions.value = revisionResponse.data.revisions || []
    workflowRevisions.value = workflowRevisionResponse.data.revisions || []
    strategyAnomalySettings.value = strategyResponse.data.settings || []
    alertSuppressionRules.value = suppressionRulesResponse.data.rules || []
    alertEscalationDestinations.value = escalationDestinationsResponse.data.destinations || []
    alertEscalationDestinationAudits.value = escalationDestinationAuditsResponse.data.audits || []
    alertEscalationDestinationRequests.value = escalationDestinationRequestsResponse.data.requests || []
    alertEscalationDeliveries.value = escalationDeliveriesResponse.data.deliveries || []
    alertEscalationDeliveryReplayRequests.value = escalationDeliveryReplayRequestsResponse.data.requests || []
    importAccountReconciliations.value = importAccountReconciliationsResponse.data.reconciliations || []
    importAccountReconciliationAudits.value = importAccountReconciliationAuditsResponse.data.audits || []
    selectedReconciliationIds.value = selectedReconciliationIds.value.filter(id => importAccountReconciliations.value.some(item => item.id === id))
    reportTemplates.value = reportTemplatesResponse.data.templates || []
    reportTemplateRevisions.value = reportTemplateRevisionsResponse.data.revisions || []
    syncWorkflowForm()
    syncRetentionForm()
    syncReportTemplateForm()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to load execution run operations data'
  } finally {
    loading.value = false
  }
}

async function scanAlerts() {
  scanningAlerts.value = true
  error.value = ''

  try {
    await api.post('/admin/alerts/scan')
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to scan operational alerts'
  } finally {
    scanningAlerts.value = false
  }
}

async function runAlertAction(alert, action) {
  actingAlertId.value = alert.id
  error.value = ''

  try {
    const payload = action === 'suppress'
      ? {
        action,
        minutes: 60,
        reason: 'Admin acknowledgement window',
        recurrenceRule: { frequency: 'daily', durationMinutes: 60 }
      }
      : { action }
    await api.post(`/admin/alerts/${alert.id}/actions`, payload)
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to update alert'
  } finally {
    actingAlertId.value = null
  }
}

async function saveWorkflowSettings() {
  savingWorkflow.value = true
  error.value = ''

  try {
    await api.post(`/admin/workflow-settings/${encodeURIComponent(workflowForm.value.source || 'default')}/revisions`, {
      confidenceLevels: workflowForm.value.confidenceLevels.split(',').map(level => Number(level.trim())).filter(Boolean),
      sharedReportAccessThreshold: workflowForm.value.sharedReportAccessThreshold,
      sharedReportAccessWindowMinutes: workflowForm.value.sharedReportAccessWindowMinutes
    })
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to save workflow thresholds'
  } finally {
    savingWorkflow.value = false
  }
}

async function runWorkflowRevisionAction(revision, action) {
  savingWorkflow.value = true
  error.value = ''

  try {
    await api.post(`/admin/workflow-settings/revisions/${revision.id}/actions`, { action })
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to review workflow thresholds'
  } finally {
    savingWorkflow.value = false
  }
}

async function saveStrategyThreshold() {
  savingWorkflow.value = true
  error.value = ''

  try {
    await api.post('/admin/strategy-anomaly-settings', {
      source: strategyForm.value.source,
      strategy: strategyForm.value.strategy,
      sharedReportAccessThreshold: strategyForm.value.sharedReportAccessThreshold,
      sharedReportAccessWindowMinutes: strategyForm.value.sharedReportAccessWindowMinutes
    })
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to save strategy threshold'
  } finally {
    savingWorkflow.value = false
  }
}

async function saveSuppressionRule() {
  error.value = ''

  try {
    await api.post('/admin/alerts/suppression-rules', suppressionRuleForm.value)
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to save suppression rule'
  }
}

async function saveEscalationDestination() {
  error.value = ''

  try {
    await api.post('/admin/alerts/escalation-destinations', escalationForm.value)
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to save escalation destination'
  }
}

async function runEscalationDestinationAction(destination, action) {
  actingDestinationId.value = destination.id
  error.value = ''

  try {
    await api.post('/admin/alerts/escalation-destinations/requests', {
      action,
      destinationId: destination.id,
      reason: destinationActionReason.value
    })
    destinationActionReason.value = ''
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to update escalation destination'
  } finally {
    actingDestinationId.value = null
  }
}

async function runEscalationDestinationRequestAction(request, action) {
  actingDestinationId.value = request.destinationId || request.id
  error.value = ''

  try {
    await api.post(`/admin/alerts/escalation-destinations/requests/${request.id}/actions`, { action })
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to review escalation destination request'
  } finally {
    actingDestinationId.value = null
  }
}

async function retryEscalationDelivery(delivery) {
  retryingDeliveryId.value = delivery.id
  error.value = ''

  try {
    await api.post(`/admin/alerts/escalation-deliveries/${delivery.id}/retry`)
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to retry alert delivery'
  } finally {
    retryingDeliveryId.value = null
  }
}

async function requestEscalationDeliveryReplay(delivery) {
  retryingDeliveryId.value = delivery.id
  error.value = ''

  try {
    await api.post(`/admin/alerts/escalation-deliveries/${delivery.id}/replay-requests`, {
      reason: deliveryReplayReason.value,
      maxReplayCount: deliveryReplayLimit.value
    })
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to request dead-letter replay'
  } finally {
    retryingDeliveryId.value = null
  }
}

async function runEscalationDeliveryReplayRequestAction(request, action) {
  actingReplayRequestId.value = request.id
  error.value = ''

  try {
    await api.post(`/admin/alerts/escalation-delivery-replay-requests/${request.id}/actions`, {
      action,
      reviewNote: deliveryReplayReviewNote.value
    })
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to review dead-letter replay'
  } finally {
    actingReplayRequestId.value = null
  }
}

async function runImportReconciliationAction(item, action) {
  actingReconciliationId.value = item.id
  error.value = ''

  try {
    await api.post(`/admin/import-account-reconciliations/${item.id}/actions`, {
      action,
      reason: reconciliationReason.value
    })
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to update import account reconciliation'
  } finally {
    actingReconciliationId.value = null
  }
}

function toggleAllReconciliations(event) {
  selectedReconciliationIds.value = event.target.checked ? [...visibleReconciliationIds.value] : []
}

async function runBulkImportReconciliation(preview = true) {
  bulkReconciliationRunning.value = true
  error.value = ''

  try {
    const response = await api.post('/admin/import-account-reconciliations/bulk-actions', {
      reconciliationIds: selectedReconciliationIds.value,
      action: reconciliationBulkAction.value,
      reason: reconciliationReason.value,
      preview
    })
    if (preview) {
      reconciliationBulkPreview.value = response.data
    } else {
      reconciliationBulkPreview.value = null
      selectedReconciliationIds.value = []
      await loadAll()
    }
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to run bulk reconciliation action'
  } finally {
    bulkReconciliationRunning.value = false
  }
}

async function rollbackImportReconciliationAudit(audit) {
  actingReconciliationId.value = audit.reconciliationId
  error.value = ''

  try {
    await api.post(`/admin/import-account-reconciliation-audits/${audit.id}/rollback`, {
      reason: reconciliationReason.value || `Rollback ${audit.action}`
    })
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to rollback reconciliation audit'
  } finally {
    actingReconciliationId.value = null
  }
}

async function saveReportTemplate() {
  savingReportTemplate.value = true
  error.value = ''

  try {
    const sections = normalizeReportTemplateSections(reportTemplateSections.value)
    const shareDefaults = JSON.parse(reportTemplateForm.value.shareDefaults || '{}')
    await api.post(`/admin/report-templates/${encodeURIComponent(reportTemplateForm.value.templateKey || 'trader')}/revisions`, {
      label: reportTemplateForm.value.label,
      description: reportTemplateForm.value.description,
      sections,
      shareDefaults,
      isEnabled: reportTemplateForm.value.isEnabled
    })
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || err.message || 'Failed to save report template'
  } finally {
    savingReportTemplate.value = false
  }
}

async function runReportTemplateRevisionAction(revision, action) {
  savingReportTemplate.value = true
  error.value = ''

  try {
    await api.post(`/admin/report-templates/revisions/${revision.id}/actions`, { action })
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to review report template revision'
  } finally {
    savingReportTemplate.value = false
  }
}

async function previewReportTemplate() {
  savingReportTemplate.value = true
  error.value = ''

  try {
    const sections = normalizeReportTemplateSections(reportTemplateSections.value)
    const shareDefaults = JSON.parse(reportTemplateForm.value.shareDefaults || '{}')
    const response = await api.post(`/admin/report-templates/${encodeURIComponent(reportTemplateForm.value.templateKey || 'trader')}/preview`, {
      label: reportTemplateForm.value.label,
      description: reportTemplateForm.value.description,
      sections,
      shareDefaults,
      isEnabled: reportTemplateForm.value.isEnabled
    })
    reportTemplateServerValidation.value = response.data.validation || {}
    reportTemplatePreview.value = response.data.visualSnapshot || ''
    reportTemplatePreviewPdfBase64.value = response.data.pdfBase64 || ''
    await nextTick()
    await renderReportTemplatePdfThumbnail()
  } catch (err) {
    error.value = err.response?.data?.error || err.message || 'Failed to preview report template'
  } finally {
    savingReportTemplate.value = false
  }
}

async function backfillEventHashes() {
  backfillingEvents.value = true
  error.value = ''

  try {
    const response = await api.post('/admin/execution-runs/events/backfill-hashes', { limit: 5000 })
    error.value = ''
    summary.value = {
      ...summary.value,
      event_hash_backfill_checked: response.data.checkedEvents,
      event_hash_backfill_updated: response.data.updatedEvents
    }
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to backfill execution event hashes'
  } finally {
    backfillingEvents.value = false
  }
}

async function requestRetentionUpdate() {
  savingRetention.value = true
  error.value = ''

  try {
    await api.post('/admin/retention-policy/revisions', {
      eventRetentionDays: retentionForm.value.eventRetentionDays,
      telemetryRetentionDays: retentionForm.value.telemetryRetentionDays,
      reportAccessRetentionDays: retentionForm.value.reportAccessRetentionDays
    })
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to request retention policy update'
  } finally {
    savingRetention.value = false
  }
}

async function runRetentionRevisionAction(revision, action) {
  savingRetention.value = true
  error.value = ''

  try {
    await api.post(`/admin/retention-policy/revisions/${revision.id}/actions`, { action })
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to review retention policy update'
  } finally {
    savingRetention.value = false
  }
}

function syncWorkflowForm() {
  const setting = workflowSettings.value.find(item => item.source === workflowForm.value.source) || workflowSettings.value[0]
  if (!setting) return
  workflowForm.value = {
    source: setting.source,
    confidenceLevels: (setting.confidenceLevels || []).join(','),
    sharedReportAccessThreshold: setting.sharedReportAccessThreshold || 10,
    sharedReportAccessWindowMinutes: setting.sharedReportAccessWindowMinutes || 15
  }
}

function syncRetentionForm() {
  const policy = retentionPolicy.value
  if (!policy) return
  retentionForm.value = {
    eventRetentionDays: policy.eventRetentionDays || 365,
    telemetryRetentionDays: policy.telemetryRetentionDays || 90,
    reportAccessRetentionDays: policy.reportAccessRetentionDays || 365
  }
}

function syncReportTemplateForm() {
  const template = reportTemplates.value.find(item => item.templateKey === reportTemplateForm.value.templateKey) || reportTemplates.value[0]
  if (!template) return
  reportTemplateForm.value = {
    templateKey: template.templateKey,
    label: template.label || '',
    description: template.description || '',
    sections: JSON.stringify(template.sections || [], null, 2),
    shareDefaults: JSON.stringify(template.shareDefaults || {}, null, 2),
    isEnabled: template.isEnabled !== false
  }
  reportTemplateSections.value = normalizeReportTemplateSections(template.sections || [])
  reportTemplateServerValidation.value = {}
  reportTemplatePreview.value = ''
  reportTemplatePreviewPdfBase64.value = ''
  clearReportTemplatePdfThumbnail()
}

function normalizeReportTemplateSections(sections = []) {
  return (Array.isArray(sections) ? sections : [])
    .map(section => ({
      key: String(section.key || '').trim(),
      label: String(section.label || '').trim(),
      enabled: section.enabled !== false
    }))
    .filter(section => section.key || section.label)
}

function addReportTemplateSection() {
  reportTemplateSections.value.push({
    key: `section_${reportTemplateSections.value.length + 1}`,
    label: 'New Section',
    enabled: true
  })
}

function moveReportTemplateSection(index, direction) {
  const target = index + direction
  if (target < 0 || target >= reportTemplateSections.value.length) return
  const sections = [...reportTemplateSections.value]
  const [section] = sections.splice(index, 1)
  sections.splice(target, 0, section)
  reportTemplateSections.value = sections
}

function removeReportTemplateSection(index) {
  reportTemplateSections.value = reportTemplateSections.value.filter((_, itemIndex) => itemIndex !== index)
}

function dragReportTemplateSection(index) {
  reportTemplateDragIndex.value = index
}

function dropReportTemplateSection(index) {
  const from = reportTemplateDragIndex.value
  reportTemplateDragIndex.value = null
  if (from === null || from === index) return
  const sections = [...reportTemplateSections.value]
  const [section] = sections.splice(from, 1)
  sections.splice(index, 0, section)
  reportTemplateSections.value = sections
}

function clearReportTemplatePdfThumbnail() {
  const canvas = reportTemplatePreviewCanvas.value
  if (!canvas) return
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, canvas.width || 1, canvas.height || 1)
}

function canvasInkRatio(canvas) {
  const context = canvas.getContext('2d')
  const sampleWidth = Math.max(1, canvas.width || 1)
  const sampleHeight = Math.max(1, canvas.height || 1)
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data
  let ink = 0
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245) ink += 1
  }
  return ink / Math.max(1, sampleWidth * sampleHeight)
}

function drawReportTemplateSnapshotThumbnail() {
  const canvas = reportTemplatePreviewCanvas.value
  if (!canvas) return
  const context = canvas.getContext('2d')
  canvas.width = 260
  canvas.height = 360
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#111827'
  context.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
  const lines = reportTemplatePreviewText.value.split('\n').slice(0, 28)
  lines.forEach((line, index) => {
    context.fillText(line.slice(0, 42), 14, 22 + index * 12)
  })
}

async function renderReportTemplatePdfThumbnail() {
  const canvas = reportTemplatePreviewCanvas.value
  if (!canvas || !reportTemplatePreviewPdfBase64.value) {
    drawReportTemplateSnapshotThumbnail()
    return
  }
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
    const binary = atob(reportTemplatePreviewPdfBase64.value)
    const data = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      data[index] = binary.charCodeAt(index)
    }
    const pdf = await pdfjs.getDocument({ data }).promise
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 0.45 })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport
    }).promise
    if (canvasInkRatio(canvas) < 0.02) drawReportTemplateSnapshotThumbnail()
  } catch {
    drawReportTemplateSnapshotThumbnail()
  }
}

async function runRetentionPolicy() {
  retentionRunning.value = true
  error.value = ''

  try {
    await api.post('/admin/retention-policy/run')
    await loadAll()
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to run retention policy'
  } finally {
    retentionRunning.value = false
  }
}

async function downloadReport(run, format = 'json') {
  const response = await api.get(`/admin/execution-runs/${run.id}/report`, {
    params: { format },
    responseType: format === 'json' ? 'json' : 'blob'
  })
  const blob = format === 'json'
    ? new Blob([JSON.stringify(response.data.report, null, 2)], { type: 'application/json' })
    : response.data
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `execution-run-${run.id}.${format}`
  link.click()
  URL.revokeObjectURL(url)
}

function summarizeMetrics(metrics = {}) {
  const entries = Object.entries(metrics).slice(0, 3)
  if (entries.length === 0) return '-'
  return entries.map(([key, value]) => `${key}: ${value}`).join(' | ')
}

function statusClass(status) {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
  if (status === 'failed' || status === 'cancelled') return 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
  return 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
}

function shortId(value) {
  return value ? String(value).slice(0, 8) : '-'
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

onMounted(loadAll)
</script>
