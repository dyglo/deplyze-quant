import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimatedCost,
  remainingCash,
  pctOfBuyingPower,
  maxAffordableShares,
  estimatedProceeds,
  estimatedRealizedPnl,
  resultingWeight,
} from './tradeTicket';

describe('estimatedCost', () => {
  it('is quantity * price with no frictions', () => {
    assert.equal(estimatedCost(10, 100), 1000);
  });
  it('adds fees and slippage', () => {
    assert.equal(estimatedCost(10, 100, 5, 3), 1008);
  });
});

describe('remainingCash', () => {
  it('subtracts cost from available cash', () => {
    assert.equal(remainingCash(10000, 1000), 9000);
  });
  it('goes negative when cost exceeds cash (warn-but-allow)', () => {
    assert.equal(remainingCash(500, 1000), -500);
  });
});

describe('pctOfBuyingPower', () => {
  it('is cost / available cash', () => {
    assert.equal(pctOfBuyingPower(2500, 10000), 0.25);
  });
  it('exceeds 1 when the order is larger than cash', () => {
    assert.equal(pctOfBuyingPower(15000, 10000), 1.5);
  });
  it('is Infinity when no cash but a positive order', () => {
    assert.equal(pctOfBuyingPower(100, 0), Infinity);
  });
});

describe('maxAffordableShares', () => {
  it('is cash / price', () => {
    assert.equal(maxAffordableShares(1000, 50), 20);
  });
  it('guards against non-positive price/cash', () => {
    assert.equal(maxAffordableShares(1000, 0), 0);
    assert.equal(maxAffordableShares(0, 50), 0);
  });
});

describe('estimatedProceeds / estimatedRealizedPnl', () => {
  it('proceeds is quantity * price', () => {
    assert.equal(estimatedProceeds(5, 120), 600);
  });
  it('realised P&L is gain vs avg cost', () => {
    assert.equal(estimatedRealizedPnl(5, 120, 100), 100);
  });
  it('realised P&L is negative on a loss', () => {
    assert.equal(estimatedRealizedPnl(5, 80, 100), -100);
  });
});

describe('resultingWeight', () => {
  it('is position value / NAV', () => {
    assert.equal(resultingWeight(2500, 10000), 0.25);
  });
  it('is 0 for non-positive NAV', () => {
    assert.equal(resultingWeight(2500, 0), 0);
  });
});
