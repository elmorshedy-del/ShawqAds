import {
  bonferroniAdjust,
  chiSquarePValue,
  formatPValue,
  kruskalWallis,
  mannWhitneyU,
  normalCdf,
  proportionZTest,
} from '../src/lib/statsTests.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(Math.abs(normalCdf(0) - 0.5) < 0.001, 'normalCdf(0) should be ~0.5');
assert(normalCdf(3) > 0.99, 'normalCdf(3) should be near 1');

const separated = mannWhitneyU([10, 12, 14, 16, 18], [1, 2, 2, 3, 4]);
assert(separated.pValue != null && separated.pValue < 0.05, 'Mann-Whitney should detect separated samples');

const similar = mannWhitneyU([4, 5, 6, 5, 4], [5, 4, 6, 5, 5]);
assert(similar.pValue != null && similar.pValue > 0.05, 'Mann-Whitney should not reject similar samples');

const identical = mannWhitneyU([5, 5, 5, 5], [5, 5, 5, 5]);
assert(identical.pValue != null && identical.pValue > 0.9, 'Mann-Whitney should not reject identical samples');

const kw = kruskalWallis([[10, 11, 12], [1, 2, 2], [9, 10, 11]]);
assert(kw.pValue != null && kw.pValue < 0.05, 'Kruskal-Wallis should detect group differences');

const adjusted = bonferroniAdjust([0.01, 0.02, 0.03]);
assert(adjusted[0] === 0.03 && adjusted[2] === 0.09, 'Bonferroni should multiply by number of tests');

assert(formatPValue(0.0005) === '< 0.001', 'formatPValue should floor tiny values');
assert(formatPValue(0.0421) === '0.042', 'formatPValue should show three decimals');

assert(chiSquarePValue(10, 3) < 0.05, 'chiSquarePValue should reject large chi-square values');

const higher = proportionZTest(40, 100, 0.2, { tail: 'upper' });
assert(higher.pValue != null && higher.pValue < 0.05, 'proportionZTest should detect higher abandonment rate');

console.log('stats tests passed');
