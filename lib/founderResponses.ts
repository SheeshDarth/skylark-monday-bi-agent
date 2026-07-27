import type { AnalyticsSummary } from "./analytics";

type Group = { label: string; count: number; maskedValueUnits: number };

function pct(part: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function units(value: number | null | undefined) {
  if (value === null || value === undefined) return "missing value";
  return `${Math.round(value).toLocaleString("en-IN")} masked value units`;
}

function topGroups(groups: Group[], total: number, limit = 4) {
  return groups
    .slice(0, limit)
    .map((group) => `- ${group.label}: ${group.count} open deals, ${pct(group.maskedValueUnits, total)} of open masked value (${units(group.maskedValueUnits)}).`)
    .join("\n");
}

function topOpenDeals(summary: AnalyticsSummary, limit = 3) {
  return summary.pipeline.topOpenDeals
    .slice(0, limit)
    .map((deal, index) => `${index + 1}. ${deal.deal} (${deal.sector}, ${deal.stage}) - ${units(deal.maskedValueUnits)}`)
    .join("\n");
}

function coverage(summary: AnalyticsSummary) {
  const exclusions = summary.pipeline.exclusions;
  return `Coverage: ${summary.pipeline.openDealsWithValue}/${summary.pipeline.openDeals} open deals have masked value; excluded ${exclusions.notOpen} non-open rows, ${exclusions.junkRows} junk rows, and ${exclusions.missingMaskedValue} open rows missing masked value.`;
}

function pipelineHealth(summary: AnalyticsSummary) {
  const topSector = summary.pipeline.openBySector[0];
  const secondSector = summary.pipeline.openBySector[1];
  const total = summary.pipeline.totalOpenMaskedValueUnits;

  return `Pipeline is heavily concentrated: ${topSector.label} holds ${pct(topSector.maskedValueUnits, total)} of open masked value across ${topSector.count}/${summary.pipeline.openDeals} open deals.

${topGroups(summary.pipeline.openBySector, total)}

Top open deal concentration:
${topOpenDeals(summary)}

${coverage(summary)} Founder read: watch concentration risk first, then check whether the largest Tender and Railways opportunities have clear next actions.`;
}

function billingRisk(summary: AnalyticsSummary) {
  const receivables = summary.workOrders.receivables.topReceivables.slice(0, 5);
  const unbilled = summary.workOrders.unbilled.topUnbilled.slice(0, 5);

  return `Billing risk is split between collection exposure and unbilled work: ${summary.workOrders.receivables.rowsWithPositiveReceivable} rows carry positive receivables, and ${summary.workOrders.unbilled.rowsWithAmountToBill} rows still have amount-to-bill exposure.

Top receivable exposure:
${receivables.map((row, index) => `${index + 1}. ${row.deal} / ${row.customer} (${row.sector}) - ${units(row.maskedReceivableUnits)}; billing status: ${row.status}.`).join("\n")}

Top unbilled exposure:
${unbilled.map((row, index) => `${index + 1}. ${row.deal} / ${row.customer} (${row.sector}) - ${units(row.maskedAmountToBillUnits)}; billing status: ${row.billingStatus}.`).join("\n")}

Caveat: ${summary.workOrders.receivables.missingReceivableRows} work-order rows are missing receivable values, ${summary.workOrders.receivables.negativeReceivableRows} have negative receivable values, and ${summary.workOrders.unbilled.negativeAmountToBillRows} have negative amount-to-bill values flagged as suspect.`;
}

function crossBoardGaps(summary: AnalyticsSummary) {
  const gaps = summary.crossBoard.sectorsWithOpenDealsButNoActiveWorkOrders;
  return `There are ${summary.crossBoard.openDealsWithoutActiveWorkOrder} open deal rows without an active work order, across ${gaps.length} sectors.

${topGroups(gaps, summary.pipeline.totalOpenMaskedValueUnits, 7)}

Sample gaps:
${summary.crossBoard.sampleOpenDealsWithoutActiveWorkOrder
  .slice(0, 8)
  .map((row, index) => `${index + 1}. ${row.deal} (${row.sector}, ${row.stage}) - ${units(row.maskedValueUnits)}`)
  .join("\n")}

Caveat: join used exact trimmed masked names (${summary.crossBoard.joinKey}). Active work orders exclude completed, paused/struck, and missing execution-status rows; ${summary.crossBoard.caveats.inactiveOrMissingExecutionStatus} work-order rows are inactive or missing execution status.`;
}

function leadershipUpdate(summary: AnalyticsSummary) {
  const topSector = summary.pipeline.openBySector[0];
  const total = summary.pipeline.totalOpenMaskedValueUnits;
  return `**Headline:** Open pipeline is concentrated: ${topSector.label} accounts for ${pct(topSector.maskedValueUnits, total)} of open masked value across ${topSector.count}/${summary.pipeline.openDeals} open deals.

- ${summary.pipeline.openDealsWithValue}/${summary.pipeline.openDeals} open deals have masked value coverage; total open exposure is ${units(total)}.
- Next largest sectors are ${summary.pipeline.openBySector
    .slice(1, 4)
    .map((group) => `${group.label} at ${pct(group.maskedValueUnits, total)}`)
    .join(", ")}.
- Cross-board check shows ${summary.crossBoard.openDealsWithoutActiveWorkOrder} open deal rows without active work orders.

**Flagged risk:** ${summary.workOrders.unbilled.rowsWithAmountToBill} work-order rows still show amount-to-bill exposure, led by ${summary.workOrders.unbilled.topUnbilled[0]?.deal || "missing deal"} at ${units(summary.workOrders.unbilled.topUnbilled[0]?.maskedAmountToBillUnits)}.`;
}

function rowCount(summary: AnalyticsSummary) {
  return `Live monday snapshot matches the dashboards: ${summary.pipeline.fetchedDealRows}/${summary.pipeline.totalDealRows} deal rows and ${summary.workOrders.fetchedWorkOrderRows}/${summary.workOrders.totalWorkOrderRows} work-order rows were fetched.`;
}

export function deterministicFounderResponse(question: string, summary: AnalyticsSummary) {
  const q = question.toLowerCase();
  if (q.includes("how many row") || q.includes("row count") || q.includes("boards you received")) return rowCount(summary);
  if (q.includes("leadership update") || q.includes("founder update")) return leadershipUpdate(summary);
  if (q.includes("billing") || q.includes("collection") || q.includes("receivable")) return billingRisk(summary);
  if (q.includes("cross-board") || q.includes("active work order") || q.includes("no active work")) return crossBoardGaps(summary);
  if (q.includes("pipeline") || q.includes("sector")) return pipelineHealth(summary);
  return null;
}
