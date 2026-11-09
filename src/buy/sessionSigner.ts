import type { PurchaseSigner } from "./purchaseFlow";

/** Retain an exact wallet response before PurchaseFlow's post-sign abort checks. */
export function sessionPurchaseSigner(
  raw: PurchaseSigner,
  isCurrent: () => boolean,
  invalidate: () => void,
): PurchaseSigner {
  return {
    address: raw.address,
    async signTransaction(packet) {
      if (!isCurrent())
        throw Error("Your sign-in or wallet changed. Review again.");
      const signed = new Uint8Array(await raw.signTransaction(packet));
      // React effects may not have run yet. Invalidate synchronously, then let
      // PurchaseFlow verify and durably retain the original signature before
      // its epoch/abort checks prevent revalidation, simulation and broadcast.
      if (!isCurrent()) invalidate();
      return signed;
    },
  };
}
