import { createRecipient } from './api/_server/pagarme.js';

async function run() {
    // PAGARME_API_KEY deve estar no .env — nunca hardcode chaves aqui
    process.env.PAGARME_API_URL = "https://api.pagar.me/core/v5";

    try {
        const data = {
            name: "Fernanda Eduarda de Souza",
            email: "projeto@lstecnologias.com.br",
            document: "46478074870",
            type: "individual",
            phone: "17996688361",
            bankAccount: {
                bank: "290",
                branchNumber: "0001",
                branchCheckDigit: "",
                accountNumber: "9032526",
                accountCheckDigit: "7",
                type: "checking",
                holderName: "Fernanda Eduarda de Souza",
                holderType: "individual",
                holderDocument: "46478074870"
            }
        };
        const res = await createRecipient(data as any);
        console.log("SUCESSO:", res);
    } catch (e: any) {
        require('fs').writeFileSync('error.json', JSON.stringify((e as any).response || { message: e.message }, null, 2));
        console.error("ERRO COMPLETO:", e.message);
    }
}

run();
