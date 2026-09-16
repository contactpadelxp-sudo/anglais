/**
 * L'app est mono-utilisateur. OWNER_EMAIL est la seule adresse
 * autorisée à ouvrir une session — vérifiée avant l'envoi du lien de
 * connexion, puis à chaque requête dans le proxy.
 *
 * Cette variable n'est jamais exposée au navigateur : sans préfixe
 * NEXT_PUBLIC_, elle reste côté serveur.
 */
export function ownerEmail(): string | null {
  const raw = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return raw ? raw : null;
}

export function isOwner(email: string | null | undefined): boolean {
  const owner = ownerEmail();
  // Pas d'OWNER_EMAIL configuré : on n'invente pas de propriétaire, le
  // premier compte créé fait foi (utile au tout premier démarrage).
  if (!owner) return true;
  return email?.trim().toLowerCase() === owner;
}
