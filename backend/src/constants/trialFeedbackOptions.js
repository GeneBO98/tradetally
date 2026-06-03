const TRIAL_FEEDBACK_OPTIONS = [
  { value: 'too_expensive', label: 'Too expensive' },
  { value: 'missing_features', label: 'Missing features I need' },
  { value: 'not_enough_value', label: "I didn't see enough value yet" },
  { value: 'setup_too_hard', label: 'Import or setup felt too hard' },
  { value: 'using_another_tool', label: 'I am using another tool' },
  { value: 'not_trading_right_now', label: 'I am not trading right now' },
  { value: 'bugs_or_reliability', label: 'Bugs, reliability, or performance issues' },
  { value: 'just_exploring', label: 'I was just exploring' }
];

const TRIAL_FEEDBACK_OPTION_VALUES = new Set(
  TRIAL_FEEDBACK_OPTIONS.map((option) => option.value)
);

module.exports = {
  TRIAL_FEEDBACK_OPTIONS,
  TRIAL_FEEDBACK_OPTION_VALUES
};
