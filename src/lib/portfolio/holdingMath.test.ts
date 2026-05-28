import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  marketValue,
  costValue,
  unrealizedPnl,
  unrealizedPnlPct,
  allocationDrift,
} from './holdingMath';

describe('marketValue / costValue', () => {
  it('computes market value', () => {
    assert.equal(marketValue(10, 150), 1500);
  });
  it('computes cost value', () => {
    assert.equal(costValue(10, 120), 1200);
  });
});

describe('unrealizedPnl', () => {
  it('is positive when price is above cost', () => {
    assert.equal(unrealizedPnl(10, 150, 120), 300);
  });
  it('is negative when price is below cost', () => {
    assert.equal(unrealizedPnl(10, 100, 120), -200);
  });
  it('is zero for a flat position', () => {
    assert.equal(unrealizedPnl(0, 150, 120), 0);
  });
});

describe('unrealizedPnlPct', () => {
  it('computes the return fraction', () => {
    assert.equal(unrealizedPnlPct(150, 120), (150 - 120) / 120);
  });
  it('guards against non-positive cost', () => {
    assert.equal(unrealizedPnlPct(150, 0), 0);
  });
});

describe('allocationDrift', () => {
  it('is positive when overweight', () => {
    assert.ok(Math.abs(allocationDrift(0.3, 0.2) - 0.1) < 1e-9);
  });
  it('is negative when underweight', () => {
    assert.ok(Math.abs(allocationDrift(0.15, 0.25) + 0.1) < 1e-9);
  });
});
