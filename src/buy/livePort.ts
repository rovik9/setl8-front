import { createGatedCheckoutPort } from "./checkoutPort";
/** The production factory is source-gated OFF; it never selects the offline fixture factory. */
export const createGatedPort = createGatedCheckoutPort;
