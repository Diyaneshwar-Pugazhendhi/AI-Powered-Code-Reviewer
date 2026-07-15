/**
 * Sample file for testing the AI-Powered Code Reviewer.
 *
 * This module intentionally contains the three issue classes the reviewer detects:
 *   - ⚡ Performance bottlenecks
 *   - 🐛 Bugs / correctness defects
 *   - 🔒 Security vulnerabilities
 *
 * DO NOT use this in production. It exists purely as a fixture you can feed to:
 *   POST /analyze-demo
 * e.g.
 *   curl -X POST http://localhost:3000/analyze-demo \
 *     -H "Content-Type: application/json" \
 *     -d '{"code":"<contents of this file>","analysisType":"performance"}'
 */

// Simulated database client (fixture only — no real module is imported).
const db = {
  async query(sql) {
    return []; // stand-in for a real DB driver
  }
};

// Secret committed to source on purpose (security issue) — DO NOT DO THIS FOR REAL.
const DB_PASSWORD = 'SuperSecretPassword123!';

/**
 * ⚡ PERFORMANCE: O(n²) nested loop over the same array.
 * For every element we rescan the entire list — scales badly on large inputs.
 */
function findDuplicates(items) {
  const duplicates = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (i !== j && items[i] === items[j]) {
        duplicates.push(items[i]);
      }
    }
  }
  return duplicates;
}

/**
 * 🐛 BUG: Null dereference. If `user` is undefined the function throws.
 * Also returns a value before doing the work (logic bug).
 */
function getUserDiscount(user) {
  const result = user.discount; // crashes when user is null/undefined
  return result * 0.9;
}

/**
 * 🐛 BUG: Off-by-one. Skips the last element of the array.
 */
function sumUpTo(arr) {
  let total = 0;
  for (let i = 0; i < arr.length - 1; i++) {
    total += arr[i];
  }
  return total;
}

/**
 * 🔒 SECURITY: SQL injection. The `email` value is concatenated straight into
 * the query string with no parameterization.
 */
async function findByEmail(email) {
  const query = 'SELECT * FROM users WHERE email = \'' + email + '\'';
  return db.query(query);
}

/**
 * 🔒 SECURITY (INTENTIONAL FIXTURE): eval on untrusted input for arbitrary code
 * execution — deliberately included so the reviewer's security analysis can detect
 * it. DO NOT replicate this pattern in real code.
 */
function evaluateRule(rule) {
  // Intentionally vulnerable: used only as a detection test case for the reviewer.
  return eval(rule);
}

/**
 * ⚡ PERFORMANCE: N+1 query pattern. One query per order instead of a batch join.
 */
async function getOrderTotals(orders) {
  const totals = [];
  for (const order of orders) {
    const items = await db.query('SELECT price FROM items WHERE order_id = ' + order.id);
    const sum = items.reduce((a, b) => a + b.price, 0);
    totals.push(sum);
  }
  return totals;
}

module.exports = {
  DB_PASSWORD,
  findDuplicates,
  getUserDiscount,
  sumUpTo,
  findByEmail,
  evaluateRule,
  getOrderTotals
};
