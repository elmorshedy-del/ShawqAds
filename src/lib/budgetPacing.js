/* ----------------------------------------------------------------------------
 * budgetPacing.js — monthly ad-budget pacing.
 *
 * Media buyers manage to a number for the month. The dashboard could say what
 * was spent but never whether that spend was on track, which is the question
 * asked every single morning.
 *
 * Pace index = share of budget spent / share of month elapsed.
 *   1.0  exactly on track
 *   >1   running hot — will overshoot at this rate
 *   <1   underspending — will leave budget unused
 *
 * The current reporting day counts as partially elapsed rather than whole. On
 * the morning of the 10th you have not "used" the 10th, and treating it as a
 * full day makes every morning look like an underspend.
 * ------------------------------------------------------------------------- */

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function daysInMonth(dateStr) {
  const [year, month] = String(dateStr || '').split('-').map(Number);
  if (!year || !month) return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthKey(dateStr) {
  return typeof dateStr === 'string' && dateStr.length >= 7 ? dateStr.slice(0, 7) : '';
}

/**
 * @param rows        daily rows with { date, spend_usd }
 * @param budget      monthly ad budget in USD (0/absent => not configured)
 * @param today       current reporting day, YYYY-MM-DD
 * @param elapsedShare fraction of `today` already elapsed, 0..1
 */
export function buildBudgetPacing(rows = [], { budget = 0, today = '', elapsedShare = 1 } = {}) {
  const key = monthKey(today);
  if (!key) return null;
  const totalDays = daysInMonth(today);
  const dayOfMonth = Number(String(today).split('-')[2]) || 1;
  const share = Math.min(1, Math.max(0, num(elapsedShare)));

  const monthRows = (rows || []).filter((row) => monthKey(row?.date) === key);
  const spentToDate = monthRows.reduce((sum, row) => sum + num(row.spend_usd), 0);
  const completedRows = monthRows.filter((row) => row.date < today);
  const spentCompleted = completedRows.reduce((sum, row) => sum + num(row.spend_usd), 0);
  const todaySpend = spentToDate - spentCompleted;

  // Elapsed time counts today only for the part of it that has actually passed.
  const elapsedDays = dayOfMonth - 1 + share;
  const timeShare = totalDays ? elapsedDays / totalDays : 0;
  const remainingDays = Math.max(0, totalDays - elapsedDays);

  // Run rate from completed days only — a half-finished today would drag it down.
  const dailyRate = completedRows.length ? spentCompleted / completedRows.length : todaySpend / Math.max(share, 1 / 24);
  const projected = spentToDate + remainingDays * dailyRate;

  const configured = num(budget) > 0;
  const budgetShare = configured ? spentToDate / num(budget) : 0;
  const paceIndex = configured && timeShare > 0 ? budgetShare / timeShare : null;
  const remainingBudget = configured ? num(budget) - spentToDate : 0;
  const requiredDailyRate = configured && remainingDays > 0 ? remainingBudget / remainingDays : null;

  let status = 'unknown';
  if (configured && paceIndex != null) {
    if (paceIndex > 1.1) status = 'hot';
    else if (paceIndex < 0.9) status = 'cold';
    else status = 'on_track';
  }

  return {
    configured,
    budget: num(budget),
    monthKey: key,
    totalDays,
    dayOfMonth,
    elapsedDays,
    remainingDays,
    timeShare,
    spentToDate,
    spentCompleted,
    todaySpend,
    dailyRate,
    projected,
    projectedVsBudget: configured ? projected - num(budget) : null,
    budgetShare,
    paceIndex,
    remainingBudget,
    requiredDailyRate,
    status,
    daysOfRunway: configured && dailyRate > 0 ? remainingBudget / dailyRate : null,
  };
}

const fmtMoney = (value) => {
  const n = num(value);
  return Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
};

export function buildPacingFindings(pacing) {
  if (!pacing?.configured || pacing.paceIndex == null) return [];
  const overBy = num(pacing.projectedVsBudget);
  const pacePct = Math.round(Math.abs(pacing.paceIndex - 1) * 100);
  const findings = [];

  if (pacing.status === 'hot') {
    findings.push({
      id: 'pacing-hot',
      tone: 'negative',
      headline: `Pacing ${pacePct}% hot — projected ${fmtMoney(pacing.projected)} against a ${fmtMoney(pacing.budget)} budget`,
      context: `${fmtMoney(pacing.spentToDate)} spent with ${pacing.remainingDays.toFixed(1)} days left. Current run rate is ${fmtMoney(pacing.dailyRate)}/day.`,
      driver: '',
      action: pacing.requiredDailyRate != null && pacing.requiredDailyRate > 0
        ? `Drop to ${fmtMoney(pacing.requiredDailyRate)}/day to land on budget.`
        : 'Budget is already exhausted for the month.',
    });
  } else if (pacing.status === 'cold') {
    findings.push({
      id: 'pacing-cold',
      tone: 'watch',
      headline: `Pacing ${pacePct}% under — projected ${fmtMoney(pacing.projected)} against a ${fmtMoney(pacing.budget)} budget`,
      context: `${fmtMoney(Math.abs(overBy))} would go unspent at the current ${fmtMoney(pacing.dailyRate)}/day run rate.`,
      driver: '',
      action: pacing.requiredDailyRate != null
        ? `Room to raise to ${fmtMoney(pacing.requiredDailyRate)}/day — check the marginal return before you do.`
        : '',
    });
  }

  if (pacing.daysOfRunway != null && pacing.daysOfRunway < pacing.remainingDays) {
    findings.push({
      id: 'pacing-runway',
      tone: 'negative',
      headline: `Budget runs out ${(pacing.remainingDays - pacing.daysOfRunway).toFixed(1)} days before month end`,
      context: `${fmtMoney(pacing.remainingBudget)} left at ${fmtMoney(pacing.dailyRate)}/day covers ${pacing.daysOfRunway.toFixed(1)} of the ${pacing.remainingDays.toFixed(1)} remaining days.`,
      driver: '',
      action: 'Either raise the budget or taper now — running to zero mid-month hands the auction to competitors at the worst time.',
    });
  }

  return findings;
}
