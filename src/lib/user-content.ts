// Shared constants/types for user-created homebrew content. Kept out of the
// "use server" actions file, which may only export async functions.

// A character records a chosen custom feat as `user-feat:{id}` so it never
// collides with a real SRD feat slug.
export const USER_FEAT_PREFIX = "user-feat:";

export interface UserContentResult {
  success: boolean;
  error?: string;
}
