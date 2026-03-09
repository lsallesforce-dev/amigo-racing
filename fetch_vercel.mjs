async function fetchEvents() {
    try {
        const url = 'https://amigo-racing.vercel.app/api/trpc/events.listAll?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%2C%22v%22%3A1%7D%7D%7D';
        const res = await fetch(url);
        const json = await res.json();
        console.log("Error details:");
        console.log(JSON.stringify(json[0].error.json, null, 2));
    } catch (e) {
        console.error("Fetch failed", e);
    }
}
fetchEvents();
