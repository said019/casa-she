/**
 * Shared test-data helpers for Balance Room E2E suite.
 * Generates unique identifiers so parallel test runs don't collide.
 */

export const unique = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const testUsers = {
  newClient: () => ({
    name: "Test Cliente",
    email: unique("test") + "@mailinator.com",
    password: "Test123!@#",
    phone: "5512345678",
  }),
};

/** ISO date string N days from today */
export const futureDate = (daysFromNow: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
};

/** Discount code fixture */
export const discountCode = {
  valid: "DESCUENTO10",
  expired: "VENCIDO2020",
  invalid: "NOVALIDO",
  injectionAttempt: "'; DROP TABLE discount_codes; --",
  xssAttempt: '<script>alert("xss")</script>',
};

/** Credit card tokens for Stripe test mode */
export const stripeCards = {
  success: "4242424242424242",
  declined: "4000000000000002",
  insufficientFunds: "4000000000009995",
  slowNetwork: "4000000000000341",
};
