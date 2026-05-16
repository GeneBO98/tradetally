function requiresTwoPersonApproval() {
  return process.env.REQUIRE_TWO_PERSON_APPROVAL === 'true' || process.env.NODE_ENV === 'production';
}

function assertCanReviewOwnRequest({ requestedBy, reviewerUserId, resource = 'request' } = {}) {
  if (!requiresTwoPersonApproval()) return;

  if (!reviewerUserId) {
    const error = new Error(`A reviewer is required for production ${resource} approval`);
    error.status = 403;
    throw error;
  }

  if (requestedBy && String(requestedBy) === String(reviewerUserId)) {
    const error = new Error(`Production ${resource} approval requires a different reviewer`);
    error.status = 403;
    throw error;
  }
}

module.exports = {
  assertCanReviewOwnRequest,
  requiresTwoPersonApproval
};
