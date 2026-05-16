const { collectPlanNodes, findRiskySeqScans } = require('../../src/utils/queryPlanGuard');

describe('queryPlanGuard', () => {
  test('collects nested plan nodes from EXPLAIN JSON', () => {
    const plan = [{
      Plan: {
        'Node Type': 'Nested Loop',
        Plans: [
          { 'Node Type': 'Index Scan', 'Relation Name': 'users' },
          { 'Node Type': 'Seq Scan', 'Relation Name': 'trades', 'Plan Rows': 42 }
        ]
      }
    }];

    expect(collectPlanNodes(plan).map(node => node['Node Type'])).toEqual([
      'Nested Loop',
      'Index Scan',
      'Seq Scan'
    ]);
  });

  test('flags high-cardinality Seq Scans on guarded relations', () => {
    const plan = [{
      Plan: {
        'Node Type': 'Seq Scan',
        'Relation Name': 'trades',
        'Plan Rows': 250000
      }
    }];

    expect(findRiskySeqScans(plan, { relationNames: ['trades'], minPlanRows: 10000 })).toHaveLength(1);
    expect(findRiskySeqScans(plan, { relationNames: ['users'], minPlanRows: 10000 })).toHaveLength(0);
  });
});
