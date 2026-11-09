import { Link } from 'react-router-dom'
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold">
        Confidentialité — entraînements par IA
      </h1>
      <p>
        La génération de QCM est facultative. Sans demande explicite, cette
        fonctionnalité n’envoie aucun cours au fournisseur d’IA.
      </p>
      <p>
        Lorsque vous confirmez une génération, le serveur transmet à OpenAI le
        texte du chapitre enregistré et l’exemple d’évaluation facultatif pour
        produire cinq questions et leurs explications. Les images ne sont pas
        envoyées ou récupérées. Les références textuelles et liens présents dans
        le cours peuvent faire partie du texte transmis.
      </p>
      <p>
        Votre adresse e-mail, votre nom de compte et votre historique de
        réponses ne sont pas ajoutés à cette requête. Le cours peut néanmoins
        contenir des données personnelles que vous y avez écrites. Retirez les
        informations sensibles avant de confirmer.
      </p>
      <p>
        Le serveur demande de ne pas stocker la réponse pour une récupération
        ultérieure par l’API (store: false). Cela ne garantit pas une absence de
        conservation chez le fournisseur : ses règles de journalisation, de
        sécurité et les paramètres contractuels du compte utilisé s’appliquent.
      </p>
      <p>
        <a
          className="text-indigo-600 underline"
          href="https://developers.openai.com/api/docs/guides/your-data"
          target="_blank"
          rel="noreferrer"
        >
          Consulter les règles de traitement des données d’OpenAI
        </a>
      </p>
      <p>
        L’application conserve les QCM, leurs corrigés, vos choix, vos scores et
        les dates de tentative dans votre compte. Les demandes de génération et
        leur date sont aussi conservées pour appliquer les quotas et éviter les
        doubles appels. Un identifiant de version de cette information
        accompagne chaque QCM.
      </p>
      <p>
        Supprimer un chapitre supprime ses QCM et tentatives. Un registre
        minimal des demandes (identifiant, compte, statut, date) est conservé
        pour empêcher le contournement des quotas. Supprimer le compte supprime
        aussi ce registre. Les exports complets incluent ces données.
      </p>
      <p>
        Le score QCM est calculé sans IA, en comparant les réponses au corrigé
        enregistré. Le corrigé généré peut contenir des erreurs. Il s’agit d’un
        entraînement, pas d’une note officielle. Aucune correction de question
        ouverte n’est proposée dans cette version.
      </p>
      <Link className="text-indigo-600 underline" to="/profil">
        Retour au profil
      </Link>
    </main>
  )
}
