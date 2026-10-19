import { languages } from "@codemirror/language-data";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import "katex/dist/katex.min.css";
import { useRef } from "react";
import "./editor.css";

interface Props {
  /** Markdown initial : lu une seule fois, l'éditeur est ensuite la source de vérité. */
  initial: string;
  onChange: (markdown: string) => void;
}

function Inner({ initial, onChange }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: initial,
      // Pas de téléversement d'images en V1 : on désactive le bloc image (les liens Markdown restent possibles).
      features: { [Crepe.Feature.ImageBlock]: false },
      featureConfigs: {
        // Coloration syntaxique : la liste complète des langages CodeMirror, chargés à la demande.
        [Crepe.Feature.CodeMirror]: { languages },
        [Crepe.Feature.Placeholder]: { text: "Écrivez vos notes… tapez / pour insérer un bloc, $$ pour une formule" },
      },
    });
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, previous) => {
        if (markdown !== previous) onChangeRef.current(markdown);
      });
    });
    return crepe;
  }, []);

  return <Milkdown />;
}

export default function MarkdownEditor(props: Props) {
  return (
    <MilkdownProvider>
      <div className="chapter-editor"><Inner {...props} /></div>
    </MilkdownProvider>
  );
}
