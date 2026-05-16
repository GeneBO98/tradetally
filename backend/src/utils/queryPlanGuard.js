function normalizeExplainPlan(explainJson) {
  if (Array.isArray(explainJson)) {
    return explainJson[0]?.Plan || explainJson[0]?.plan || explainJson[0];
  }
  return explainJson?.Plan || explainJson?.plan || explainJson;
}

function collectPlanNodes(plan) {
  const root = normalizeExplainPlan(plan);
  const nodes = [];

  function visit(node) {
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    const children = node.Plans || node.plans || [];
    children.forEach(visit);
  }

  visit(root);
  return nodes;
}

function findRiskySeqScans(plan, options = {}) {
  const {
    relationNames = [],
    minPlanRows = 10000
  } = options;
  const relationSet = new Set(relationNames);

  return collectPlanNodes(plan).filter((node) => {
    const nodeType = node['Node Type'] || node.nodeType;
    const relationName = node['Relation Name'] || node.relationName;
    const planRows = Number(node['Plan Rows'] ?? node.planRows ?? 0);

    if (nodeType !== 'Seq Scan') return false;
    if (relationSet.size > 0 && !relationSet.has(relationName)) return false;
    return planRows >= minPlanRows;
  });
}

module.exports = {
  collectPlanNodes,
  findRiskySeqScans,
  normalizeExplainPlan
};
