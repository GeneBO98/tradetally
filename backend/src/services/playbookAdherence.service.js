class PlaybookAdherenceService {
  static normalizeChecklistItems(items = []) {
    return (items || [])
      .map((item, index) => ({
        id: item.id,
        label: item.label,
        order: Number.isFinite(Number(item.item_order)) ? Number(item.item_order) : index,
        weight: Math.max(0, Number(item.weight) || 1),
        isRequired: item.is_required === true || item.isRequired === true
      }))
      .sort((a, b) => a.order - b.order);
  }

  static categorizeTimeframe(trade) {
    if (!trade?.entry_time) return null;

    const entry = new Date(trade.entry_time);
    const exit = trade.exit_time ? new Date(trade.exit_time) : new Date();

    if (Number.isNaN(entry.getTime()) || Number.isNaN(exit.getTime())) {
      return null;
    }

    const holdSeconds = Math.max(0, (exit.getTime() - entry.getTime()) / 1000);

    if (holdSeconds < 900) return 'scalper';
    if (holdSeconds < 86400) return 'day_trading';
    if (holdSeconds < 604800) return 'swing';
    return 'position';
  }

  static calculatePlannedTargetR(trade) {
    const entryPrice = Number(trade?.entry_price);
    const stopLoss = Number(trade?.stop_loss);

    if (!Number.isFinite(entryPrice) || !Number.isFinite(stopLoss)) {
      return null;
    }

    const targets = [];
    if (Array.isArray(trade?.take_profit_targets)) {
      targets.push(
        ...trade.take_profit_targets
          .map(target => Number(target?.price))
          .filter(Number.isFinite)
      );
    }

    const takeProfit = Number(trade?.take_profit);
    if (Number.isFinite(takeProfit)) {
      targets.push(takeProfit);
    }

    if (targets.length === 0) {
      return null;
    }

    const riskPerUnit = trade.side === 'short'
      ? stopLoss - entryPrice
      : entryPrice - stopLoss;

    if (!Number.isFinite(riskPerUnit) || riskPerUnit <= 0) {
      return null;
    }

    const targetRs = targets
      .map(targetPrice => {
        const rewardPerUnit = trade.side === 'short'
          ? entryPrice - targetPrice
          : targetPrice - entryPrice;
        return rewardPerUnit / riskPerUnit;
      })
      .filter(value => Number.isFinite(value) && value > 0);

    if (targetRs.length === 0) {
      return null;
    }

    return Math.max(...targetRs);
  }

  static evaluateRules(playbook, trade) {
    const rules = [];

    const addRule = ({ key, label, passed, expected, actual, violationMessage, penalty = 12 }) => {
      rules.push({
        key,
        label,
        passed,
        expected,
        actual,
        violationMessage: passed ? null : violationMessage,
        penalty: passed ? 0 : penalty
      });
    };

    if (playbook.require_stop_loss) {
      addRule({
        key: 'stop_loss_present',
        label: 'Stop loss present',
        passed: trade.stop_loss !== null && trade.stop_loss !== undefined,
        expected: 'Trade has a stop loss',
        actual: trade.stop_loss ?? null,
        violationMessage: 'Trade is missing a stop loss.'
      });
    }

    if (playbook.minimum_target_r !== null && playbook.minimum_target_r !== undefined) {
      const plannedTargetR = this.calculatePlannedTargetR(trade);
      addRule({
        key: 'minimum_target_r',
        label: 'Minimum planned target R',
        passed: Number.isFinite(plannedTargetR) && plannedTargetR >= Number(playbook.minimum_target_r),
        expected: `>= ${Number(playbook.minimum_target_r).toFixed(2)}R`,
        actual: plannedTargetR !== null ? `${plannedTargetR.toFixed(2)}R` : 'No valid target R',
        violationMessage: 'Trade does not meet the minimum planned target R.'
      });
    }

    if (playbook.side && playbook.side !== 'both') {
      addRule({
        key: 'side_match',
        label: 'Side matches playbook',
        passed: trade.side === playbook.side,
        expected: playbook.side,
        actual: trade.side || null,
        violationMessage: `Trade side does not match the ${playbook.side} playbook.`
      });
    }

    if (playbook.timeframe) {
      const timeframe = this.categorizeTimeframe(trade);
      addRule({
        key: 'timeframe_match',
        label: 'Timeframe matches playbook',
        passed: timeframe === playbook.timeframe,
        expected: playbook.timeframe,
        actual: timeframe,
        violationMessage: 'Trade hold time does not match the playbook timeframe.'
      });
    }

    if (playbook.required_strategy) {
      addRule({
        key: 'strategy_match',
        label: 'Strategy matches playbook',
        passed: (trade.strategy || '').trim().toLowerCase() === playbook.required_strategy.trim().toLowerCase(),
        expected: playbook.required_strategy,
        actual: trade.strategy || null,
        violationMessage: 'Trade strategy does not match the playbook.'
      });
    }

    if (playbook.required_setup) {
      addRule({
        key: 'setup_match',
        label: 'Setup matches playbook',
        passed: (trade.setup || '').trim().toLowerCase() === playbook.required_setup.trim().toLowerCase(),
        expected: playbook.required_setup,
        actual: trade.setup || null,
        violationMessage: 'Trade setup does not match the playbook.'
      });
    }

    if (Array.isArray(playbook.required_tags) && playbook.required_tags.length > 0) {
      const required = playbook.required_tags.map(tag => tag.toLowerCase());
      const actualTags = Array.isArray(trade.tags) ? trade.tags.map(tag => String(tag).toLowerCase()) : [];
      const missing = required.filter(tag => !actualTags.includes(tag));
      addRule({
        key: 'required_tags_match',
        label: 'Required tags present',
        passed: missing.length === 0,
        expected: playbook.required_tags,
        actual: trade.tags || [],
        violationMessage: missing.length > 0 ? `Trade is missing required tags: ${missing.join(', ')}` : null
      });
    }

    return rules;
  }

  static scoreChecklist(checklistItems, checklistResponses = []) {
    const responseMap = new Map(
      (checklistResponses || []).map(response => [
        response.checklistItemId || response.checklist_item_id || response.id,
        response.checked === true
      ])
    );

    const normalizedItems = this.normalizeChecklistItems(checklistItems);
    const totalWeight = normalizedItems.reduce((sum, item) => sum + (item.weight > 0 ? item.weight : 1), 0) || 1;
    const responseSummary = normalizedItems.map(item => ({
      checklistItemId: item.id,
      label: item.label,
      checked: responseMap.get(item.id) === true,
      isRequired: item.isRequired,
      weight: item.weight > 0 ? item.weight : 1
    }));

    const earnedWeight = responseSummary.reduce((sum, item) => (
      item.checked ? sum + item.weight : sum
    ), 0);

    const checklistScore = (earnedWeight / totalWeight) * 100;

    return {
      checklistScore: Math.max(0, Math.min(100, checklistScore)),
      checklistResponses: responseSummary
    };
  }

  static buildReview(playbook, trade, checklistItems, checklistResponses) {
    const { checklistScore, checklistResponses: normalizedResponses } = this.scoreChecklist(checklistItems, checklistResponses);
    const ruleResults = this.evaluateRules(playbook, trade);
    const penalties = ruleResults.reduce((sum, rule) => sum + (rule.penalty || 0), 0);
    const adherenceScore = Math.max(0, Math.min(100, checklistScore - penalties));
    const violationSummary = ruleResults
      .filter(rule => !rule.passed && rule.violationMessage)
      .map(rule => rule.violationMessage);

    return {
      checklistScore: Number(checklistScore.toFixed(2)),
      adherenceScore: Number(adherenceScore.toFixed(2)),
      checklistResponses: normalizedResponses,
      ruleResults: ruleResults.map(rule => ({
        key: rule.key,
        label: rule.label,
        passed: rule.passed,
        expected: rule.expected,
        actual: rule.actual,
        violationMessage: rule.violationMessage
      })),
      violationSummary
    };
  }
}

module.exports = PlaybookAdherenceService;
