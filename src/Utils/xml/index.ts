// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Element, isTag, Node } from "domhandler";
import * as coc from "coc.nvim";
import { UserError } from "../error";
import { getNodesByTag, XmlTagName } from "./lexer";
import * as fs from "fs";

interface PomText {
    text: string;
    eol: string;
    indent: string;
    document: coc.Document | undefined;
}

interface PomInsert {
    offset: number;
    text: string;
}

/**
 * Adds the dependencies and BOMs to the pom, whatever its editor state: a loaded document (focused, in another
 * window or in the background) is edited in its buffer, a pom that is not open is edited on disk without loading
 * it. Neither depends on the active editor nor focuses a window.
 */
export async function updatePom(uri: coc.Uri, deps: IArtifact[], boms: IBom[]) {
    const pom: PomText = await readPom(uri);
    const inserts: PomInsert[] = [];
    const projectNode: Element = getProjectNode(pom.text);
    const dependenciesNode: Element | undefined =
        projectNode.children && (projectNode.children.find((node) => isTag(node) && node.tagName === XmlTagName.Dependencies) as Element);
    if (dependenciesNode !== undefined) {
        inserts.push(insertInto(pom, dependenciesNode, new DependencyNodes(deps)));
    } else {
        inserts.push(insertInto(pom, projectNode, new DependencyNodes(deps, { initParent: true })));
    }

    if (boms && boms.length > 0) {
        const depMgmtNode: Element | undefined =
            projectNode.children &&
            (projectNode.children.find((node) => isTag(node) && node.tagName === XmlTagName.DependencyManagement) as Element);
        if (depMgmtNode !== undefined) {
            const depsNodes: Element | undefined =
                depMgmtNode.children &&
                (depMgmtNode.children.find((node) => isTag(node) && node.tagName === XmlTagName.Dependencies) as Element);
            if (depsNodes !== undefined) {
                inserts.push(insertInto(pom, depsNodes, new BOMNodes(boms)));
            } else {
                inserts.push(insertInto(pom, depMgmtNode, new BOMNodes(boms, { parents: ["dependencies"] })));
            }
        } else {
            inserts.push(insertInto(pom, projectNode, new BOMNodes(boms, { parents: ["dependencies", "dependencyManagement"] })));
        }
    }

    if (pom.document !== undefined) {
        const textDocument: coc.TextDocument = pom.document.textDocument;
        const edits: coc.TextEdit[] = inserts.map((ins) => coc.TextEdit.insert(textDocument.positionAt(ins.offset), ins.text));
        await coc.workspace.applyEdit({ changes: { [textDocument.uri]: edits } });
    } else {
        let text: string = pom.text;
        for (const ins of [...inserts].sort((x, y) => y.offset - x.offset)) {
            text = text.slice(0, ins.offset) + ins.text + text.slice(ins.offset);
        }
        await fs.promises.writeFile(uri.fsPath, text, "utf8");
    }
}

async function readPom(uri: coc.Uri): Promise<PomText> {
    const document: coc.Document | null | undefined = coc.workspace.getDocument(uri.toString());
    let pom: PomText;
    if (document && document.attached) {
        const text: string = document.textDocument.getText();
        const options: coc.FormattingOptions = await coc.workspace.getFormatOptions(document.uri);
        const indent: string = options.insertSpaces ? " ".repeat(options.tabSize) : "\t";
        pom = { text, eol: document.textDocument.getText().includes("\r\n") ? "\r\n" : "\n", indent, document };
    } else {
        const text: string = await fs.promises.readFile(uri.fsPath, "utf8");
        pom = { text, eol: text.includes("\r\n") ? "\r\n" : "\n", indent: inferIndent(text), document: undefined };
    }
    return pom;
}

/**
 * The indent unit of a pom that is not loaded: the indentation of the first child line of <project>, else 4 spaces.
 */
function inferIndent(text: string): string {
    const m = RegExp(/<project\b[^>]*>[^\S\n]*\r?\n(?:[^\S\n]*\r?\n)*([ \t]+)</).exec(text);
    return m ? m[1] : "    ";
}

function getProjectNode(content: string): Element {
    const projectNodes: Node[] = getNodesByTag(content, XmlTagName.Project);
    if (projectNodes === undefined || projectNodes.length !== 1) {
        throw new UserError("Only support POM file with single <project> node.");
    }

    return projectNodes[0] as Element;
}

function constructNodeText(nodeToInsert: PomNode, baseIndent: string, indent: string, eol: string): string {
    const lines: string[] = nodeToInsert.getTextLines(indent);
    return ["", ...lines].join(`${eol}${baseIndent}${indent}`) + eol;
}

function insertInto(pom: PomText, parentNode: Element, nodeToInsert: PomNode): PomInsert {
    const baseIndent: string = getIndentation(pom.text, parentNode.startIndex as number);
    let insertOffset = (parentNode.endIndex as number) - (parentNode.name.length + 3) /* "</parentNode>".length */ + 1;
    // Not to mess up indentation, move to the line start:
    // <tab><tab>|</dependencies>  =>  |<tab><whitespace></dependencies>
    const lineStart: number = pom.text.lastIndexOf("\n", insertOffset - 1) + 1;
    if (pom.text.slice(lineStart, insertOffset).trim() === "") {
        insertOffset = lineStart;
    }
    return { offset: insertOffset, text: constructNodeText(nodeToInsert, baseIndent, pom.indent, pom.eol) };
}

/**
 * src: \t\t<position>...
 * returns "\t\t"
 */
function getIndentation(text: string, offset: number): string {
    const lineStart: number = text.lastIndexOf("\n", offset - 1) + 1;
    const m = RegExp(/^[ \t]+/).exec(text.slice(lineStart, offset));
    return m ? m[0] : "";
}

interface IArtifact {
    groupId: string;
    artifactId: string;
    version?: string;
    scope?: string;
}

interface IBom {
    groupId: string;
    artifactId: string;
    version: string;
    scope?: string;
    type?: string;
}

abstract class PomNode {
    protected static wrapWithParentNode(lines: string[], indent: string, parent: string) {
        return [`<${parent}>`, ...lines.map((line) => `${indent}${line}`), `</${parent}>`];
    }

    public abstract getTextLines(indent: string): string[];
}

class DependencyNodes extends PomNode {
    constructor(
        private readonly artifacts: IArtifact[],
        private readonly options?: { initParent?: boolean }
    ) {
        super();
    }

    public getTextLines(indent: string): string[] {
        const listOfLines: string[] = [];
        listOfLines.push(...this.artifacts.flatMap((artifact) => this.toTextLine(artifact, indent)));
        if (this.options?.initParent) {
            return PomNode.wrapWithParentNode(listOfLines, indent, "dependencies");
        } else {
            return listOfLines;
        }
    }

    private toTextLine(artifact: IArtifact, indent: string): string[] {
        const { groupId, artifactId, version, scope } = artifact;
        const lines: string[] = [
            `<groupId>${groupId}</groupId>`,
            `<artifactId>${artifactId}</artifactId>`,
            version && `<version>${version}</version>`,
            scope && scope !== "compile" && `<scope>${scope}</scope>`
        ].filter(Boolean) as string[];
        return PomNode.wrapWithParentNode(lines, indent, "dependency");
    }
}

export async function focusCurrentResource(location: coc.Uri | string, alternateWindowId?: number, openCommand?: string): Promise<void> {
    const stringUri: string = typeof location === "string" ? location : location.toString();
    const textEditor: coc.TextEditor | undefined = coc.window.activeTextEditor;
    if (textEditor?.document.uri !== stringUri) {
        let visibleEditor: coc.TextEditor | undefined = undefined;
        for (const editor of coc.window.visibleTextEditors) {
            if (stringUri === editor?.document.uri) {
                visibleEditor = editor;
                break;
            }
        }
        if (visibleEditor?.winid) {
            await coc.workspace.nvim.call("win_gotoid", [visibleEditor.winid]);
            return;
        }
    }

    if (alternateWindowId !== undefined) {
        await coc.workspace.nvim.call("win_gotoid", [alternateWindowId]);
    }
    await coc.workspace.jumpTo(location, null, openCommand);
}

class BOMNodes extends PomNode {
    constructor(
        private readonly boms: IBom[],
        private readonly options?: { parents?: string[] }
    ) {
        super();
    }

    public getTextLines(indent: string): string[] {
        let listOfLines: string[] = this.boms.flatMap((bom) => this.bomToTextLine(bom, indent));
        if (this.options?.parents) {
            for (const parent of this.options.parents) {
                // @Note: this mutates list of lines and feeds them back into the method
                // it will wrap the list of lines on each iteration with the parent node
                // i.e dependencyManagement targ parent will wrap around dependency tag
                listOfLines = PomNode.wrapWithParentNode(listOfLines, indent, parent);
            }
        }
        return listOfLines;
    }

    private bomToTextLine(bom: IBom, indent: string): string[] {
        const { groupId, artifactId, version } = bom;
        const lines: string[] = [
            `<groupId>${groupId}</groupId>`,
            `<artifactId>${artifactId}</artifactId>`,
            `<version>${version}</version>`,
            `<type>pom</type>`,
            `<scope>import</scope>`
        ];
        return PomNode.wrapWithParentNode(lines, indent, "dependency");
    }
}
