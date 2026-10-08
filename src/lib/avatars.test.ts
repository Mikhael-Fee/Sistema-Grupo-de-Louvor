import { describe, expect, it } from 'vitest';
import { getPersonPhoto, getProfilePhoto } from './avatars';
import type { MinistryData, Person, Profile } from '../types';

const PERSON_PHOTO = 'https://project.supabase.co/storage/v1/object/public/avatars/person/photo.webp';
const ACCOUNT_PHOTO = 'https://project.supabase.co/storage/v1/object/public/avatars/account/photo.webp';
const person = (photos: Partial<Person> = {}): Person => ({ id: 'person', name: 'Ana', email: '', functions: ['Voz'], ...photos });
const profile = (photos: Partial<Profile> = {}): Profile => ({ id: 'account', name: 'Ana', role: 'musician', approved: true, personId: 'person', ...photos });
const data = (people: Person[]): MinistryData => ({ people, songs: [], tags: [], services: [] });

describe('fotos próprias e vinculadas', () => {
  it('prioriza a foto própria da pessoa sem modificar a foto da conta', () => {
    const linkedPerson = Object.freeze(person({ photoUrl: PERSON_PHOTO, accountPhotoUrl: ACCOUNT_PHOTO }));
    expect(getPersonPhoto(linkedPerson)).toBe(PERSON_PHOTO);
    expect(linkedPerson).toMatchObject({ photoUrl: PERSON_PHOTO, accountPhotoUrl: ACCOUNT_PHOTO });
  });

  it('usa a foto da conta quando a pessoa não possui uma foto própria', () => {
    const linkedPerson = Object.freeze(person({ photoUrl: '', accountPhotoUrl: ACCOUNT_PHOTO }));
    expect(getPersonPhoto(linkedPerson)).toBe(ACCOUNT_PHOTO);
    expect(linkedPerson.photoUrl).toBe('');
    expect(linkedPerson.accountPhotoUrl).toBe(ACCOUNT_PHOTO);
  });

  it('deixa as iniciais disponíveis quando não existe foto ou pessoa', () => {
    expect(getPersonPhoto(person({ photoUrl: '', accountPhotoUrl: '' }))).toBeUndefined();
    expect(getPersonPhoto()).toBeUndefined();
  });

  it('prioriza a foto própria do perfil sobre a foto da pessoa vinculada', () => {
    const ownProfile = Object.freeze(profile({ photoUrl: ACCOUNT_PHOTO }));
    const linkedPerson = Object.freeze(person({ photoUrl: PERSON_PHOTO }));
    expect(getProfilePhoto(ownProfile, data([linkedPerson]))).toBe(ACCOUNT_PHOTO);
    expect(ownProfile.photoUrl).toBe(ACCOUNT_PHOTO);
    expect(linkedPerson.photoUrl).toBe(PERSON_PHOTO);
  });

  it('usa primeiro a foto própria da pessoa quando o perfil não possui foto', () => {
    const linkedPerson = Object.freeze(person({ photoUrl: PERSON_PHOTO, accountPhotoUrl: ACCOUNT_PHOTO }));
    expect(getProfilePhoto(profile({ photoUrl: '' }), data([linkedPerson]))).toBe(PERSON_PHOTO);
    expect(linkedPerson.accountPhotoUrl).toBe(ACCOUNT_PHOTO);
  });

  it('não inventa uma foto quando o perfil e seu vínculo estão sem foto', () => {
    expect(getProfilePhoto(profile({ photoUrl: '' }), data([person({ photoUrl: '', accountPhotoUrl: '' })]))).toBeUndefined();
    expect(getProfilePhoto(profile({ personId: undefined }), data([person({ photoUrl: PERSON_PHOTO })]))).toBeUndefined();
    expect(getProfilePhoto(null, data([]))).toBeUndefined();
  });
});
