import "dotenv/config";
import * as db from "./api/server/db.js";

async function run() {
    try {
        const reqs = await db.getAllOrganizerRequests();
        console.log(JSON.stringify(reqs, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        process.exit(0);
    }
}

run();
