/** Editorial structure only. Access labels do not enforce authentication. */
export type RoomId = "cards" | "collection" | "play" | "learn" | "stories" | "community" | "sources" | "agents";
export type WritingRegister = "reference" | "interpretation" | "personal-account" | "experiment";
export type PageAccess = "public" | "sign-in";
export type EditorialState = "draft" | "published" | "archived";

export type RoomPage = {
  /** Stable editorial ID; trails refer to this rather than duplicating URLs. */
  readonly id: string;
  readonly label: string;
  readonly href: `/${string}`;
  readonly description: string;
  readonly access: PageAccess;
  readonly accessDescription: string;
};

export type RoomRecord = {
  readonly id: RoomId;
  readonly title: string;
  readonly taskLabel: string;
  readonly purpose: string;
  readonly introduction: string;
  readonly topics: readonly string[];
  readonly register: WritingRegister;
  readonly language: "en";
  /** Publication of this directory entry, not completion or deployment of a room rebuild. */
  readonly editorialState: EditorialState;
  readonly reviewedAt: string;
  readonly entryPageId: string;
  readonly pages: readonly RoomPage[];
  readonly relatedRoomIds: readonly RoomId[];
  /** Contributor context. Neither field belongs in a public projection. */
  readonly proposedCanonicalPath: `/${string}`;
  readonly modulePaths: readonly string[];
};

export type TrailRecord = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly language: "en";
  readonly editorialState: EditorialState;
  readonly stops: readonly { readonly pageId: string; readonly why: string }[];
};

export type PublicRoom = {
  readonly id: RoomId;
  readonly title: string;
  readonly taskLabel: string;
  readonly purpose: string;
  readonly introduction: string;
  readonly topics: readonly string[];
  readonly register: WritingRegister;
  readonly language: "en";
  readonly href: string;
  readonly access: PageAccess;
  readonly accessDescription: string;
  readonly relatedRoomIds: readonly RoomId[];
  readonly links: readonly RoomPage[];
};

export type PublicTrailStop = {
  readonly roomId: RoomId;
  readonly pageId: string;
  readonly label: string;
  readonly href: string;
  readonly why: string;
  readonly access: PageAccess;
  readonly accessDescription: string;
};

export type PublicTrail = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly language: "en";
  readonly stops: readonly PublicTrailStop[];
};

export type PublicRoomDirectory = {
  readonly schema: "cambridgetcg.rooms/1";
  readonly language: "en";
  readonly rooms: readonly PublicRoom[];
  readonly trails: readonly PublicTrail[];
};
