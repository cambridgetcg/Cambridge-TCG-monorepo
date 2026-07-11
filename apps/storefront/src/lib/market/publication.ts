export const COMPLETED_TRADE_PUBLICATION = {
  status: "paused" as const,
  reason:
    "Completed-trade derivatives are paused because the existing records do not carry purpose-specific publication consent and repeated aggregate reads can reveal individual activity.",
  resumeConditions: [
    "A versioned publication choice exists before the contributing activity.",
    "One centralized projector releases only delayed, closed, coarse cohorts.",
    "Cross-endpoint and repeated-read reconstruction tests pass.",
  ],
};

export const MARKET_INTEREST_PUBLICATION = {
  status: "paused" as const,
  reason:
    "Watch, alert, and co-watch derivatives are paused because private utility choices were not consent to public market-intelligence publication.",
  resumeConditions: [
    "A versioned aggregate-publication choice exists before a watch or alert contributes.",
    "One centralized projector releases only delayed, coarse cohorts.",
    "Repeated-read and controlled-account reconstruction tests pass.",
  ],
};
