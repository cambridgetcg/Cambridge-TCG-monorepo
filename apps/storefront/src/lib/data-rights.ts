export const DATA_ACCESS_BOUNDARY =
  "The manifest declares access for each listed resource: public, user, agent, admin, or wholesale key.";

export const DATA_REUSE_BOUNDARY =
  "Reuse rights are endpoint- and source-specific; absence of a license is not permission. Envelope responses carrying source rights expose them in _meta.source_license.";

export const DATA_RIGHTS_BOUNDARY =
  `${DATA_ACCESS_BOUNDARY} ${DATA_REUSE_BOUNDARY}`;
