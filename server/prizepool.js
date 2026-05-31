// Prize pool. Devnet scaffold: tracks the pool and *records* payouts to winners.
// Actual on-chain transfer is intentionally stubbed behind the compliance gate. The
// payout intent is signed + logged so it's auditable; wiring real @solana/web3.js
// transfers is a one-function change once docs/COMPLIANCE.md is satisfied.
import crypto from 'node:crypto';
import { config } from './config.js';

export class PrizePool {
  constructor() {
    this.network = config.network;
    this.balanceSol = config.network === 'devnet' ? config.demoPoolSol : 0;
    this.payouts = [];   // audit trail
  }

  snapshot() { return { pool: this.balanceSol, network: this.network }; }

  // Called by the round manager when a round ends with winners that have wallets.
  async award(winners, outcomeSignature) {
    const eligible = winners.filter(w => w.wallet);
    if (!eligible.length || this.balanceSol <= 0) {
      return { paid: false, reason: eligible.length ? 'empty pool' : 'no winner wallet' };
    }
    const share = this.balanceSol / eligible.length;
    const records = [];
    for (const w of eligible) {
      const rec = {
        to: w.wallet, amountSol: share, network: this.network,
        outcome: outcomeSignature, at: Date.now(),
        // On devnet/mainnet this is where a real transfer signature would go.
        txid: this.network === 'devnet' ? this._simulateTx(w.wallet, share) : null,
        status: this.network === 'devnet' ? 'simulated-devnet' : 'pending-compliance',
      };
      this.payouts.push(rec); records.push(rec);
    }
    // Refill the demo pool for the next round so the loop keeps running.
    if (this.network === 'devnet') this.balanceSol = config.demoPoolSol;
    return { paid: true, records };
  }

  _simulateTx(to, amount) {
    return 'devnet-sim-' + crypto.createHash('sha256')
      .update(to + amount + Date.now()).digest('hex').slice(0, 16);
  }
}
