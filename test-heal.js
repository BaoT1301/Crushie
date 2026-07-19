// Real build check for the heal demo. `add(a, b)` MUST return a + b.
// If an agent breaks it, this exits non-zero and the verify gate goes red;
// the Heal fixer then reads this exact error and repairs heal-target.js.
const { add } = require("./heal-target.js");

const cases = [
  [2, 3, 5],
  [10, 20, 30],
  [-4, 1, -3],
];

for (const [a, b, want] of cases) {
  const got = add(a, b);
  if (got !== want) {
    console.error(`FAIL: add(${a}, ${b}) must equal ${want} (a + b), but got ${got}`);
    process.exit(1);
  }
}
console.log("PASS: add() correctly returns a + b");
