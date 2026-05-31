// Server configuration. The mainnet safety gate lives here (see docs/COMPLIANCE.md).
export const config = {
  port: Number(process.env.PORT) || 8080,
  network: process.env.SOLANA_NETWORK || 'devnet',   // 'devnet' | 'mainnet-beta'
  demoPoolSol: Number(process.env.DEMO_POOL_SOL ?? 1.0),  // shown on devnet
  // Real funds are refused unless an operator has explicitly signed off in env.
  complianceSignedOff: process.env.COMPLIANCE_SIGNED_OFF === 'true',
  escrowProgramId: process.env.ESCROW_PROGRAM_ID || null,
};

export function assertSafeToStart() {
  if (config.network === 'mainnet-beta') {
    if (!config.complianceSignedOff) {
      console.error('\n[REFUSING TO START] SOLANA_NETWORK=mainnet-beta but COMPLIANCE_SIGNED_OFF is not "true".');
      console.error('Real money is involved. Complete docs/COMPLIANCE.md first.\n');
      process.exit(1);
    }
    if (!config.escrowProgramId) {
      console.error('\n[REFUSING TO START] mainnet requires ESCROW_PROGRAM_ID (audited escrow program).\n');
      process.exit(1);
    }
  }
}
