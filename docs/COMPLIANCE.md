# COMPLIANCE — read before enabling real-money prizes

The game ships on **Solana devnet** (valueless test SOL). The prize logic is real; the
money is not. Flipping to mainnet means handling **real funds** and is gated behind this
checklist on purpose. Do NOT set `SOLANA_NETWORK=mainnet-beta` until every box is true.

## Why this is gated
Paying players to win a skill/chance contest can be regulated as a **prize competition,
contest, sweepstakes, or gambling** depending on jurisdiction. Getting it wrong has
criminal and financial consequences. This is not legal advice — get a real lawyer.

## Checklist before mainnet
- [ ] Legal review of prize-contest / gambling / money-transmission law in every region
      you'll allow players from (block the rest by geo-IP + ToS).
- [ ] Decide model: **skill-based contest** (defensible) vs. wager (high-risk). The design
      is skill-based (no buy-in to play); keep it that way.
- [ ] KYC/AML stance for payouts above thresholds; sanctions screening of wallet addresses.
- [ ] Escrow/custody design: pool funds held by an audited on-chain program, not a hot
      wallet you control. Multisig for any admin keys.
- [ ] Security audit of the payout program + server signing (the server decides winners;
      that signer is now a financial control — protect the key, rate-limit, log).
- [ ] Anti-cheat: server-authoritative scoring is necessary but not sufficient. Add replay
      verification before paying. Bots must be excluded from the human pool.
- [ ] Tax reporting obligations for winners.
- [ ] Clear ToS + age gate (18+/21+ as required) + responsible-play resources.
- [ ] Incident/refund policy if a round is voided (server crash, exploit).

## How the flip works (mechanically)
`server/config.js` → `SOLANA_NETWORK`. Devnet uses an airdrop faucet for the demo pool.
Mainnet requires the funded escrow program id + admin multisig in env, and the server
refuses to start in mainnet mode unless `COMPLIANCE_SIGNED_OFF=true` is set explicitly.
