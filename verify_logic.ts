import "dotenv/config";
import { ENV } from "./api/_server/env.js";

async function verifyLogic() {
    console.log("=== VERIFYING DYNAMIC SPLIT LOGIC ===");

    // Test Case: Split 10/90
    const totalAmountCents = 25000; // R$ 250,00
    const organizerRecipientId: string = "re_ORGANIZER_ID";
    const platformRecipientId: string = "re_PLATFORM_ID";

    if (organizerRecipientId && platformRecipientId && organizerRecipientId !== platformRecipientId) {
        const platformFeePercentage = 10;
        const platformAmount = Math.round(totalAmountCents * (platformFeePercentage / 100));
        const organizerAmount = totalAmountCents - platformAmount;

        console.log(`Input Total: ${totalAmountCents}`);
        console.log(`Expected Platform (10%): ${totalAmountCents * 0.1}`);
        console.log(`Calculated Platform: ${platformAmount}`);
        console.log(`Calculated Organizer: ${organizerAmount}`);
        console.log(`Sum: ${platformAmount + organizerAmount}`);

        if (platformAmount + organizerAmount === totalAmountCents) {
            console.log("✅ Split Math Correct");
        } else {
            console.error("❌ Split Math Error");
        }
    } else {
        console.error("❌ Split Condition Not Met");
    }

    console.log("\n=== VERIFYING RECIPIENT DATA MAPPING ===");
    const input = {
        document: "12345678901",
        bankAccount: {
            bank_code: "290",
            agencia: "0001",
            agencia_dv: "9",
            conta: "40507969",
            conta_dv: "5",
            type: "checking",
            legal_name: "Test User"
        },
        phone: "11999999999"
    };

    const cleanDoc = String(input.document).replace(/\D/g, '');
    const recipientData = {
        name: input.bankAccount.legal_name || 'Organizador',
        document: cleanDoc,
        type: cleanDoc.length > 11 ? 'corporation' : 'individual',
        bankAccount: {
            holderName: input.bankAccount.legal_name || 'Organizador',
            holderType: cleanDoc.length > 11 ? 'corporation' : 'individual',
            holderDocument: cleanDoc,
            bank: input.bankAccount.bank_code,
            branchNumber: input.bankAccount.agencia,
            accountNumber: input.bankAccount.conta,
            type: (input.bankAccount.type === 'conta_corrente' || input.bankAccount.type === 'checking') ? 'checking' : 'savings'
        }
    };

    console.log("Recipient Data Payload Draft:", JSON.stringify(recipientData, null, 2));

    if (recipientData.bankAccount.type === 'checking') {
        console.log("✅ Account Type Mapping Correct");
    } else {
        console.error("❌ Account Type Mapping Error");
    }

    if (recipientData.type === 'individual') {
        console.log("✅ Holder Type Mapping Correct (Individual)");
    } else {
        console.error("❌ Holder Type Mapping Error");
    }

    console.log("\nVerification Finished.");
}

verifyLogic().catch(console.error);
