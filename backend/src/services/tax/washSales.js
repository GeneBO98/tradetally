/**
 * Wash sales (IRC section 1091): a loss on a security is disallowed to the
 * extent the same security is acquired within 30 days before or after the
 * sale, and the disallowed amount is added to the basis of the replacement.
 *
 * Runs over a user's whole history across every account, because the
 * deferred loss travels with the replacement lot: a December loss washed by a
 * January purchase surfaces when that January lot is finally sold.
 *
 * What this does and does not do (the report states the same to the user):
 *  - "Same security" is the same ticker, or the same option contract. Options
 *    are not matched against their underlying stock.
 *  - A replacement is a lot of the same security and direction, opened inside
 *    the window, that is still open at the time of the loss or opened after it.
 *    Each replacement share is used once.
 *  - The holding period of the replacement lot is not extended by the washed
 *    lot's holding period.
 *
 * Mutates the dispositions it is given, adding:
 *   carriedBasis    - earlier disallowed loss now included in this line's basis
 *   washDisallowed  - loss on this line that is disallowed (0 if none)
 *   washQuantity    - units of this line matched to replacements
 */

const WINDOW_DAYS = 30;
const EPSILON = 1e-9;

function applyWashSales(lots, dispositions) {
  const bySecurity = new Map();
  for (const lot of lots) {
    lot.pendingWash = 0;
    lot.replacementCapacity = lot.quantity;
    // `remaining` is replayed here in sale order, independent of the builder.
    lot.remaining = lot.quantity;
    const key = `${lot.securityKey}|${lot.direction}`;
    if (!bySecurity.has(key)) bySecurity.set(key, []);
    bySecurity.get(key).push(lot);
  }
  for (const group of bySecurity.values()) {
    group.sort((a, b) => a.openedMs - b.openedMs);
  }

  const ordered = [...dispositions].sort((a, b) => a.closedMs - b.closedMs || a.openedMs - b.openedMs);

  for (const disposition of ordered) {
    const lot = disposition.lot;

    // Basis carried in from an earlier wash sale, pro rata over what is left of the lot.
    const share = lot.remaining > EPSILON ? Math.min(1, disposition.quantity / lot.remaining) : 1;
    const carried = lot.pendingWash * share;
    lot.pendingWash -= carried;
    lot.remaining -= disposition.quantity;
    lot.replacementCapacity = Math.max(0, Math.min(lot.replacementCapacity, lot.remaining));

    disposition.carriedBasis = carried;
    disposition.washDisallowed = 0;
    disposition.washQuantity = 0;

    const gain = disposition.proceeds - disposition.basis - carried;
    if (gain >= -0.005) continue;

    const group = bySecurity.get(`${lot.securityKey}|${lot.direction}`) || [];
    let matched = 0;
    for (const candidate of group) {
      if (matched >= disposition.quantity - EPSILON) break;
      if (candidate === lot) continue;
      if (candidate.openedDay < disposition.closedDay - WINDOW_DAYS) continue;
      if (candidate.openedDay > disposition.closedDay + WINDOW_DAYS) break;

      // A lot opened before the loss only counts for the units still held.
      const openedBefore = candidate.openedMs <= disposition.closedMs;
      const usable = openedBefore
        ? Math.min(candidate.replacementCapacity, candidate.remaining)
        : candidate.replacementCapacity;
      if (usable <= EPSILON) continue;

      const take = Math.min(usable, disposition.quantity - matched);
      const disallowed = -gain * (take / disposition.quantity);
      candidate.replacementCapacity -= take;
      candidate.pendingWash += disallowed;
      disposition.washDisallowed += disallowed;
      matched += take;
    }
    disposition.washQuantity = matched;
  }

  return ordered;
}

module.exports = { applyWashSales, WINDOW_DAYS };
