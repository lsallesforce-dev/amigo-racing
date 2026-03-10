import { appRouter } from "./api/_server/routers.js";
console.log("appRouter loaded successfully");
const procedures = Object.keys(appRouter._def.procedures);
console.log("Procedures:", procedures);
console.log("Auth exists:", procedures.includes("auth"));
if (procedures.includes("auth")) {
    const authProcedures = Object.keys((appRouter as any).auth._def.procedures || {});
    console.log("Auth procedures:", authProcedures);
}
