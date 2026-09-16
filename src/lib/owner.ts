/**
 * L'app est mono-utilisateur. OWNER_EMAIL est la seule adresse
 * autorisée à ouvrir une session — vérifiée avant l'envoi du lien de
 * connexion, puis à chaque requête dans le proxy.
 *
 * Comme toutes les variables de cette application, elle reste côté
 * serveur : aucune n'a de préfixe NEXT_PUBLIC_, donc aucune n'est
 * embarquée dans le bundle JavaScript.
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
