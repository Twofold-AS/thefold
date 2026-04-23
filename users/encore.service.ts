import { Service } from "encore.dev/service";
import { cookieMiddleware } from "./cookie-middleware";

// Fase J.1 — cookieMiddleware setter HttpOnly-auth-cookie + CSRF-cookie
// på verifyOtp-respons og fjerner begge på logout.
export default new Service("users", {
  middlewares: [cookieMiddleware],
});
