const LoanCalculations = require('./loanCalculations');

describe('LoanCalculations core', () => {
  test('calculateEMI and calculateMaxLoanFromEMI are consistent', () => {
    const principal = 1_000_000;
    const annualRate = 15;
    const tenure = 24;
    const emi = LoanCalculations.calculateEMI(principal, annualRate, tenure);
    const reconPrincipal = LoanCalculations.calculateMaxLoanFromEMI(emi, annualRate, tenure);

    const diff = Math.abs(reconPrincipal - principal);
    expect(diff).toBeLessThanOrEqual(1.5);
  });

  test('calculateTotalInterest reasonable', () => {
    const principal = 500_000;
    const annualRate = 12;
    const tenure = 12;
    const totalInterest = LoanCalculations.calculateTotalInterest(principal, annualRate, tenure);

    expect(totalInterest).toBeGreaterThan(0);
    expect(totalInterest).toBeLessThan(principal);
  });

  test('calculateMaxLoanFromEMI yields principal that produces similar EMI', () => {
    const targetEMI = 50000;
    const annualRate = 15;
    const tenure = 36;
    const principal = LoanCalculations.calculateMaxLoanFromEMI(targetEMI, annualRate, tenure);

    const impliedEMI = LoanCalculations.calculateEMI(principal, annualRate, tenure);
    const diff = Math.abs(impliedEMI - targetEMI);
    expect(diff).toBeLessThanOrEqual(1.5);
  });

  test('calculateCharges returns object with fees', () => {
    const principal = 1_000_000;
    const charges = LoanCalculations.calculateCharges(principal);
    expect(charges.processingFee).toBeGreaterThan(0);
    expect(charges.insurance).toBeGreaterThan(0);
    expect(charges.otherCharges).toBeDefined();
  });

  test('amortizationSchedule sums correctly', () => {
    const principal = 300_000;
    const annualRate = 10;
    const tenure = 12;
    const sched = LoanCalculations.amortizationSchedule(principal, annualRate, tenure);
    expect(sched.length).toEqual(tenure);

    const totalPrincipal = sched.reduce((s, r) => s + Number(r.principal), 0);
    const diff = Math.abs(totalPrincipal - principal);
    expect(diff).toBeLessThanOrEqual(2.0);
  });
});