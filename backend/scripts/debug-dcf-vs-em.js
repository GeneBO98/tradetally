/**
 * Debug script: reverse-engineer EM's fair value formula.
 *
 * Hardcodes AAPL inputs (as EM would have seen them at current price ~$287.19)
 * and runs the same scenario inputs through several formula variations.
 * Prints fair values side-by-side with EM's reported outputs so we can
 * see which formula is closest.
 *
 * Run: node backend/scripts/debug-dcf-vs-em.js
 */

// AAPL fundamentals — EM's screenshot showed current price $287.19, which
// corresponds to AAPL's price during the FY2024-data period (Oct 2024 -
// Sep 2025). Using FY2024 reported financials as the projection base.
const AAPL_FY2024 = {
  revenue: 391_035e6,
  netIncome: 93_736e6,
  fcf: 108_807e6,
  shares: 15_408e6,
  currentPrice: 287.19
};

// FY2025 alt — in case EM was using more recent data
const AAPL_FY2025 = {
  revenue: 416_161e6,
  netIncome: 112_010e6,
  fcf: 97_840e6,
  shares: 14_940e6,
  currentPrice: 287.19
};

// User's assumptions from the screenshots
const SCENARIOS = {
  Bear: { growth: 0.04, profitMargin: 0.26, fcfMargin: 0.25, pe: 19, pfcf: 19, required: 0.09 },
  Base: { growth: 0.08, profitMargin: 0.27, fcfMargin: 0.265, pe: 23, pfcf: 23, required: 0.09 },
  Bull: { growth: 0.13, profitMargin: 0.28, fcfMargin: 0.28, pe: 28, pfcf: 28, required: 0.09 }
};

// EM's reported fair values (from the screenshot)
const EM_TARGETS = {
  Bear: { earnings: 151.84, dcf: 146.00, irr: 0.0050 },
  Base: { earnings: 244.77, dcf: 240.24, irr: 0.0676 },
  Bull: { earnings: 437.54, dcf: 437.54, irr: 0.1431 }
};

const YEARS = 10;

function fmt(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '   n/a ';
  return `$${value.toFixed(2)}`.padStart(8);
}

function fmtPct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return ' n/a ';
  return `${(value * 100).toFixed(2)}%`.padStart(6);
}

/**
 * Run all formula variations for a single scenario.
 */
function runScenario(name, base, inputs, em) {
  const { revenue, netIncome, fcf, shares } = base;
  const { growth, profitMargin, fcfMargin, pe, pfcf, required } = inputs;

  const growthFactor = Math.pow(1 + growth, YEARS);
  const futureRevenue = revenue * growthFactor;
  const futureNI = futureRevenue * profitMargin;
  const futureFCF = futureRevenue * fcfMargin;

  // ===== Formula variants =====

  // V1: Textbook DCF (current TradeTally formula)
  // Future Price = (Future NI / shares) × multiple
  // Fair Value = Future Price / (1+r)^N
  const fullDiscount = Math.pow(1 + required, YEARS);
  const v1_pe_future = (futureNI / shares) * pe;
  const v1_pfcf_future = (futureFCF / shares) * pfcf;
  const v1_pe_fv = v1_pe_future / fullDiscount;
  const v1_pfcf_fv = v1_pfcf_future / fullDiscount;

  // V2: Half-period discount
  // Fair Value = Future Price / (1+r)^(N/2)
  const halfDiscount = Math.pow(1 + required, YEARS / 2);
  const v2_pe_fv = v1_pe_future / halfDiscount;
  const v2_pfcf_fv = v1_pfcf_future / halfDiscount;

  // V3: No discount (fair value = future price)
  const v3_pe_fv = v1_pe_future;
  const v3_pfcf_fv = v1_pfcf_future;

  // V4: Textbook DCF with 3% share buybacks
  const sharesBuyback3 = shares * Math.pow(0.97, YEARS);
  const v4_pe_fv = (futureNI / sharesBuyback3 * pe) / fullDiscount;
  const v4_pfcf_fv = (futureFCF / sharesBuyback3 * pfcf) / fullDiscount;

  // V5: Textbook DCF with 4% share buybacks
  const sharesBuyback4 = shares * Math.pow(0.96, YEARS);
  const v5_pe_fv = (futureNI / sharesBuyback4 * pe) / fullDiscount;
  const v5_pfcf_fv = (futureFCF / sharesBuyback4 * pfcf) / fullDiscount;

  // V6: Half-discount + 3% buybacks
  const v6_pe_fv = (futureNI / sharesBuyback3 * pe) / halfDiscount;
  const v6_pfcf_fv = (futureFCF / sharesBuyback3 * pfcf) / halfDiscount;

  // V7: 5-year projection, no discount
  const growth5 = Math.pow(1 + growth, 5);
  const futureRev5 = revenue * growth5;
  const v7_pe_fv = (futureRev5 * profitMargin / shares) * pe;
  const v7_pfcf_fv = (futureRev5 * fcfMargin / shares) * pfcf;

  console.log(`\n${'='.repeat(90)}`);
  console.log(`SCENARIO: ${name}   (growth ${(growth*100).toFixed(1)}%, PM ${(profitMargin*100).toFixed(1)}%, FCFM ${(fcfMargin*100).toFixed(1)}%, P/E ${pe}, P/FCF ${pfcf}, req ${(required*100).toFixed(1)}%, ${YEARS}yr)`);
  console.log(`Future revenue: $${(futureRevenue/1e9).toFixed(0)}B, Future NI: $${(futureNI/1e9).toFixed(0)}B, Future FCF: $${(futureFCF/1e9).toFixed(0)}B`);
  console.log(`Full discount (10y@9%): ${fullDiscount.toFixed(3)}, Half discount (5y@9%): ${halfDiscount.toFixed(3)}`);
  console.log('');
  console.log(`EM reported:                                    P/E ${fmt(em.earnings)}   P/FCF ${fmt(em.dcf)}`);
  console.log('');
  console.log(`V1: Textbook (full discount)                    P/E ${fmt(v1_pe_fv)}   P/FCF ${fmt(v1_pfcf_fv)}`);
  console.log(`V2: Half-period discount                        P/E ${fmt(v2_pe_fv)}   P/FCF ${fmt(v2_pfcf_fv)}`);
  console.log(`V3: No discount (fair value = future price)     P/E ${fmt(v3_pe_fv)}   P/FCF ${fmt(v3_pfcf_fv)}`);
  console.log(`V4: Full discount + 3% buybacks                 P/E ${fmt(v4_pe_fv)}   P/FCF ${fmt(v4_pfcf_fv)}`);
  console.log(`V5: Full discount + 4% buybacks                 P/E ${fmt(v5_pe_fv)}   P/FCF ${fmt(v5_pfcf_fv)}`);
  console.log(`V6: Half discount + 3% buybacks                 P/E ${fmt(v6_pe_fv)}   P/FCF ${fmt(v6_pfcf_fv)}`);
  console.log(`V7: 5-year projection, no discount              P/E ${fmt(v7_pe_fv)}   P/FCF ${fmt(v7_pfcf_fv)}`);
  console.log('');
  console.log(`Implied discount period to match EM:`);
  // What value of t in (1+r)^t makes v1_pe_future / (1+r)^t = em.earnings?
  // (1+r)^t = v1_pe_future / em.earnings -> t = log(ratio)/log(1+r)
  if (em.earnings > 0 && v1_pe_future > em.earnings) {
    const tPE = Math.log(v1_pe_future / em.earnings) / Math.log(1 + required);
    console.log(`  P/E:   ${tPE.toFixed(2)} years (vs ${YEARS} projected)`);
  } else if (em.earnings >= v1_pe_future) {
    console.log(`  P/E:   EM > future price — EM is using higher base or longer growth`);
  }
  if (em.dcf > 0 && v1_pfcf_future > em.dcf) {
    const tFCF = Math.log(v1_pfcf_future / em.dcf) / Math.log(1 + required);
    console.log(`  P/FCF: ${tFCF.toFixed(2)} years (vs ${YEARS} projected)`);
  } else if (em.dcf >= v1_pfcf_future) {
    console.log(`  P/FCF: EM > future price — EM is using higher base or longer growth`);
  }
}

console.log(`\n${'#'.repeat(90)}`);
console.log(`# AAPL DCF formula investigation — reverse-engineering EM vs TradeTally`);
console.log(`${'#'.repeat(90)}`);

console.log(`\n\nUSING FY2024 BASE (revenue $${(AAPL_FY2024.revenue/1e9).toFixed(0)}B, NI $${(AAPL_FY2024.netIncome/1e9).toFixed(0)}B, FCF $${(AAPL_FY2024.fcf/1e9).toFixed(0)}B, shares ${(AAPL_FY2024.shares/1e9).toFixed(2)}B)`);
for (const [name, inputs] of Object.entries(SCENARIOS)) {
  runScenario(name, AAPL_FY2024, inputs, EM_TARGETS[name]);
}

console.log(`\n\n${'#'.repeat(90)}`);
console.log(`USING FY2025 BASE (revenue $${(AAPL_FY2025.revenue/1e9).toFixed(0)}B, NI $${(AAPL_FY2025.netIncome/1e9).toFixed(0)}B, FCF $${(AAPL_FY2025.fcf/1e9).toFixed(0)}B, shares ${(AAPL_FY2025.shares/1e9).toFixed(2)}B)`);
console.log(`${'#'.repeat(90)}`);
for (const [name, inputs] of Object.entries(SCENARIOS)) {
  runScenario(name, AAPL_FY2025, inputs, EM_TARGETS[name]);
}
