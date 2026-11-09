import { createLiveP30ReadOnlyAdapter } from "../purchase/isolated/live";
import { createCustomerLoginHttp } from "./auth-http";
import { CustomerLoginController } from "./login-controller";
import { preparationUnavailable } from "./preparation-boundary";
export function createCustomerRuntime() {
  if (
    window.location.origin !== "http://127.0.0.1:5174" ||
    window.location.pathname !== "/p30-app.html"
  )
    throw Error("Open the separate customer preview.");
  const reads = createLiveP30ReadOnlyAdapter(),
    login = new CustomerLoginController(reads, createCustomerLoginHttp());
  return { reads, login, preparation: preparationUnavailable };
}
export type CustomerRuntime = ReturnType<typeof createCustomerRuntime>;
