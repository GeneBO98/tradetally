const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const TradeAllocationService = require('../services/tradeAllocationService');

function sendServiceError(next, error) {
  if (error.statusCode) {
    return next(new AppError(error.statusCode, { error: error.message }));
  }
  return next(error);
}

const requireEnabled = asyncHandler(async (req, res, next) => {
  if (!(await TradeAllocationService.isEnabled(req.user.id))) {
    return res.status(403).json({
      error: 'Trade allocations are not enabled for this account'
    });
  }
  next();
});

const listGroups = asyncHandler(async (req, res, next) => {
  try {
    const groups = await TradeAllocationService.listGroups(req.user.id, {
      includeArchived: req.query.include_archived === 'true'
    });
    res.json({ groups });
  } catch (error) {
    sendServiceError(next, error);
  }
});

const createGroup = asyncHandler(async (req, res, next) => {
  try {
    const group = await TradeAllocationService.createGroup(req.user.id, req.body);
    res.status(201).json({ group });
  } catch (error) {
    sendServiceError(next, error);
  }
});

const updateGroup = asyncHandler(async (req, res, next) => {
  try {
    const group = await TradeAllocationService.updateGroup(req.user.id, req.params.id, req.body);
    res.json({ group });
  } catch (error) {
    sendServiceError(next, error);
  }
});

const archiveGroup = asyncHandler(async (req, res, next) => {
  try {
    const group = await TradeAllocationService.archiveGroup(req.user.id, req.params.id);
    res.json({ group });
  } catch (error) {
    sendServiceError(next, error);
  }
});

const getTradeAllocations = asyncHandler(async (req, res, next) => {
  try {
    const result = await TradeAllocationService.getTradeAllocations(req.user.id, req.params.trade_id);
    res.json(result);
  } catch (error) {
    sendServiceError(next, error);
  }
});

const replaceTradeAllocations = asyncHandler(async (req, res, next) => {
  try {
    const result = await TradeAllocationService.replaceTradeAllocations(
      req.user.id,
      req.params.trade_id,
      req.body.allocations
    );
    res.json(result);
  } catch (error) {
    sendServiceError(next, error);
  }
});

const clearTradeAllocations = asyncHandler(async (req, res, next) => {
  try {
    await TradeAllocationService.clearTradeAllocations(req.user.id, req.params.trade_id);
    res.json({ message: 'Trade allocation cleared' });
  } catch (error) {
    sendServiceError(next, error);
  }
});

const replaceBulkTradeAllocations = asyncHandler(async (req, res, next) => {
  try {
    const result = await TradeAllocationService.replaceBulkTradeAllocations(
      req.user.id,
      req.body.trade_ids,
      req.body.allocations
    );
    res.json(result);
  } catch (error) {
    sendServiceError(next, error);
  }
});

const getSummary = asyncHandler(async (req, res, next) => {
  try {
    const accounts = req.query.accounts
      ? String(req.query.accounts).split(',').map((account) => account.trim()).filter(Boolean)
      : undefined;
    const summary = await TradeAllocationService.getSummary(req.user.id, { accounts });
    res.json(summary);
  } catch (error) {
    sendServiceError(next, error);
  }
});

module.exports = {
  requireEnabled,
  listGroups,
  createGroup,
  updateGroup,
  archiveGroup,
  getTradeAllocations,
  replaceTradeAllocations,
  clearTradeAllocations,
  replaceBulkTradeAllocations,
  getSummary
};
