import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../api/_server/routers.js";
import superjson from "superjson";

export const trpc = createTRPCReact<AppRouter>();
