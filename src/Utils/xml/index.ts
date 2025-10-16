// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Element, isTag, Node } from "domhandler";
import * as coc from "coc.nvim";
import { UserError } from "../error";
import { getNodesByTag, XmlTagName } from "./lexer";
import { platform } from "os";

export async function updatePom(uri: coc.Uri, deps: IArtifact[], boms: IBom[]) {
    const edit: coc.WorkspaceEdit = { changes: {} };
    const projectNode: Element = await getActiveProjectNode(uri);
    const dependenciesNode: Element | undefined =
        projectNode.children && (projectNode.children.find((node) => isTag(node) && node.tagName === XmlTagName.Dependencies) as Element);
    if (dependenciesNode !== undefined) {
        await updateWorkspaceEdit(edit, uri, dependenciesNode, new DependencyNodes(deps));
    } else {
        await updateWorkspaceEdit(edit, uri, projectNode, new DependencyNodes(deps, { initParent: true }));
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
                await updateWorkspaceEdit(edit, uri, depsNodes, new BOMNodes(boms));
            } else {
                await updateWorkspaceEdit(edit, uri, depMgmtNode, new BOMNodes(boms, { parents: ["dependencies"] }));
            }
        } else {
            await updateWorkspaceEdit(edit, uri, projectNode, new BOMNodes(boms, { parents: ["dependencies", "dependencyManagement"] }));
        }
    }

    coc.workspace.applyEdit(edit);
}

async function getActiveProjectNode(uri: coc.Uri): Promise<Element> {
    const baseDocument: coc.Document = await coc.workspace.openTextDocument(uri);
    const content: string | undefined = baseDocument.textDocument.getText();
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

async function updateWorkspaceEdit(
    edit: coc.WorkspaceEdit,
    uri: coc.Uri,
    parentNode: Element,
    nodeToInsert: PomNode
): Promise<coc.WorkspaceEdit> {
    const baseDocument: coc.Document = await coc.workspace.openTextDocument(uri);
    const currentDocument: coc.TextDocument = baseDocument.textDocument;
    const baseIndent: string = getIndentation(currentDocument, parentNode.startIndex);

    let insertOffset = (parentNode.endIndex as number) - (parentNode.name.length + 3) /* "</parentNode>".length */ + 1;
    let insertPos: coc.Position = currentDocument.positionAt(insertOffset);
    // Not to mess up indentation, move cursor to line start:
    // <tab><tab>|</dependencies>  =>  |<tab><whitespace></dependencies>
    const insPosLineStart: coc.Position = coc.Position.create(insertPos.line, 0);
    const contentBefore: string = currentDocument.getText(coc.Range.create(insPosLineStart, insertPos));
    if (contentBefore.trim() === "") {
        insertOffset -= insertPos.character;
        insertPos = insPosLineStart;
    }

    await focusCurrentResource(currentDocument.uri);
    const textEditor: coc.TextEditor = coc.window.activeTextEditor as coc.TextEditor;
    const options: coc.TextEditorOptions = textEditor.options;
    const indent: string = options.insertSpaces ? " ".repeat(options.tabSize) : "\t";
    const eol: string = platform() !== "win32" ? "\n" : "\r\n";
    const targetText: string = constructNodeText(nodeToInsert, baseIndent, indent, eol);
    const textEdit: coc.TextEdit = coc.TextEdit.insert(insertPos, targetText);

    edit.changes ??= {};
    edit.changes[currentDocument.uri] = [textEdit];
    return edit;
}

/**
 * src: \t\t<position>...
 * returns "\t\t"
 */
function getIndentation(document: coc.TextDocument, offset: number | null): string {
    const pos: coc.Position = document.positionAt(offset as number);
    const lineContentToPos = document.getText(coc.Range.create(coc.Position.create(pos.line, 0), pos));
    const m = RegExp(/^\s+/).exec(lineContentToPos);
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
