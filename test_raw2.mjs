import https from 'https';
import fs from 'fs';

const data = JSON.stringify({
    name: "Wéliton Luiz de Oliveira",
    email: "projeto@lstecnologias.com.br",
    document: "82751056849",
    type: "individual",
    default_bank_account: {
        holder_name: "Wéliton Luiz de Oliveira",
        holder_type: "individual",
        holder_document: "82751056849",
        bank: "237",
        branch_number: "2740",
        account_number: "0021603",
        account_check_digit: "8",
        type: "checking"
    },
    transfer_settings: {
        transfer_enabled: true,
        transfer_interval: "Daily",
        transfer_day: 0
    }
});

const options = {
    hostname: 'api.pagar.me',
    port: 443,
    path: '/core/v5/recipients',
    method: 'POST',
    headers: {
        'Authorization': 'Basic c2tfdGVzdF9adkE3RzBoYTBDZ29ZT1Y5Og==',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
};

const req = https.request(options, res => {
    let body = '';
    res.on('data', d => { body += d; });
    res.on('end', () => {
        fs.writeFileSync('pagarme_error_fernanda.json', body);
        console.log("Written to pagarme_error_fernanda.json");
    });
});

req.on('error', e => console.error(e));
req.write(data);
req.end();
