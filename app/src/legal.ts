/**
 * Text for the About, Plans and legal pages. Edit the wording here.
 * This is a starting draft, not legal advice: have a Malaysian lawyer check it
 * before charging money or signing up businesses.
 */

// Where people send privacy requests and questions: the in-app form, which emails the owner.
export const CONTACT = "the Contact us form (in Settings, or at the bottom of the log-in page)";
export const RETENTION_DAYS = 30;
export const UPDATED = "3 November 2026";

export interface Section {
  heading?: string;
  body: string[];
}

export interface Page {
  title: string;
  intro?: string;
  sections: Section[];
}

export type PageKey = "about" | "plans" | "terms" | "privacy" | "ai";

export const PAGE_ORDER: { key: PageKey; label: string }[] = [
  { key: "about", label: "About CIXCLE" },
  { key: "plans", label: "Plans" },
  { key: "terms", label: "Terms of Service" },
  { key: "privacy", label: "Privacy Policy (PDPA)" },
  { key: "ai", label: "AI Use Policy" },
];

export const PAGES: Record<PageKey, Page> = {
  about: {
    title: "About CIXCLE",
    intro: "Meetings in Malay, English and Manglish, turned into clear notes you can act on.",
    sections: [
      {
        heading: "Why CIXCLE",
        body: [
          "Most meeting tools are built for one language. In Malaysia we switch between Bahasa Melayu, English and our own slang in the same sentence, and those tools get lost.",
          "CIXCLE was started by Yusri in Malaysia to fix that. You put your phone on the table and CIXCLE writes the transcript, tells you who said what, and gives you a short report with decisions, action items and suggestions.",
        ],
      },
      {
        heading: "Our mission",
        body: [
          "To help every Malaysian team leave a meeting knowing exactly what was agreed and who does what next, in the language they actually speak.",
        ],
      },
      {
        heading: "Our vision",
        body: [
          "A Malaysia where no idea, decision or promise gets lost after a meeting, whether it happens in a boardroom, a kopitiam or a WhatsApp call.",
        ],
      },
      {
        heading: "What we believe",
        body: [
          "• Your words belong to you. Meetings are deleted automatically after 30 days, and we never sell your data.",
          "• People decide, AI assists. CIXCLE suggests; you and your team make the calls.",
          "• Built for how we talk. Manglish is not a mistake to correct.",
        ],
      },
      {
        heading: "Contact",
        body: ["Questions, ideas or partnership enquiries: send us a message through the Contact us form."],
      },
    ],
  },

  plans: {
    title: "Plans",
    intro: "Try CIXCLE free. For real work, get the Business plan.",
    sections: [
      {
        heading: "Free (very limited)",
        body: [
          "For trying CIXCLE out.",
          "• 3 meetings a month, up to 15 minutes each",
          "• 20 Ask AI questions a month",
          "• Live captions, speaker labels, AI report and translation",
          `• Meetings deleted after ${RETENTION_DAYS} days`,
        ],
      },
      {
        heading: "Business (full version)",
        body: [
          "For companies, teams and business deals.",
          "• Long meetings and many more each month",
          "• Unlimited Ask AI",
          "• Shared meetings, custom company words, admin and invoices",
          "• Priced for your team: fill in the Business enquiry form and we'll send a proposal",
        ],
      },
    ],
  },

  terms: {
    title: "Terms of Service",
    intro: `Last updated ${UPDATED}. By creating an account or using CIXCLE you agree to these terms.`,
    sections: [
      {
        heading: "1. The service",
        body: [
          "CIXCLE records meetings, turns speech into text and uses AI to write summaries, action items and suggestions. The service is offered from Malaysia and is currently a free trial that may change, be limited or stop at any time.",
        ],
      },
      {
        heading: "2. Your account",
        body: [
          "You must be at least 18 years old, give a real email address and keep your password private. You are responsible for everything done with your account. Tell us straight away if you think someone else is using it.",
        ],
      },
      {
        heading: "3. Recording other people",
        body: [
          "Before you record, you must tell everyone in the meeting and get their agreement. You must not record anyone secretly or where the law or a confidentiality duty does not allow it. You are responsible for the recordings you make, not CIXCLE.",
        ],
      },
      {
        heading: "4. Acceptable use",
        body: [
          "Do not use CIXCLE to break the law, harass people, record private conversations without consent, upload content you have no right to, or try to break, overload or copy the service.",
        ],
      },
      {
        heading: "5. Your content",
        body: [
          "Your recordings, transcripts and reports belong to you. You give us permission to store and process them only to provide the service to you. We do not sell them.",
          `Meetings, including recordings, transcripts and reports, are permanently deleted ${RETENTION_DAYS} days after they are created. Keep your own copy of anything you need.`,
        ],
      },
      {
        heading: "6. AI output",
        body: [
          "Transcripts and reports are made by AI and can be wrong or incomplete. They are suggestions, not professional, legal, financial or medical advice. Check them before relying on them. See the AI Use Policy.",
        ],
      },
      {
        heading: "7. Limits and paid plans",
        body: [
          "The free plan includes 3 meetings a month of up to 15 minutes each and 20 Ask AI questions a month. For a Business plan, the price and terms are agreed with you before you pay. Nothing is charged without your agreement.",
        ],
      },
      {
        heading: "8. No guarantee",
        body: [
          "CIXCLE is provided \"as is\" during the trial. We work hard to keep it running and accurate, but we do not promise it will always be available, error-free or suitable for a particular purpose.",
        ],
      },
      {
        heading: "9. Our liability",
        body: [
          "As far as Malaysian law allows, we are not liable for indirect losses or for decisions made based on AI output. Nothing in these terms limits rights you have under the Consumer Protection Act 1999 that cannot be excluded.",
        ],
      },
      {
        heading: "10. Ending your account",
        body: [
          `You can stop using CIXCLE at any time and delete your account yourself in Settings > Delete my account. This permanently deletes your log-in and all your meetings straight away. We may suspend accounts that break these terms.`,
        ],
      },
      {
        heading: "11. Changes and law",
        body: [
          "We may update these terms and will show the new date here. Continuing to use CIXCLE means you accept the update. These terms are governed by the laws of Malaysia.",
        ],
      },
    ],
  },

  privacy: {
    title: "Privacy Policy (PDPA)",
    intro: `Last updated ${UPDATED}. This notice explains how CIXCLE handles your personal data under Malaysia's Personal Data Protection Act 2010 (PDPA). Notis ini juga boleh didapati dalam Bahasa Melayu atas permintaan.`,
    sections: [
      {
        heading: "What we collect",
        body: [
          "• Account details: your name, email address and a protected (hashed) version of your password.",
          "• Meeting content: audio recordings, live captions, transcripts, speaker names, AI reports, translations and Ask AI questions.",
          "• Usage: how many meetings you made this month, and basic technical logs needed to run and secure the service.",
          "Recordings can include the voices and personal data of other people in your meeting.",
        ],
      },
      {
        heading: "Why we use it",
        body: [
          "Only to provide CIXCLE: to log you in, transcribe and summarise your meetings, apply plan limits, keep the service secure and answer your requests. We do not sell your data or use it for advertising.",
        ],
      },
      {
        heading: "Consent",
        body: [
          "We ask for your consent when you create an account, and before every recording we ask you to confirm that everyone in the meeting agrees to be recorded. You can withdraw consent at any time by deleting your meetings or asking us to delete your account.",
        ],
      },
      {
        heading: "How long we keep it",
        body: [
          `Meetings, including recordings, transcripts, reports and translations, are permanently deleted ${RETENTION_DAYS} days after they are created. You can delete them earlier yourself in the app.`,
          "Your account details are kept until you ask us to delete your account.",
        ],
      },
      {
        heading: "Who processes it for us",
        body: [
          "To run CIXCLE we use trusted service providers, some of which store or process data outside Malaysia:",
          "• ElevenLabs: speech-to-text, live captions and voice.",
          "• An AI model provider (Groq, Google Gemini or Anthropic Claude): reports, Ask AI and translation.",
          "• Supabase: secure file storage.",
          "• Render: hosting for the app and server.",
          "They may only use your data to provide their service to us. By using CIXCLE you consent to this transfer as allowed under section 129 of the PDPA.",
        ],
      },
      {
        heading: "Security",
        body: [
          "Data is sent over encrypted connections (HTTPS), stored in private storage, and only your log-in can open your meetings. Passwords are never stored in readable form. No system is perfectly secure, so please use a strong password.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          `Under the PDPA you can ask to see the data we hold about you, correct it, limit how it is used, or have it deleted. You can delete your account and all your meetings yourself at any time in Settings > Delete my account. For other requests, use ${CONTACT} and we will reply within 21 days.`,
        ],
      },
      {
        heading: "Children",
        body: ["CIXCLE is not meant for people under 18."],
      },
      {
        heading: "Contact",
        body: [`Privacy questions or complaints: ${CONTACT}.`],
      },
    ],
  },

  ai: {
    title: "AI Use Policy",
    intro: `Last updated ${UPDATED}. How CIXCLE uses artificial intelligence, and what it does not do.`,
    sections: [
      {
        heading: "What the AI does",
        body: [
          "• Turns speech into text and labels different speakers.",
          "• Writes a summary, key points, decisions, action items and recommendations.",
          "• Answers your questions about a meeting (Ask AI) and translates reports.",
        ],
      },
      {
        heading: "Suggestions, not decisions",
        body: [
          "Everything the AI writes is a recommendation based on what was said. It does not decide anything for you or your team, and it does not judge people. The people in the meeting stay responsible for decisions and actions.",
        ],
      },
      {
        heading: "It can make mistakes",
        body: [
          "AI can mishear words, mix up speakers, miss context or get slang wrong. Always check important names, numbers, dates and commitments against the recording before you act on them. Do not use CIXCLE output as legal, financial, medical or HR advice.",
        ],
      },
      {
        heading: "Your data and AI",
        body: [
          "Your meeting is sent to our AI providers only to create your transcript, report and answers. We do not sell your data or use it to train our own AI models, and it is deleted with the meeting after 30 days.",
        ],
      },
      {
        heading: "Fair use",
        body: [
          "Do not use CIXCLE's AI to profile, discriminate against or secretly monitor people, or to create misleading records of what someone said.",
        ],
      },
      {
        heading: "Questions",
        body: [`Concerns about an AI result? Tell us through ${CONTACT}.`],
      },
    ],
  },
};
