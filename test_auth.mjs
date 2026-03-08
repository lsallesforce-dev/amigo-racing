fetch("http://localhost:3000/api/oauth/callback?code=mock_oauth_code_xyz123&state=Lw==")
    .then(async res => {
        console.log("Status:", res.status);
        console.log("Body:", await res.text());
    }).catch(console.error);
