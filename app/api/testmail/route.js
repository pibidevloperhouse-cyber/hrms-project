// import { NextResponse } from "next/server";
// import { transporter } from "@/lib/supabase/mail/mail";

// export async function GET() {
//   try {
//     // Test SMTP connection
//     await transporter.verify();

//     return NextResponse.json({
//       success: true,
//       message: "SMTP Connected Successfully",
//     });
//   } catch (error) {
//     return NextResponse.json({
//       success: false,
//       message: error.message,
//     });
//   }
// }


import { NextResponse } from "next/server";
import { transporter } from "@/lib/supabase/mail/mail";

export async function GET() {
  try {
    await transporter.sendMail({
      from: `"HRMS" <${process.env.EMAIL_USER}>`,
      to: "lionelnithi123@gmail.com", // Replace with your email
      subject: "SMTP Test",
      html: `
        <h2>Congratulations! 🎉</h2>
        <p>Your Gmail SMTP is working successfully.</p>
      `,
    });

    return NextResponse.json({
      success: true,
      message: "Email sent successfully!",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({
      success: false,
      error: error.message,
    });
  }
}