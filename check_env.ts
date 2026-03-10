import { ENV } from "./api/_server/env.js";
console.log("JWT_SECRET_LENGTH:", ENV.cookieSecret.length);
console.log("OAUTH_URL:", ENV.oAuthServerUrl);
