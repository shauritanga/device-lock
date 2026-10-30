export const AGREEMENT_TERMS_VERSION = 'service-agreement-v1';

export type AgreementParams = {
  providerName: string;
  providerAddress: string;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  clientPhone?: string | null;
  providerEmail?: string | null;
  providerPhone?: string | null;
  feePerDevice: number;
};

export type AgreementBlock = { label?: string; text: string };
export type AgreementClause = {
  number: string;
  title: string;
  blocks: AgreementBlock[];
};
export type AgreementContent = {
  title: string;
  subtitle: string;
  intro: string;
  parties: { role: string; text: string }[];
  clauses: AgreementClause[];
};

const tzs = (n: number) => `TZS ${n.toLocaleString('en-US')}`;

const WORDS: Record<number, string> = {
  1000: 'One Thousand',
  2000: 'Two Thousand',
  3000: 'Three Thousand',
  4000: 'Four Thousand',
  5000: 'Five Thousand',
  6000: 'Six Thousand',
  7000: 'Seven Thousand',
  8000: 'Eight Thousand',
  9000: 'Nine Thousand',
  10000: 'Ten Thousand',
};

function contactLine(email?: string | null, phone?: string | null) {
  const parts = [email && `Email: ${email}`, phone && `Phone: ${phone}`].filter(Boolean);
  return parts.length ? parts.join('; ') : 'As notified in writing';
}

/** Renders the agreement terms with the party details filled in. */
export function renderAgreement(p: AgreementParams): AgreementContent {
  const provider = p.providerName.toUpperCase();
  const client = p.clientName.toUpperCase();
  const fee = tzs(p.feePerDevice);
  const feeWords = WORDS[p.feePerDevice];
  const feeText = feeWords ? `${fee} (Tanzanian Shillings ${feeWords})` : fee;

  return {
    title: 'SERVICE AGREEMENT',
    subtitle: 'SIMU LINDA DEVICE LOCK SYSTEM AND CALL CENTER SERVICES',
    intro:
      'This Service Agreement (“Agreement”) is made on the date of the last signature below.',
    parties: [
      {
        role: 'SERVICE PROVIDER',
        text: `${provider}, a company incorporated under the laws of the United Republic of Tanzania, with its registered office at ${p.providerAddress}, hereinafter referred to as the “SERVICE PROVIDER”.`,
      },
      {
        role: 'CLIENT',
        text: `${client}, a company incorporated under the laws of the United Republic of Tanzania, with its registered office at ${p.clientAddress}, hereinafter referred to as the “CLIENT”.`,
      },
    ],
    clauses: [
      {
        number: '1',
        title: 'PURPOSE OF THE AGREEMENT',
        blocks: [
          {
            text: `This Agreement sets out the terms under which ${provider} shall provide its Simu Linda Device Lock System and Call Center Services to ${client} to support device management, customer communication, and repayment-management activities.`,
          },
        ],
      },
      {
        number: '2',
        title: 'SCOPE OF SERVICES',
        blocks: [
          {
            label: '2.1 Simu Linda Device Lock System',
            text: 'The Service Provider shall provide access to and support for the Simu Linda Device Lock System, subject to agreed technical capabilities and implementation arrangements. Services may include management of eligible financed devices; authorized device-locking and unlocking operations; monitoring of enrolled devices; and technical assistance.',
          },
          {
            text: 'All device-locking and unlocking operations shall follow the Parties’ written authorization procedures, applicable law, and any required customer agreements or consents.',
          },
          {
            label: '2.2 Call Center Services',
            text: 'The Service Provider shall provide call center services to support customer-contact and repayment-management activities. These may include outbound calls, repayment follow-ups, approved customer communications, recording customer interactions, escalating complaints or disputes, and providing agreed operational reports.',
          },
          {
            text: 'The Client shall provide accurate customer information, approved communication scripts, repayment information, and other reasonable instructions needed for service delivery.',
          },
        ],
      },
      {
        number: '3',
        title: 'SERVICE FEES AND PAYMENT TERMS',
        blocks: [
          {
            label: '3.1 Monthly Fee Per Device',
            text: `The Client shall pay the Service Provider ${feeText} per device per month for the agreed Simu Linda services.`,
          },
          {
            label: '3.2 Monthly Billing',
            text: 'The monthly fee shall be calculated based on the number of devices enrolled in the service and designated as billable under a reconciliation procedure agreed by the Parties. The Parties shall agree in writing on the treatment of newly enrolled, suspended, deactivated, or otherwise non-billable devices.',
          },
          {
            label: '3.3 Invoicing and Payment',
            text: 'The Service Provider shall issue monthly invoices stating the billing period, number of billable devices, unit rate, and total payable. The Client shall pay each undisputed invoice within five (5) calendar days of receipt, unless agreed otherwise in writing. Invoice disputes shall be raised in writing with reasons, and undisputed amounts shall remain payable by the due date.',
          },
          {
            text: 'Applicable taxes, including VAT where legally chargeable, shall be handled in accordance with Tanzanian law.',
          },
          {
            label: '3.4 Changes to Fees',
            text: `Any change to the agreed fee of ${fee} per device per month must be mutually agreed in writing.`,
          },
        ],
      },
      {
        number: '4',
        title: 'CONTRACT REVIEW AND RENEGOTIATION',
        blocks: [
          {
            text: 'The Parties agree that this Agreement may be reviewed and renegotiated after a period to be mutually agreed upon in writing. Review may cover service fees, scope and quality of services, number of devices, operational requirements, performance, and other commercial or technical terms.',
          },
          {
            text: 'No amendment shall take effect unless documented in writing and signed or formally approved by authorized representatives of both Parties. Until then, the existing terms remain applicable.',
          },
        ],
      },
      {
        number: '5',
        title: 'OBLIGATIONS OF THE SERVICE PROVIDER',
        blocks: [
          {
            text: `${provider} shall: (a) provide the agreed services with reasonable care, skill, and professionalism; (b) assign appropriate personnel; (c) maintain reasonable technical and operational safeguards; (d) notify the Client of significant service interruptions; (e) protect confidential information; (f) provide agreed reports; and (g) ensure its personnel comply with applicable laws and agreed procedures.`,
          },
        ],
      },
      {
        number: '6',
        title: 'OBLIGATIONS OF THE CLIENT',
        blocks: [
          {
            text: `${client} shall: (a) provide accurate and up-to-date information; (b) ensure it has lawful authority and required customer consents to share information and request device-locking or unlocking; (c) provide clear instructions and authorization procedures; (d) pay fees in accordance with this Agreement; (e) provide reasonable cooperation; (f) promptly notify the Service Provider of relevant changes; and (g) remain responsible for its credit agreements, lending decisions, account balances, repayment terms, and customer-account determinations.`,
          },
        ],
      },
      {
        number: '7',
        title: 'CONFIDENTIALITY',
        blocks: [
          {
            text: 'Each Party shall keep confidential all non-public business, financial, technical, operational, and customer information received from the other Party in connection with this Agreement. Such information shall be used only for purposes connected with this Agreement and shall not be disclosed to unauthorized third parties except with written consent or where required by law. Each Party shall take reasonable steps to prevent unauthorized access, use, or disclosure.',
          },
        ],
      },
      {
        number: '8',
        title: 'DATA PROTECTION AND CUSTOMER INFORMATION',
        blocks: [
          {
            text: 'The Parties shall comply with applicable data-protection and privacy laws of the United Republic of Tanzania and implement appropriate technical and organizational measures to protect personal data. The Parties shall agree in writing on responsibilities concerning processing purposes, access controls, retention, incident reporting, and secure deletion or return of information. Customer information shall not be used for unrelated purposes without an appropriate lawful basis.',
          },
        ],
      },
      {
        number: '9',
        title: 'SERVICE AVAILABILITY AND TECHNICAL SUPPORT',
        blocks: [
          {
            text: 'The Parties shall agree on operational procedures for service availability, technical support, incident reporting, escalation, and resolution. Specific service-level targets, including availability and response times, may be documented in a separate written schedule. The Service Provider shall not be responsible for interruptions beyond its reasonable control, including third-party network failures, provided it takes reasonable steps to communicate and address resulting issues.',
          },
        ],
      },
      {
        number: '10',
        title: 'TERM AND TERMINATION',
        blocks: [
          {
            label: '10.1 Commencement',
            text: 'This Agreement shall commence on the date of signature by both Parties and continue until terminated in accordance with this clause.',
          },
          {
            label: '10.2 Termination by Mutual Agreement',
            text: 'The Parties may terminate this Agreement at any time by mutual written agreement.',
          },
          {
            label: '10.3 Termination for Breach',
            text: 'Either Party may give written notice describing a material breach and allow the other Party thirty (30) calendar days to remedy it. If the breach is not remedied within that period, the non-breaching Party may terminate by further written notice, subject to applicable law.',
          },
          {
            label: '10.4 Termination for Convenience',
            text: 'Either Party may terminate this Agreement by giving thirty (30) calendar days’ prior written notice.',
          },
          {
            label: '10.5 Consequences of Termination',
            text: 'The Client shall pay fees properly due for services provided up to termination. The Parties shall coordinate an orderly cessation or transition of services, disable or transition system access as appropriate, and return, transfer, or delete confidential information and personal data as required by law and agreed procedures. Provisions intended to survive termination shall remain effective.',
          },
        ],
      },
      {
        number: '11',
        title: 'LIMITATION OF RESPONSIBILITY',
        blocks: [
          {
            text: 'Each Party is responsible for its own acts, omissions, and breaches, subject to applicable law. The Service Provider is not responsible for the Client’s lending decisions, information supplied by the Client, or disputes arising from the underlying credit agreement, except to the extent directly caused by the Service Provider’s breach or unlawful conduct.',
          },
          {
            text: 'Neither Party shall be liable for indirect or consequential losses to the extent permitted by law. Nothing in this Agreement excludes or limits liability where such exclusion or limitation is prohibited by law.',
          },
        ],
      },
      {
        number: '12',
        title: 'FORCE MAJEURE',
        blocks: [
          {
            text: 'Neither Party shall be in breach to the extent performance is prevented or materially delayed by circumstances beyond its reasonable control, including natural disasters, civil disturbances, government restrictions, or widespread telecommunications failures and similar issues. The affected Party shall notify the other as soon as reasonably practicable and take reasonable steps to minimize the effects. If the event continues for more than sixty (60) consecutive days, the Parties shall discuss appropriate measures.',
          },
        ],
      },
      {
        number: '13',
        title: 'GOVERNING LAW',
        blocks: [
          {
            text: 'This Agreement shall be governed by and interpreted in accordance with the laws of the United Republic of Tanzania.',
          },
        ],
      },
      {
        number: '14',
        title: 'AMENDMENTS AND ENTIRE AGREEMENT',
        blocks: [
          {
            text: 'This Agreement sets out the Parties’ understanding concerning the services described herein and supersedes prior discussions on the same subject to the extent of any conflict. Any amendment must be in writing and approved by authorized representatives of both Parties. If any provision is invalid or unenforceable, the remaining provisions shall continue to apply to the extent permitted by law.',
          },
        ],
      },
      {
        number: '15',
        title: 'NOTICES',
        blocks: [
          {
            text: 'Formal notices shall be delivered by hand, registered mail, or email to the authorized contacts below, or to updated contact details notified in writing.',
          },
          {
            label: `For ${provider}`,
            text: `${p.providerAddress}. ${contactLine(p.providerEmail, p.providerPhone)}`,
          },
          {
            label: `For ${client}`,
            text: `${p.clientAddress}. ${contactLine(p.clientEmail, p.clientPhone)}`,
          },
        ],
      },
      {
        number: '16',
        title: 'EXECUTION AND SIGNATURES',
        blocks: [
          {
            text: 'By signing below, the Parties confirm that they have read, understood, and agreed to the terms of this Agreement and that their signatories are authorized to execute it.',
          },
        ],
      },
    ],
  };
}
