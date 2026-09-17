/**
 * Page témoin, volontairement inerte.
 *
 * Aucun import, aucune variable d'environnement, aucun appel réseau, et
 * exclue du proxy. Si elle s'affiche alors que le reste du site renvoie
 * une erreur, la panne vient du proxy ou de la configuration. Si elle
 * échoue elle aussi, c'est le déploiement lui-même qui ne démarre pas —
 * version de Node, sortie de build, ou plateforme.
 *
 * C'est le seul point du site qui ne peut rien avoir cassé.
 */
export const dynamic = "force-static";

export default function Ping() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 32 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>ping</h1>
      <p style={{ fontSize: 14, color: "#52514e", marginTop: 8 }}>
        Cette page s&apos;affiche : le déploiement démarre et sert du contenu. La panne est
        donc ailleurs — proxy, configuration, ou rendu des autres pages.
      </p>
    </main>
  );
}
