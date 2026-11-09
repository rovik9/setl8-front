/** Non-live UI fixtures. No mint, deployment profile, executable quote or transaction. */
export const purchaseExamples = [
  { id: "small", size: "50000000000", price: "39000000" },
  { id: "medium", size: "100000000000", price: "69000000" },
  { id: "large", size: "150000000000", price: "99000000" },
] as const;
export const confirmationExamples = {
  confirming: {
    title: "Example: chain confirmation pending",
    text: "A submitted payment would be checked before another purchase is offered. This example has no transaction.",
  },
  unknown: {
    title: "Example: status unknown",
    text: "The outcome is not known. A real flow would reconcile the original transaction before enabling another payment.",
  },
  verification: {
    title: "Example: confirmed, verification pending",
    text: "Chain confirmation does not establish accepted account ownership. A real flow would verify the purchase evidence before account indexing.",
  },
  indexing: {
    title: "Example: verified, indexing pending",
    text: "Payment confirmation and account availability are separate. A real flow would show indexing progress and the linked receipt.",
  },
  ready: {
    title: "Example: account available",
    text: "The account overview would become available after ownership is established. This demonstration creates no account.",
  },
  expired: {
    title: "Example: transaction expired",
    text: "A real flow would verify expiry and reconcile the original attempt before offering a new quote.",
  },
  rejected: {
    title: "Example: authorization rejected",
    text: "No authorization was accepted in this example. Review and return to account selection.",
  },
  failed: {
    title: "Example: transaction failed",
    text: "A real flow would show confirmed failure and its receipt. This demonstration sends no payment.",
  },
} as const;
