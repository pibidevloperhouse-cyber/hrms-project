import transporter from "./mailer";

export async function sendWelcomeEmail(
    email,
    companyName,
    ownerName
) {
    await transporter.sendMail({
        from: `"HRMS" <${process.env.EMAIL_USER}>`,

        to: email,

        subject: "Welcome to HRMS",

        html: `
            <h2>Welcome ${ownerName}</h2>

            <p>Your company
            <b>${companyName}</b>
            has been registered successfully.</p>

            <p>You can login now.</p>
        `,
    });
}