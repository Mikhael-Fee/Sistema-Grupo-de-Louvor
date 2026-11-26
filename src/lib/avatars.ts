import type { MinistryData, Person, Profile } from '../types';

/**
 * The photo a linked member chose in their own profile wins everywhere, so a new
 * photo shows up in the team right away; the administrator's team photo is the fallback.
 */
export function getPersonPhoto(person?: Person): string | undefined {
  return person?.accountPhotoUrl || person?.photoUrl || undefined;
}

/** A user's own picture first; the administrator's team picture is the fallback. */
export function getProfilePhoto(profile: Profile | null | undefined, data: MinistryData): string | undefined {
  if (!profile) return undefined;
  // The account photo of the linked person is this same profile photo, so only the team photo is a fallback.
  return profile.photoUrl || data.people.find(person => person.id === profile.personId)?.photoUrl || undefined;
}
