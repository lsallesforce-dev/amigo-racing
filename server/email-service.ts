export async function sendEmailNotification(to: string, subject: string, template: any) {
    console.log(`[Email Service] Sending mail to ${to}: ${subject}`);
    return { success: true };
}
