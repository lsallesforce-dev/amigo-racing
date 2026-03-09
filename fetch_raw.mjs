async function fetchRawError() {
    try {
        const url = 'https://amigo-racing.vercel.app/api/raw-test';
        const res = await fetch(url);
        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Body:", text);
    } catch (e) {
        console.error("Fetch failed", e);
    }
}
fetchRawError();
