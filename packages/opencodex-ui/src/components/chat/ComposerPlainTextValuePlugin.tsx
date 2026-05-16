/**
 * Keeps the Lexical composer aligned with the parent plain-text value.
 */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { useEffect } from "react";

type ComposerPlainTextValuePluginProps = {
  value: string;
};

/**
 * Synchronizes external plain text into the Lexical editor.
 *
 * @param props Component props.
 * @returns Nothing.
 */
export function ComposerPlainTextValuePlugin({ value }: ComposerPlainTextValuePluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const currentValue = editor.getEditorState().read(() => $getRoot().getTextContent());

    if (currentValue === value) {
      return;
    }

    editor.update(
      () => {
        const root = $getRoot();
        const paragraph = $createParagraphNode();

        root.clear();

        if (value.length > 0) {
          paragraph.append($createTextNode(value));
        }

        root.append(paragraph);
        paragraph.selectEnd();
      },
      { tag: "external-value" }
    );
  }, [editor, value]);

  return null;
}
