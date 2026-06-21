export const TX_RESULT_CODES: Record<string, string> = {
  tx_success: 'All operations succeeded.',
  tx_failed: 'One or more operations failed.',
  tx_too_early: 'The ledger closeTime is before the transaction minTime.',
  tx_too_late: 'The ledger closeTime is after the transaction maxTime.',
  tx_missing_operation: 'No operations were specified.',
  tx_bad_seq: 'Sequence number does not match source account.',
  tx_bad_auth: 'Insufficient signatures or wrong network.',
  tx_insufficient_balance: 'Insufficient XLM to cover fees and base reserves.',
  tx_no_source_account: 'Source account not found.',
  tx_insufficient_fee: 'Fee is lower than the network minimum.',
  tx_bad_auth_extra: 'Unused signatures attached.',
  tx_internal_error: 'Internal Horizon error — try again.',
  tx_not_supported: 'Transaction type not supported.',
  tx_fee_bump_inner_failed: 'The inner fee-bump transaction failed.',
  tx_bad_sponsorship: 'Sponsorship structure is invalid.',
};

export const OP_RESULT_CODES: Record<string, string> = {
  op_success: 'Operation succeeded.',
  op_bad_auth: 'Insufficient authorisation for this operation.',
  op_no_account: 'The source or destination account does not exist.',
  op_not_supported: 'Operation type not supported by this network.',
  op_too_many_subentries: 'Account has reached the maximum number of subentries.',
  op_exceeded_work_limit: 'Operation exceeded the work limit.',
  op_too_many_sponsoring: 'Account is already sponsoring the maximum number of entries.',

  // create_account
  op_malformed: 'Invalid input — check asset codes, addresses, or amounts.',
  op_underfunded: 'The source account does not have enough XLM after accounting for the base reserve.',
  op_low_reserve: 'Starting balance is below the minimum reserve required.',
  op_already_exist: 'The destination account already exists.',

  // payment
  op_no_trust: 'Destination account has no trustline for this asset.',
  op_not_authorized: 'The asset issuer has not authorised the destination to hold this asset.',
  op_no_issuer: 'The asset issuer account does not exist.',
  op_line_full: 'Destination trustline is at maximum capacity.',

  // change_trust
  op_invalid_limit: 'Limit is below current balance or negative.',
  op_self_not_allowed: 'Source and destination accounts are the same.',
  op_trust_revoked: 'Trustline was revoked by the issuer.',

  // allow_trust / set_trust_line_flags
  op_no_trustline: 'Trustor does not have a trustline for this asset.',
  op_trustor_not_required: 'Asset does not require authorisation.',
  op_cant_revoke: 'Issuer cannot revoke this trustline.',

  // offer / DEX
  op_sell_no_trust: 'No trustline for the asset being sold.',
  op_buy_no_trust: 'No trustline for the asset being bought.',
  op_sell_not_authorized: 'Not authorised to sell this asset.',
  op_buy_not_authorized: 'Not authorised to buy this asset.',
  op_sell_no_issuer: 'Issuer of the selling asset not found.',
  op_buy_no_issuer: 'Issuer of the buying asset not found.',
  op_offer_not_found: 'Offer ID not found.',
  op_offer_low_reserve: 'Insufficient XLM reserve to create this offer.',
  op_cross_self: 'This offer would immediately cross one of your own offers.',

  // path payment
  op_too_few_offers: 'No path found with enough liquidity.',
  op_over_sendmax: 'Cost would exceed the specified sendMax.',
  op_under_destmin: 'Received amount is below the specified destMin.',

  // account merge
  op_immutable_set: 'The account has AUTH_IMMUTABLE set.',
  op_has_sub_entries: 'Account still has sub-entries (trustlines, offers, signers).',
  op_seq_num_too_far: 'Sequence number would be too far in the future.',
  op_dest_full: 'Destination account cannot receive more XLM.',

  // manage_data
  op_data_name_not_found: 'Data entry not found — nothing to delete.',
  op_data_invalid_name: 'Data key is invalid.',

  // inflation
  op_not_time: 'Inflation can only run once a week.',

  // bump_sequence
  op_bad_seq: 'Bump sequence number is below current sequence.',

  // claim_claimable_balance
  op_does_not_exist: 'Claimable balance not found.',
  op_cannot_claim: 'Account is not a claimant or predicate is not satisfied.',
  op_balance_frozen: 'Claimable balance is frozen.',

  // liquidity pool
  op_pool_full: 'Liquidity pool is at maximum capacity.',
  op_too_few_shares: 'Shares received are below minimum.',
  op_too_small: 'Withdrawal amount is too small.',
};

export function explainTxCode(code: string): string {
  return TX_RESULT_CODES[code] ?? `Unknown transaction result code: ${code}`;
}

export function explainOpCode(code: string): string {
  return OP_RESULT_CODES[code] ?? `Unknown operation result code: ${code}`;
}
