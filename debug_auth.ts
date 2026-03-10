import { sdk } from "./api/_server/sdk.js";
import * as db from "./api/_server/db.js";

async function debugAuth() {
    const cookieValue = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcGVuSWQiOiJsc2FsbGVzZm9yY2VAZ21haWwuY29tIiwiYXBwSWQiOiJhbWlnby1yYWNpbmciLCJuYW1lIjoiQURNIE1hc3RlciIsImV4cCI6MTgwNDY3Mjc4NX0.RD7j3-w9CzDBw2RyK57xGJE_EHa-RvHALsZwqraZHlg";

    console.log("Verifying session...");
    const session = await sdk.verifySession(cookieValue);
    console.log("Session verify result:", session);

    if (session) {
        console.log("Fetching user by openId:", session.openId);
        const user = await db.getUserByOpenId(session.openId);
        console.log("User fetch result:", user ? "FOUND" : "NOT FOUND");
        if (user) {
            console.log("User properties:", Object.keys(user));
            console.log("User role:", user.role);
        }
    }
}

debugAuth();
