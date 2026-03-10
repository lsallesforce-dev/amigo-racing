import { appRouter } from "./api/_server/routers.js";
import { createContext } from "./api/_server/context.js";

async function testAuth() {
    try {
        console.log("Testing auth.me...");
        // Mock context without req/res but with a fake user
        const ctx = {
            user: { id: 1, openId: "test", name: "Test", email: "test@test.com", role: "admin" }
        };
        const result = await (appRouter as any).auth.me({ ctx });
        console.log("auth.me result:", result);
    } catch (e) {
        console.error("auth.me FAILED:", e);
    }
}

testAuth();
