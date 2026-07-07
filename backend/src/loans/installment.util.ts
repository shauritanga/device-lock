/**
 * Flat-interest schedule generator.
 *
 * Flat model: interest is charged once on the financed amount for the whole
 * term (it does NOT reduce as the balance is paid down). All math is done in
 * integer cents to avoid floating-point drift; the rounding remainder is added
 * to the final installment so the installments always sum to the exact total.
 */
export interface ScheduleInput {
  principal: number;
  downPayment: number;
  interestRatePct: number;
  termMonths: number;
  startDate: Date;
}

export interface ScheduleLine {
  sequence: number;
  dueDate: Date;
  amount: string; // 2-dp decimal string for Prisma Decimal
}

export interface Schedule {
  financed: string;
  totalInterest: string;
  totalRepayable: string;
  lines: ScheduleLine[];
}

export function generateSchedule(input: ScheduleInput): Schedule {
  const { principal, downPayment, interestRatePct, termMonths, startDate } =
    input;

  const principalC = toCents(principal);
  const downC = toCents(downPayment);
  const financedC = Math.max(principalC - downC, 0);
  const interestC = Math.round((financedC * interestRatePct) / 100);
  const totalC = financedC + interestC;

  const baseC = Math.floor(totalC / termMonths);
  const remainderC = totalC - baseC * termMonths;

  const lines: ScheduleLine[] = [];
  for (let i = 1; i <= termMonths; i++) {
    const isLast = i === termMonths;
    const amountC = isLast ? baseC + remainderC : baseC;
    lines.push({
      sequence: i,
      dueDate: addMonths(startDate, i),
      amount: fromCents(amountC),
    });
  }

  return {
    financed: fromCents(financedC),
    totalInterest: fromCents(interestC),
    totalRepayable: fromCents(totalC),
    lines,
  };
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Add whole months, clamping to month end (e.g. Jan 31 + 1mo -> Feb 28/29). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}
