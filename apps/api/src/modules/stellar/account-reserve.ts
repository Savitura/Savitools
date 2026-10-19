/**
 * Stellar account minimum reserve calculation.
 *
 * Formula based on Stellar's reserve requirements:
 * - Base account: 2 * baseReserve
 * - Each trustline: 1 * baseReserve
 * - Each additional signer beyond the master key: 1 * baseReserve
 * - Each data entry: 1 * baseReserve
 *
 * @param baseReserve The current base reserve value in XLM (e.g., 0.5 XLM).
 * @param numTrustlines The number of trustlines on the account.
 * @param numSigners The total number of signers on the account (including the master key).
 * @param numDataEntries The number of data entries on the account.
 * @returns The calculated minimum reserve in XLM.
 */
export const calculateMinReserve = (
  baseReserve: number,
  numTrustlines: number,
  numSigners: number,
  numDataEntries: number,
): number => {
  const additionalSignersCost = Math.max(0, numSigners - 1);
  const totalEntries = 2 + numTrustlines + additionalSignersCost + numDataEntries;
  const minReserve = totalEntries * baseReserve;

  return parseFloat(minReserve.toFixed(7));
};
