import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  foldPosition,
  reconcilePositions,
  netCashImpact,
  totalRealizedPnl,
  derivedCashBalance,
  applyTransaction,
  type TxLike,
} from './engine';
import { signedCashImpact } from './ledger';

/** Build a position transaction with its signed cash impact filled in. */
function tx(
  symbol: string,
  action: TxLike['action'],
  quantity: number,
  price: number,
  ts: number,
  fees = 0,
): TxLike {
  return { symbol, action, quantity, price, ts, cashImpact: signedCashImpact(action, quantity, price, fees) };
}

describe('foldPosition — single lifecycle', () => {
  it('opens a position on buy', () => {
    const p = foldPosition('AAPL', [tx('AAPL', 'buy', 10, 100, 1)]);
    assert.equal(p.quantity, 10);
    assert.equal(p.avgCost, 100);
    assert.equal(p.realizedPnl, 0);
    assert.equal(p.status, 'active');
    assert.equal(p.firstEntryTs, 1);
  });

  it('blends average cost on add', () => {
    const p = foldPosition('AAPL', [
      tx('AAPL', 'buy', 10, 100, 1),
      tx('AAPL', 'add', 10, 200, 2),
    ]);
    assert.equal(p.quantity, 20);
    assert.equal(p.avgCost, 150);
    assert.equal(p.firstEntryTs, 1); // unchanged by the add
  });

  it('books realised P&L on a trim and keeps avg cost', () => {
    const p = foldPosition('AAPL', [
      tx('AAPL', 'buy', 10, 100, 1),
      tx('AAPL', 'trim', 4, 130, 2),
    ]);
    assert.equal(p.quantity, 6);
    assert.equal(p.avgCost, 100);
    assert.equal(p.realizedPnl, 4 * (130 - 100)); // 120
    assert.equal(p.status, 'active');
  });

  it('closes the position when sold to flat', () => {
    const p = foldPosition('AAPL', [
      tx('AAPL', 'buy', 10, 100, 1),
      tx('AAPL', 'sell', 10, 90, 2),
    ]);
    assert.equal(p.quantity, 0);
    assert.equal(p.avgCost, 0);
    assert.equal(p.realizedPnl, 10 * (90 - 100)); // -100
    assert.equal(p.status, 'closed');
    assert.equal(p.closedAt, 2);
  });

  it('closes via an explicit close action', () => {
    const p = foldPosition('AAPL', [
      tx('AAPL', 'buy', 5, 100, 1),
      tx('AAPL', 'close', 5, 140, 2),
    ]);
    assert.equal(p.quantity, 0);
    assert.equal(p.status, 'closed');
    assert.equal(p.realizedPnl, 5 * (140 - 100)); // 200
  });

  it('re-opens a closed position with fresh average cost', () => {
    const p = foldPosition('AAPL', [
      tx('AAPL', 'buy', 10, 100, 1),
      tx('AAPL', 'close', 10, 120, 2),
      tx('AAPL', 'buy', 4, 200, 3),
    ]);
    assert.equal(p.quantity, 4);
    assert.equal(p.avgCost, 200);
    assert.equal(p.status, 'active');
    assert.equal(p.closedAt, undefined); // cleared on re-open
    assert.equal(p.firstEntryTs, 3); // re-entry time
    assert.equal(p.realizedPnl, 10 * (120 - 100)); // 200 retained from prior close
  });

  it('clamps oversized reductions to the held quantity', () => {
    // Defensive: even if a reduce exceeds qty, position can't go negative.
    const p = foldPosition('AAPL', [
      tx('AAPL', 'buy', 5, 100, 1),
      tx('AAPL', 'sell', 8, 110, 2),
    ]);
    assert.equal(p.quantity, 0);
    assert.equal(p.status, 'closed');
    assert.equal(p.realizedPnl, 5 * (110 - 100)); // only 5 booked
  });

  it('is order-independent of input array (sorts by ts)', () => {
    const txs = [
      tx('AAPL', 'add', 10, 200, 2),
      tx('AAPL', 'buy', 10, 100, 1),
    ];
    const p = foldPosition('AAPL', txs);
    assert.equal(p.avgCost, 150);
    assert.equal(p.quantity, 20);
  });
});

describe('applyTransaction', () => {
  it('does not mutate the input state', () => {
    const start = { symbol: 'X', quantity: 0, avgCost: 0, realizedPnl: 0, status: 'active' as const };
    applyTransaction(start, tx('X', 'buy', 1, 10, 1));
    assert.equal(start.quantity, 0); // unchanged
  });
});

describe('reconcilePositions — multi-symbol', () => {
  const ledger = [
    tx('AAPL', 'buy', 10, 100, 1),
    tx('MSFT', 'buy', 5, 200, 2),
    tx('AAPL', 'trim', 5, 120, 3),
    { symbol: 'CASH', action: 'cash_adjust' as const, quantity: 0, price: 0, ts: 4, cashImpact: 5000 },
  ];

  it('produces one position per traded symbol (excludes cash_adjust)', () => {
    const positions = reconcilePositions(ledger);
    assert.equal(positions.size, 2);
    assert.equal(positions.get('AAPL')!.quantity, 5);
    assert.equal(positions.get('MSFT')!.quantity, 5);
    assert.equal(positions.has('CASH'), false);
  });

  it('totalRealizedPnl sums across positions', () => {
    assert.equal(totalRealizedPnl(ledger), 5 * (120 - 100)); // only AAPL trim booked
  });
});

describe('cash math', () => {
  it('netCashImpact sums signed impacts incl. cash_adjust', () => {
    const ledger = [
      tx('AAPL', 'buy', 10, 100, 1), // -1000
      tx('AAPL', 'sell', 4, 130, 2), // +520
      { symbol: 'CASH', action: 'cash_adjust' as const, quantity: 0, price: 0, ts: 3, cashImpact: 2000 },
    ];
    assert.equal(netCashImpact(ledger), -1000 + 520 + 2000); // 1520
  });

  it('derivedCashBalance = startingCapital + net impact', () => {
    const ledger = [tx('AAPL', 'buy', 10, 100, 1)]; // -1000
    assert.equal(derivedCashBalance(100000, ledger), 99000);
  });

  it('subtracts frictions from cash on entry', () => {
    const ledger = [tx('AAPL', 'buy', 10, 100, 1, 7)]; // -(1000+7)
    assert.equal(derivedCashBalance(100000, ledger), 100000 - 1007);
  });
});
