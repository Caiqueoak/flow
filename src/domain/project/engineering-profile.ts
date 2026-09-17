export const ENGINEERING_PROFILE_IDS = ['flow/readability-first@1', 'flow/readability-first@2'] as const;

export type EngineeringProfileId = (typeof ENGINEERING_PROFILE_IDS)[number];
