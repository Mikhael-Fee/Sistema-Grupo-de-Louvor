import type { MinistryData, Person, Profile } from '../types';

/** The person picture takes priority; a linked approved account is a fallback. */
export function getPersonPhoto(person?: Person): string | undefined {
  return person?.photoUrl || person?.accountPhotoUrl || undefined;
}

/** A user's own picture stays independent of the administrator's team picture. */
export function getProfilePhoto(profile: Profile | null | undefined, data: MinistryData): string | undefined {
  if (!profile) return undefined;
  return profile.photoUrl || getPersonPhoto(data.people.find(person => person.id === profile.personId));
}
