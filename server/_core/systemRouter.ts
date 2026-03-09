import { router, publicProcedure } from "./trpc.js";
import { z } from "zod";

export const systemRouter = router({
    health: publicProcedure.query(() => ({ status: "ok" })),
    version: publicProcedure.query(() => ({ version: "1.0.0" })),
});
