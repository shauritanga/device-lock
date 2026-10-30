export type AgreementStatus = 'DRAFT' | 'SENT' | 'CLIENT_SIGNED' | 'ACTIVE' | 'VOID';

export type AgreementContent = {
  title: string;
  subtitle: string;
  intro: string;
  parties: { role: string; text: string }[];
  clauses: {
    number: string;
    title: string;
    blocks: { label?: string; text: string }[];
  }[];
};

export type Agreement = {
  id: string;
  tenantId: string;
  status: AgreementStatus;
  termsVersion: string;
  content: AgreementContent;
  contentHash: string;
  feePerDevice: number;
  providerName: string;
  providerAddress: string;
  providerEmail?: string | null;
  providerPhone?: string | null;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  clientPhone?: string | null;
  sentAt?: string | null;
  activatedAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  clientSignatoryName?: string | null;
  clientSignatoryTitle?: string | null;
  clientSignature?: string | null;
  clientSignedAt?: string | null;
  clientWitnessName?: string | null;
  clientWitnessSignature?: string | null;
  providerSignatoryName?: string | null;
  providerSignatoryTitle?: string | null;
  providerSignature?: string | null;
  providerSignedAt?: string | null;
  providerWitnessName?: string | null;
  providerWitnessSignature?: string | null;
  createdAt: string;
};

export type AgreementSummary = Pick<
  Agreement,
  'id' | 'status' | 'clientName' | 'feePerDevice' | 'sentAt' | 'activatedAt' | 'createdAt'
>;

export type SignPayload = {
  signatoryName: string;
  signatoryTitle: string;
  signature: string;
  witnessName?: string;
  witnessSignature?: string;
  authorized: boolean;
};
