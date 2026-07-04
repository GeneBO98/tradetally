const { schemas } = require('../../src/middleware/validation');

const checklistItem = {
  label: 'Entry followed plan',
  itemOrder: 0,
  weight: 1,
  isRequired: true
};

describe('playbook API validation', () => {
  it('accepts create payloads with reviewMode and autoAssignEnabled', () => {
    const { error, value } = schemas.createPlaybook.validate({
      name: 'ORB Grade',
      reviewMode: 'score',
      autoAssignEnabled: true,
      requiredStrategy: 'ORB',
      checklistItems: [checklistItem]
    });

    expect(error).toBeUndefined();
    expect(value.reviewMode).toBe('score');
    expect(value.autoAssignEnabled).toBe(true);
  });

  it('accepts update payloads with reviewMode and autoAssignEnabled', () => {
    const { error, value } = schemas.updatePlaybook.validate({
      name: 'ORB Checklist',
      reviewMode: 'checklist',
      autoAssignEnabled: false,
      checklistItems: [checklistItem]
    });

    expect(error).toBeUndefined();
    expect(value.reviewMode).toBe('checklist');
    expect(value.autoAssignEnabled).toBe(false);
  });

  it('accepts score-mode review criterion scores', () => {
    const { error } = schemas.submitPlaybookReview.validate({
      playbookId: '6ad4970a-bef5-4919-b886-061396fa3910',
      checklistResponses: [
        {
          checklistItemId: '4980a5b1-c475-474d-a619-87a51a080877',
          score: 4.5
        }
      ],
      followedPlan: null,
      reviewNotes: 'Manual grade'
    });

    expect(error).toBeUndefined();
  });

  it('rejects criterion scores outside 0-5', () => {
    const { error } = schemas.submitPlaybookReview.validate({
      playbookId: '6ad4970a-bef5-4919-b886-061396fa3910',
      checklistResponses: [
        {
          checklistItemId: '4980a5b1-c475-474d-a619-87a51a080877',
          score: 5.5
        }
      ]
    });

    expect(error).toBeDefined();
    expect(error.details[0].path).toEqual(['checklistResponses', 0, 'score']);
  });

  it('keeps existing checklist review payloads valid', () => {
    const { error } = schemas.submitPlaybookReview.validate({
      playbookId: '6ad4970a-bef5-4919-b886-061396fa3910',
      checklistResponses: [
        {
          checklistItemId: '4980a5b1-c475-474d-a619-87a51a080877',
          checked: true
        }
      ],
      followedPlan: true
    });

    expect(error).toBeUndefined();
  });
});
