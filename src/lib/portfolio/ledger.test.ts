import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  grossValue,
  signedCashImpact,
  sharesFromDollars,
  dollarsFromShares,
  weight,
  updatedAvgCost,
  realizedPnlOnReduce,
  validateTransactionInput,
  isIncreasingAction,
  isReducingAction,
} from './ledger';

describe('grossValue', () => {
  it('multiplies quantity by price', () => {
    assert.equal(grossValue(10, 25), 250);
  });
  it('is zero for zero quantity', () => {
    assert.equal(grossValue(0, 25), 0);
  });
});

describe('action classification', () => {
  it('treats buy/add as increasing', () => {
    assert.equal(isIncreasingAction('buy'), true);
    assert.equal(isIncreasingAction('add'), true);
    assert.equal(isIncreasingAction('sell'), false);
  });
  it('treats trim/sell/close as reducing', () => {
    assert.equal(isReducingAction('trim'), true);
    assert.equal(isReducingAction('sell'), true);
    assert.equal(isReducingAction('close'), true);
    assert.equal(isReducingAction('buy'), false);
  });
});

describe('signedCashImpact', () => {
  it('is negative for buys (cash leaves)', () => {
    assert.equal(signedCashImpact('buy', 10, 100), -1000);
  });
  it('adds frictions to the cost of an entry', () => {
    assert.equal(signedCashImpact('add', 10, 100, 5, 3), -1008);
  });
  it('is positive for exits (cash returns)', () => {
    assert.equal(signedCashImpact('sell', 10, 100), 1000);
  });
  it('subtracts frictions from exit proceeds', () => {
    assert.equal(signedCashImpact('close', 10, 100, 5, 3), 992);
  });
  it('is zero for cash_adjust (engine applies its own amount)', () => {
    assert.equal(signedCashImpact('cash_adjust', 0, 0), 0);
  });
});

describe('shares <-> dollars', () => {
  it('converts dollars to shares', () => {
    assert.equal(sharesFromDollars(1000, 50), 20);
  });
  it('guards against non-positive price', () => {
    assert.equal(sharesFromDollars(1000, 0), 0);
  });
  it('round-trips shares -> dollars -> shares', () => {
    const shares = 7;
    const price = 134.5;
    assert.ok(Math.abs(sharesFromDollars(dollarsFromShares(shares, price), price) - shares) < 1e-9);
  });
});

describe('weight', () => {
  it('computes fraction of total', () => {
    assert.equal(weight(250, 1000), 0.25);
  });
  it('guards against non-positive total', () => {
    assert.equal(weight(250, 0), 0);
  });
});

describe('updatedAvgCost', () => {
  it('blends cost on an add', () => {
    // 10 @ 100, add 10 @ 200 -> avg 150
    assert.equal(updatedAvgCost(10, 100, 10, 200), 150);
  });
  it('opens a fresh position from zero', () => {
    assert.equal(updatedAvgCost(0, 0, 5, 80), 80);
  });
  it('returns zero when total quantity is non-positive', () => {
    assert.equal(updatedAvgCost(0, 0, 0, 80), 0);
  });
});

describe('realizedPnlOnReduce', () => {
  it('is positive on a gain', () => {
    assert.equal(realizedPnlOnReduce(5, 120, 100), 100);
  });
  it('is negative on a loss', () => {
    assert.equal(realizedPnlOnReduce(5, 80, 100), -100);
  });
});

describe('validateTransactionInput', () => {
  it('accepts a well-formed buy', () => {
    assert.deepEqual(validateTransactionInput({ action: 'buy', quantity: 10, price: 100 }), { ok: true });
  });
  it('rejects zero quantity on a buy', () => {
    assert.equal(validateTransactionInput({ action: 'buy', quantity: 0, price: 100 }).ok, false);
  });
  it('rejects negative price', () => {
    assert.equal(validateTransactionInput({ action: 'buy', quantity: 10, price: -1 }).ok, false);
  });
  it('rejects NaN quantity', () => {
    assert.equal(validateTransactionInput({ action: 'buy', quantity: NaN, price: 100 }).ok, false);
  });
  it('rejects negative fees', () => {
    assert.equal(validateTransactionInput({ action: 'buy', quantity: 10, price: 100, fees: -1 }).ok, false);
  });
  it('rejects overselling when current quantity is known', () => {
    assert.equal(validateTransactionInput({ action: 'sell', quantity: 20, price: 100, currentQuantity: 10 }).ok, false);
  });
  it('allows selling up to the held quantity', () => {
    assert.deepEqual(validateTransactionInput({ action: 'sell', quantity: 10, price: 100, currentQuantity: 10 }), { ok: true });
  });
  it('requires a close to clear the whole position', () => {
    assert.equal(validateTransactionInput({ action: 'close', quantity: 5, price: 100, currentQuantity: 10 }).ok, false);
  });
  it('rejects reducing with no open position', () => {
    assert.equal(validateTransactionInput({ action: 'trim', quantity: 5, price: 100, currentQuantity: 0 }).ok, false);
  });
  it('requires zero quantity for cash_adjust', () => {
    assert.equal(validateTransactionInput({ action: 'cash_adjust', quantity: 5, price: 0 }).ok, false);
    assert.deepEqual(validateTransactionInput({ action: 'cash_adjust', quantity: 0, price: 0 }), { ok: true });
  });
});
