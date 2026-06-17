import { mergeAttributes, Node, nodeInputRule } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";

export const NoteTag = Node.create({
  name: "noteTag",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      tag: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-note-tag]",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const tag = String(node.attrs.tag ?? HTMLAttributes.tag ?? "");
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-note-tag": tag,
        contenteditable: "false",
        class: "note-tag-chip",
      }),
      tag,
    ];
  },

  renderText({ node }) {
    return String(node.attrs.tag ?? "");
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: /(?:^|\s)#([A-Za-z0-9_-]{1,24})$/,
        type: this.type,
        getAttributes: (match) => ({
          tag: match[1],
        }),
      }),
    ];
  },
});

export function buildNoteEditorExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
    }),
    Placeholder.configure({
      placeholder: "Start writing…",
      showOnlyWhenEditable: true,
      showOnlyCurrent: false,
    }),
    TextStyle,
    Color.configure({ types: ["textStyle"] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    NoteTag,
  ];
}
