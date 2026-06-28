"use client";

import * as React from "react";
import { Node, mergeAttributes, nodeInputRule } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { cn } from "@/lib/utils";

/**
 * Editor de template de mensagem com as variáveis ({nome}, {data}, {hora},
 * {clinica}) renderizadas como "chips" atômicos: o usuário não consegue editar
 * por dentro nem quebrar a tag apagando uma chave. Clicar no × do chip remove a
 * variável inteira; Backspace também apaga o chip como uma unidade.
 *
 * A FONTE DA VERDADE continua sendo a string `{nome}...` — o editor serializa
 * para essa string no onChange e a reconstrói no carregamento, então o backend,
 * o Zod e o `formatTemplatePreview` permanecem idênticos (zero mudança no
 * contrato de dados). Pedido da sócia (2026-06-27).
 */

export const TEMPLATE_VARS = ["nome", "data", "hora", "clinica"] as const;
export type TemplateVar = (typeof TEMPLATE_VARS)[number];

const VARIABLE_REGEX = /\{(nome|data|hora|clinica)\}/g;

export function usesAnyVariable(template: string): boolean {
  return TEMPLATE_VARS.some((v) => template.includes(`{${v}}`));
}

export type TemplateEditorHandle = {
  insertVariable: (name: string) => void;
  focus: () => void;
};

// --- Variable node ----------------------------------------------------------
// Usa um node view DOM nativo (não React) de propósito: o ReactNodeViewRenderer
// do TipTap v3 chama flushSync ao renderizar os node views, o que dispara o erro
// "flushSync was called from inside a lifecycle method" durante o render do
// React. Um node view manual em DOM puro evita isso e mantém o chip + botão ×.

const CHIP_CLASS =
  "tpl-chip mx-0.5 inline-flex select-none items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 align-baseline text-sm font-medium text-secondary-foreground";
const CHIP_X_CLASS =
  "-mr-0.5 flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-full text-secondary-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground";
const CHIP_X_SVG =
  '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';

const Variable = Node.create({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-variable"),
        renderHTML: (attrs) => ({ "data-variable": attrs.name }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-variable]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-variable": node.attrs.name }),
      `{${node.attrs.name}}`,
    ];
  },

  renderText({ node }) {
    return `{${node.attrs.name}}`;
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const name = node.attrs.name as string;
      const dom = document.createElement("span");
      dom.className = CHIP_CLASS;
      dom.contentEditable = "false";
      dom.setAttribute("data-variable", name);

      const label = document.createElement("span");
      label.textContent = `{${name}}`;
      dom.appendChild(label);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.tabIndex = -1;
      btn.className = CHIP_X_CLASS;
      btn.setAttribute("aria-label", `Remover variável ${name}`);
      btn.innerHTML = CHIP_X_SVG;
      // mousedown + preventDefault: remove sem o editor roubar a seleção antes.
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const pos = typeof getPos === "function" ? getPos() : null;
        if (typeof pos === "number") {
          editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
          editor.view.focus();
        }
      });
      dom.appendChild(btn);

      return { dom };
    };
  },

  // Digitar `{nome}` manualmente também vira chip. IMPORTANTE: o grupo é
  // NÃO-capturante de propósito — com grupo de captura o nodeInputRule do TipTap
  // substitui só a palavra capturada e preserva as chaves (vira `{` + chip + `}`
  // = `{{nome}}`). Sem captura, ele substitui o match inteiro `{nome}` pelo chip.
  addInputRules() {
    return [
      nodeInputRule({
        find: /\{(?:nome|data|hora|clinica)\}$/,
        type: this.type,
        getAttributes: (match) => ({ name: match[0].slice(1, -1) }),
      }),
    ];
  },
});

// --- Serialização (doc <-> string) -----------------------------------------

function serialize(doc: PMNode): string {
  const lines: string[] = [];
  doc.forEach((block) => {
    let line = "";
    block.forEach((inline) => {
      if (inline.type.name === "variable") {
        line += `{${inline.attrs.name}}`;
      } else if (inline.type.name === "hardBreak") {
        line += "\n";
      } else if (inline.isText) {
        line += inline.text ?? "";
      }
    });
    lines.push(line);
  });
  return lines.join("\n");
}

type InlineJSON =
  | { type: "text"; text: string }
  | { type: "variable"; attrs: { name: string } };

function lineToInline(line: string): InlineJSON[] {
  if (!line) return [];
  const parts: InlineJSON[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  VARIABLE_REGEX.lastIndex = 0;
  while ((m = VARIABLE_REGEX.exec(line)) !== null) {
    if (m.index > last) parts.push({ type: "text", text: line.slice(last, m.index) });
    parts.push({ type: "variable", attrs: { name: m[1] } });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ type: "text", text: line.slice(last) });
  return parts;
}

function parse(text: string) {
  const lines = (text ?? "").split("\n");
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: lineToInline(line),
    })),
  };
}

// --- Component --------------------------------------------------------------

type TemplateEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  id?: string;
  invalid?: boolean;
};

export const TemplateEditor = React.forwardRef<TemplateEditorHandle, TemplateEditorProps>(
  function TemplateEditor({ value, onChange, placeholder, onFocus, id, invalid }, ref) {
    // Refs para evitar closures velhas dentro dos callbacks do editor.
    const onChangeRef = React.useRef(onChange);
    const onFocusRef = React.useRef(onFocus);
    onChangeRef.current = onChange;
    onFocusRef.current = onFocus;

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          bold: false,
          italic: false,
          strike: false,
          code: false,
          heading: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          link: false,
          underline: false,
          trailingNode: false,
        }),
        Placeholder.configure({ placeholder: placeholder ?? "" }),
        Variable,
      ],
      content: parse(value),
      editorProps: {
        attributes: {
          id: id ?? "",
          role: "textbox",
          "aria-multiline": "true",
          class:
            "min-h-[7.5rem] max-h-60 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-base outline-none md:text-sm",
        },
      },
      onUpdate: ({ editor }) => {
        onChangeRef.current(serialize(editor.state.doc));
      },
      onFocus: () => {
        onFocusRef.current?.();
      },
    });

    // Sincroniza quando o valor muda por fora (load das settings / reset).
    React.useEffect(() => {
      if (!editor) return;
      const current = serialize(editor.state.doc);
      if (value !== current) {
        editor.commands.setContent(parse(value), { emitUpdate: false });
      }
    }, [value, editor]);

    React.useImperativeHandle(
      ref,
      () => ({
        insertVariable: (name: string) => {
          editor?.chain().focus().insertContent({ type: "variable", attrs: { name } }).run();
        },
        focus: () => editor?.chain().focus().run(),
      }),
      [editor],
    );

    return (
      <div
        data-invalid={invalid ? "" : undefined}
        className={cn(
          "rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] dark:bg-input/30",
          "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
          "data-[invalid]:border-destructive data-[invalid]:ring-destructive/20",
        )}
      >
        <EditorContent editor={editor} />
      </div>
    );
  },
);
