// Solana wallet (Phantom). Connect + prove ownership by signing a nonce. Devnet by default.
// We deliberately keep on-chain transfers server-side (see docs/COMPLIANCE.md). The client
// only proves "I control this address" so the server can credit winnings to it.
export class Wallet {
  constructor() { this.pubkey = null; this.provider = null; }

  get available() { return !!(window.solana && window.solana.isPhantom); }

  async connect() {
    if (!this.available) {
      window.open('https://phantom.app/', '_blank');
      throw new Error('Phantom not installed');
    }
    this.provider = window.solana;
    const res = await this.provider.connect();
    this.pubkey = res.publicKey.toString();
    return this.pubkey;
  }

  // Sign a server-provided nonce to prove control of the address (for payout binding).
  async proveOwnership(nonce) {
    if (!this.provider) throw new Error('not connected');
    const enc = new TextEncoder().encode(`BACKROOMS:NO-CLIP ownership proof\nnonce:${nonce}`);
    const { signature } = await this.provider.signMessage(enc, 'utf8');
    return { pubkey: this.pubkey, signature: Array.from(signature) };
  }

  short() {
    if (!this.pubkey) return '';
    return this.pubkey.slice(0, 4) + '…' + this.pubkey.slice(-4);
  }
}
