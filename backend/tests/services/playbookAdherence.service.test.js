const PlaybookAdherenceService = require('../../src/services/playbookAdherence.service');

const checklistItems = [
  { id: 'item-1', label: 'Entry at planned level', item_order: 0, weight: 2, is_required: true },
  { id: 'item-2', label: 'Risk defined', item_order: 1, weight: 1, is_required: false }
];

describe('PlaybookAdherenceService', () => {
  describe('score mode reviews', () => {
    it('calculates weighted 0-5 criteria before hard-rule penalties', () => {
      const review = PlaybookAdherenceService.buildReview(
        {
          review_mode: 'score',
          side: 'long',
          require_stop_loss: false,
          minimum_target_r: null
        },
        { side: 'long' },
        checklistItems,
        [
          { checklistItemId: 'item-1', score: 5 },
          { checklistItemId: 'item-2', score: 2.5 }
        ]
      );

      expect(review.checklistScore).toBe(83.33);
      expect(review.adherenceScore).toBe(83.33);
      expect(review.grade).toBe('B');
      expect(review.checklistResponses[0]).toMatchObject({
        checklistItemId: 'item-1',
        score: 5,
        maxScore: 5,
        checked: true
      });
    });

    it('applies hard-rule penalties after manual score calculation', () => {
      const review = PlaybookAdherenceService.buildReview(
        {
          review_mode: 'score',
          side: 'long',
          require_stop_loss: true,
          minimum_target_r: null
        },
        { side: 'short', stop_loss: null },
        checklistItems,
        [
          { checklistItemId: 'item-1', score: 5 },
          { checklistItemId: 'item-2', score: 5 }
        ]
      );

      expect(review.checklistScore).toBe(100);
      expect(review.adherenceScore).toBe(76);
      expect(review.grade).toBe('C');
      expect(review.violationSummary).toEqual([
        'Trade is missing a stop loss.',
        'Trade side does not match the long playbook.'
      ]);
    });
  });

  describe('checklist mode reviews', () => {
    it('keeps existing weighted checked unchecked behavior', () => {
      const review = PlaybookAdherenceService.buildReview(
        {
          review_mode: 'checklist',
          side: 'both',
          require_stop_loss: false,
          minimum_target_r: null
        },
        { side: 'long' },
        checklistItems,
        [
          { checklistItemId: 'item-1', checked: true },
          { checklistItemId: 'item-2', checked: false }
        ]
      );

      expect(review.checklistScore).toBe(66.67);
      expect(review.adherenceScore).toBe(66.67);
      expect(review.grade).toBeNull();
      expect(review.checklistResponses[0]).toMatchObject({
        checklistItemId: 'item-1',
        checked: true
      });
    });
  });

  describe('auto-assign suggestions', () => {
    it('picks the most specific active matching profile', () => {
      const trade = {
        side: 'long',
        strategy: 'ORB',
        setup: 'Opening range break',
        tags: ['A+', 'Momentum'],
        entry_time: '2026-06-16T14:30:00.000Z',
        exit_time: '2026-06-16T15:30:00.000Z'
      };

      const suggested = PlaybookAdherenceService.selectSuggestedPlaybook([
        {
          id: 'generic',
          name: 'ORB',
          is_active: true,
          auto_assign_enabled: true,
          required_strategy: 'ORB'
        },
        {
          id: 'inactive',
          name: 'Inactive exact',
          is_active: false,
          auto_assign_enabled: true,
          required_strategy: 'ORB',
          required_setup: 'Opening range break',
          required_tags: ['A+']
        },
        {
          id: 'specific',
          name: 'ORB A+ Long',
          is_active: true,
          auto_assign_enabled: true,
          side: 'long',
          timeframe: 'day_trading',
          required_strategy: 'ORB',
          required_setup: 'Opening range break',
          required_tags: ['A+']
        },
        {
          id: 'disabled',
          name: 'Disabled',
          is_active: true,
          auto_assign_enabled: false,
          required_strategy: 'ORB',
          required_setup: 'Opening range break'
        }
      ], trade);

      expect(suggested.id).toBe('specific');
    });

    it('returns no suggestion when an auto profile has no configured match rules', () => {
      const suggested = PlaybookAdherenceService.selectSuggestedPlaybook([
        {
          id: 'empty',
          name: 'Empty',
          is_active: true,
          auto_assign_enabled: true,
          side: 'both',
          required_tags: []
        }
      ], { side: 'long' });

      expect(suggested).toBeNull();
    });
  });
});
