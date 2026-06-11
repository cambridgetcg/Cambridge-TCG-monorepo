export type VerificationStatus = "pending" | "verified" | "rejected" | "expired";
export type DisputeStatus = "open" | "under_review" | "awaiting_evidence" | "escalated" | "resolved_buyer" | "resolved_seller" | "resolved_split" | "closed";

export interface UserVerification {
  id: string;
  user_id: string;
  status: VerificationStatus;
  full_legal_name: string;
  date_of_birth: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  county: string | null;
  postcode: string;
  country: string;
  phone: string | null;
  phone_verified: boolean;
  bank_sort_code: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  admin_notes: string | null;
  verified_at: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  resubmitted_count: number;
  created_at: string;
  updated_at?: string;
}

export type VerificationDocType = "id_front" | "id_back" | "passport" | "proof_of_address" | "other";

export interface VerificationDocument {
  id: string;
  user_id: string;
  doc_type: VerificationDocType | string;
  url: string;
  s3_key: string;
  mime_type: string | null;
  uploaded_at: string;
}

export const VERIFICATION_DOC_LABELS: Record<string, string> = {
  id_front: "ID (front)",
  id_back: "ID (back)",
  passport: "Passport",
  proof_of_address: "Proof of address",
  other: "Other",
};

export interface TradeDispute {
  id: string;
  trade_id: string;
  raised_by: string;
  reason: string;
  description: string;
  status: DisputeStatus;
  resolution_type: string | null;
  resolution_notes: string | null;
  refund_amount: string | null;
  resolved_at: string | null;
  created_at: string;
  // Lifecycle timestamps (migrations 0057, 0106)
  under_review_at?: string | null;
  awaiting_evidence_at?: string | null;
  withdrawn_at?: string | null;
  escalated_at?: string | null;
  // Joined
  raiser_name?: string | null;
  raiser_email?: string;
  card_name?: string | null;
  trade_price?: string;
  buyer_name?: string | null;
  seller_name?: string | null;
}

export interface DisputeMessage {
  id: string;
  dispute_id: string;
  sender_id: string;
  is_admin: boolean;
  message: string;
  created_at: string;
  sender_name?: string | null;
}

export interface DisputeEvidence {
  id: string;
  dispute_id: string;
  uploaded_by: string;
  url: string;
  label: string | null;
  created_at: string;
}

export interface EscrowPayment {
  id: string;
  trade_id: string;
  type: string;
  stripe_payment_intent: string | null;
  stripe_checkout_session: string | null;
  amount: string;
  status: string;
  paid_at: string | null;
  payout_amount: string | null;
  payout_at: string | null;
  refund_amount: string | null;
  refunded_at: string | null;
  created_at: string;
}

export const DISPUTE_REASONS = [
  { value: "condition_mismatch", label: "Card condition doesn't match listing" },
  { value: "wrong_card", label: "Wrong card received" },
  { value: "counterfeit", label: "Card appears counterfeit" },
  { value: "not_received", label: "Card not received" },
  { value: "damaged_shipping", label: "Card damaged during shipping" },
  { value: "other", label: "Other issue" },
] as const;

export const UK_POSTCODE_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;
