// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as http from "http";
import * as https from "https";
import * as _ from "lodash";
import md5 from "md5";
import * as os from "os";
import * as path from "path";
import * as url from "url";
import * as coc from "coc.nvim";
import * as xml2js from "xml2js";

let EXTENSION_PUBLISHER: string;
let EXTENSION_NAME: string;
let EXTENSION_VERSION: string;
let EXTENSION_AI_KEY: string;
let EXTENSION_STORAGE_PATH: string;

export async function loadPackageInfo(context: coc.ExtensionContext): Promise<void> {
    const { publisher, name, version, aiKey } = await fse.readJSON(context.asAbsolutePath("./package.json"));
    EXTENSION_AI_KEY = aiKey;
    EXTENSION_PUBLISHER = publisher;
    EXTENSION_NAME = name;
    EXTENSION_VERSION = version;
    EXTENSION_STORAGE_PATH = context.storagePath;
}

export function getExtensionId(): string {
    return `${EXTENSION_PUBLISHER}.${EXTENSION_NAME}`;
}
export function getVersion(): string {
    return EXTENSION_VERSION;
}
export function getAiKey(): string {
    return EXTENSION_AI_KEY;
}
export function getTempFolder(): string {
    return path.join(os.tmpdir(), getExtensionId());
}

const MAX_REDIRECTS: number = 5;

export async function downloadFile(targetUrl: string, readContent?: boolean, customHeaders?: {}): Promise<string> {
    const tempFilePath: string = path.join(getTempFolder(), md5(targetUrl));
    await fse.ensureDir(getTempFolder());
    if (await fse.pathExists(tempFilePath)) {
        await fse.remove(tempFilePath);
    }
    return await requestFile(targetUrl, tempFilePath, MAX_REDIRECTS, readContent, customHeaders);
}

// the service's error text: the "message" field of a JSON body, else the status text
function errorMessage(res: http.IncomingMessage, body: string): string {
    let message: string = `${res.statusCode} ${res.statusMessage || ""}`.trim();
    try {
        const parsed: any = JSON.parse(body);
        if (parsed && typeof parsed.message === "string" && parsed.message.length > 0) {
            message = parsed.message;
        }
    } catch {
        // not JSON, keep the status text
    }
    return message;
}

function requestFile(targetUrl: string, tempFilePath: string, redirects: number, readContent?: boolean, customHeaders?: {}): Promise<string> {
    return new Promise((resolve: (res: string) => void, reject: (e: Error) => void): void => {
        const urlObj: url.Url = url.parse(targetUrl);
        const options = { headers: { ...customHeaders, "User-Agent": `vscode/${getVersion()}` }, ...urlObj };
        let client: any;
        if (urlObj.protocol === "https:") {
            client = https;
            // tslint:disable-next-line:no-http-string
        } else if (urlObj.protocol === "http:") {
            client = http;
        } else {
            return reject(new Error("Unsupported protocol."));
        }
        client
            .get(options, (res: http.IncomingMessage) => {
                const status: number = res.statusCode || 0;
                const location: string | undefined = res.headers.location;
                if (status >= 300 && status < 400 && location) {
                    res.resume();
                    if (redirects > 0) {
                        const next: string = new URL(location, targetUrl).toString();
                        requestFile(next, tempFilePath, redirects - 1, readContent, customHeaders).then(resolve, reject);
                    } else {
                        reject(new Error(`Too many redirects (${MAX_REDIRECTS}) for ${targetUrl}`));
                    }
                } else if (status >= 400) {
                    let body: string = "";
                    res.setEncoding("utf8");
                    res.on("data", (chunk: string) => {
                        body += chunk;
                    });
                    res.on("end", () => reject(new Error(errorMessage(res, body))));
                    res.on("error", (err: Error) => reject(err));
                } else {
                    let rawData: string;
                    let ws: fse.WriteStream;
                    if (readContent) {
                        rawData = "";
                    } else {
                        ws = fse.createWriteStream(tempFilePath);
                    }
                    res.on("data", (chunk: string | Buffer) => {
                        if (readContent) {
                            rawData += chunk;
                        } else {
                            ws.write(chunk);
                        }
                    });
                    res.on("end", () => {
                        if (readContent) {
                            resolve(rawData);
                        } else {
                            ws.end();
                            ws.on("close", () => {
                                resolve(tempFilePath);
                            });
                        }
                    });
                }
            })
            .on("error", (err: Error) => {
                reject(err);
            });
    });
}

export async function writeFileToStorage(relativePath: string, data: string | Buffer): Promise<void> {
    const filepath: string = path.join(EXTENSION_STORAGE_PATH, relativePath);
    await fse.ensureFile(filepath);
    await fse.writeFile(filepath, data);
}

export async function readFileFromStorage(relativePath: string): Promise<string | null> {
    const filepath: string = path.join(EXTENSION_STORAGE_PATH, relativePath);
    if (await fse.pathExists(filepath)) {
        const buf: Buffer = await fse.readFile(filepath);
        return buf.toString();
    } else {
        return null;
    }
}

export function groupIdValidation(value: string): string | undefined {
    return /^[a-z_][a-z0-9_]*(\.[a-z0-9_]+)*$/.test(value) ? undefined : "Invalid Group Id";
}

export function artifactIdValidation(value: string): string | undefined {
    return /^[a-z_][a-z0-9_]*(-[a-z_][a-z0-9_]*)*$/.test(value) ? undefined : "Invalid Artifact Id";
}

export function packageNameValidation(value: string): string | null {
    return /^[a-z_][a-z0-9_]*(\.[a-z0-9_]+)*$/.test(value) ? null : "Invalid Package Name";
}

export async function readXmlContent(xml: string | undefined, options?: {}): Promise<any> {
    const opts: {} = { explicitArray: true, ...options };
    return new Promise<{}>((resolve: (value: {}) => void, reject: (e: Error) => void): void => {
        xml2js.parseString(xml || "", opts, (err: Error, res: any) => {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        });
    });
}

export function buildXmlContent(obj: any, options?: {}): string {
    const opts: {} = { explicitArray: true, ...options };
    return new xml2js.Builder(opts).buildObject(obj);
}

export async function getTargetPomXml(): Promise<coc.Uri | undefined> {
    if (coc.window.activeTextEditor) {
        const activeUri = coc.window.activeTextEditor.document.uri;
        if ("pom.xml" === path.basename(activeUri).toLowerCase()) {
            return coc.Uri.parse(activeUri);
        }
    }

    const candidates: coc.Uri[] = await coc.workspace.findFiles("**/pom.xml");
    if (!_.isEmpty(candidates)) {
        if (candidates.length === 1) {
            return candidates[0];
        } else {
            return await coc.window
                .showQuickPick(
                    candidates.map((c: coc.Uri) => ({
                        value: c,
                        label: getRelativePathToWorkspaceFolder(c),
                        description: getWorkspaceFolderName(c)
                    })),
                    { placeHolder: "Select the target project." }
                )
                .then((res: any) => res?.value);
        }
    }
    coc.window.showWarningMessage("No pom.xml found in the workspace, open a Maven project.");
    return undefined;
}

function getRelativePathToWorkspaceFolder(file: coc.Uri): string {
    if (file) {
        const wf: coc.WorkspaceFolder | undefined = coc.workspace.getWorkspaceFolder(file);
        if (wf) {
            return path.relative(coc.Uri.parse(wf.uri).fsPath, file.fsPath);
        }
    }
    return "";
}

function getWorkspaceFolderName(file: coc.Uri): string {
    if (file) {
        const wf: coc.WorkspaceFolder | undefined = coc.workspace.getWorkspaceFolder(file);
        if (wf) {
            return wf.name;
        }
    }
    return "";
}
